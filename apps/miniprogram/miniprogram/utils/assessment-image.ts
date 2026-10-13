import { buildAssessmentReportPlainText, formatAssessmentDate, type AssessmentReportExportContext } from './assessment-report-export'
import { beijingDate } from './consultation-payload'

export const REPORT_WIDTH = 750
export const REPORT_TILE_HEIGHT = 800
export const WATERMARK_ALPHA = .30
export const WATERMARK_ANGLE = -25 * Math.PI / 180

export type ReportLine = {text: string; y: number; size: number; heading: boolean}
export type ReportLayout = {width: number; height: number; lines: ReportLine[]; identity: string; name: string; date: string}

export function wrapReportText(text: string, measure: (text: string) => number, width = 650): string[] {
  return text.split(/\r?\n/).flatMap(paragraph => {
    const lines: string[] = []
    let line = ''
    for (const char of paragraph) {
      if (line && measure(line + char) > width) { lines.push(line); line = char } else line += char
    }
    lines.push(line)
    return lines
  })
}

export function summaryReport(context: AssessmentReportExportContext): string {
  const output = context.assessment.output
  if (!output) throw new Error('评估结果尚未生成')
  const short = (value: string, max: number) => [...value].length > max ? [...value].slice(0,max).join('') + '…' : value
  return ['九辰教育｜AI 评估摘要图', '摘要选取各项前 2 条；详细条件、证据和行动请查看完整报告。',
    '背景与结论', short(output.profileSummary,160),
    ...(output.strengths.length ? ['主要优势',...output.strengths.slice(0,2).map(i=>short(i.title+'：'+i.detail,90))] : []),
    ...(output.risks.length ? ['风险与不足',...output.risks.slice(0,2).map(i=>short(i.title+'：'+i.detail,90))] : []),
    ...(output.targetAssessments.length ? ['目标建议',...output.targetAssessments.slice(0,2).map(i=>short(i.schoolName+(i.programName?' · '+i.programName:'')+'：'+i.rationale,90))] : []),
    ...(output.recommendedActions.length ? ['关键行动',...output.recommendedActions.slice(0,2).map(i=>short(i.title+'：'+i.rationale,90))] : []),
    '免责声明',output.disclaimer,
  ].join('\n')
}

export function layoutAssessmentImage(context: AssessmentReportExportContext, userId: string,
  kind: 'summary'|'long', measure: (text:string,size:number)=>number, date=beijingDate()): ReportLayout {
  if (!userId) throw new Error('缺少可展示的用户编号，请先绑定学员身份')
  if(context.assessment.status!=='succeeded'||!context.assessment.output) throw new Error('当前报告不可导出')
  const name=context.displayName.trim() && context.displayName.trim()!=='微信用户' ? context.displayName.trim() : '待完善姓名'
  const identity=`${name} ｜ 用户ID：${userId}\n导出日期：${date}`
  const text=kind==='long' ? buildAssessmentReportPlainText(context) : summaryReport(context)
  const paragraphs=[identity,`评估编号：${context.assessment.id}`,`报告日期：${formatAssessmentDate(context.assessment.completedAt || context.assessment.updatedAt)}`,'',text,'',identity]
  const lines: ReportLine[]=[]
  let y=42
  paragraphs.forEach(paragraph=>paragraph.split('\n').forEach(p=>{
    const heading=/^[一二三四五六七八九十]+、|^九辰|^免责声明$|^背景与结论$|^主要优势$|^风险与不足$|^目标建议$|^关键行动$|^学业背景与评估概要$/.test(p)
    const size=heading?30:25
    wrapReportText(p,t=>measure(t,size)).forEach(text=>{lines.push({text,y,size,heading});y+=heading?48:38})
  }))
  const height=Math.ceil(y+42)
  if(height*REPORT_WIDTH>15000000) throw new Error('报告超出单张长图资源预算，请使用文本报告联系老师')
  return {width:REPORT_WIDTH,height,lines,identity,name,date}
}

/** Background first; watermark then body. No opaque cards cover the watermark. */
export function drawReportStrip(ctx: WechatMiniprogram.CanvasContext, layout: ReportLayout, userId:string, offset:number, height:number) {
  ctx.setFillStyle('#ffffff');ctx.fillRect(0,0,layout.width,height)
  ctx.save();ctx.setGlobalAlpha(WATERMARK_ALPHA);ctx.setFillStyle('#b4becb');ctx.setFontSize(23)
  const mark=`${layout.name} · 用户ID：${userId} · ${layout.date}`
  const spacing=Math.max(520,ctx.measureText(mark).width+80)
  // Absolute coordinates preserve the grid across adjacent strips.
  for(let y=Math.floor((offset-600)/260)*260;y<offset+height+600;y+=260){
    const stagger=(Math.abs(y/260)%2)*spacing/2
    for(let x=-spacing;x<layout.width+spacing;x+=spacing){
      ctx.save();ctx.translate(x+stagger,y-offset);ctx.rotate(WATERMARK_ANGLE);ctx.fillText(mark,0,0);ctx.restore()
    }
  }
  ctx.restore();ctx.setGlobalAlpha(1);ctx.setTextBaseline('top')
  layout.lines.filter(line=>line.y+48>offset && line.y<offset+height).forEach(line=>{
    ctx.setFontSize(line.size);ctx.setFillStyle(line.heading?'#18202a':'#414b58');ctx.fillText(line.text||' ',50,line.y-offset)
  })
}
