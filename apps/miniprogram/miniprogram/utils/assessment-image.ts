import { formatAssessmentDate, traceableAssessmentCaseId, type AssessmentReportExportContext } from './assessment-report-export'
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

function short(value: string, max: number) {
  const chars = [...value.trim()]
  return chars.length > max ? chars.slice(0, max).join('') + '…' : chars.join('')
}

function section(lines: string[], title: string, values: string[], limit: number) {
  lines.push(title)
  if (!values.length) {
    lines.push('暂无明确结论')
    return
  }
  values.slice(0, limit).forEach((value) => lines.push(`• ${short(value, 110)}`))
}

export function shareReport(context: AssessmentReportExportContext, kind: 'summary'|'long'): string {
  const output = context.assessment.output
  if (!output) throw new Error('评估结果尚未生成')
  const limit = kind === 'summary' ? 2 : 4
  const lines = [
    '九辰教育 AI评估报告',
    kind === 'summary' ? '摘要图片｜重点结论' : '完整长图｜分享摘要',
    '核心结论',
    short(output.profileSummary, kind === 'summary' ? 180 : 280),
  ]
  section(lines, '优势', output.strengths.map(item => `${item.title}：${item.detail}`), limit)
  section(lines, '风险', output.risks.map(item => `${item.title}：${item.detail}`), limit)
  section(lines, '目标建议', output.targetAssessments.map(item =>
    `${item.schoolName}${item.programName ? ` · ${item.programName}` : ''}：${item.rationale}`), limit)
  section(lines, '关键行动', output.recommendedActions.map(item =>
    `${item.title}：${item.rationale}${item.timeframe ? `（${item.timeframe}）` : ''}`), limit)
  lines.push('免责声明', short(output.disclaimer || '评估仅供规划参考，不构成录取承诺。', 180))
  lines.push('参考依据')
  const traceableReferences = context.references
    .map(reference => ({...reference,caseId:traceableAssessmentCaseId(reference.caseId)}))
    .filter(reference => reference.caseId)
  if (traceableReferences.length) {
    traceableReferences.slice(0, kind === 'summary' ? 4 : 8).forEach(reference => {
      const reason = reference.similarityReason || reference.title
      lines.push(`${reference.caseId}${reason ? `（${short(reason, 36)}）` : ''}`)
    })
  } else {
    lines.push('本次摘要没有可展示的案例引用')
  }
  lines.push('本图为分享摘要，完整报告请在九辰教育小程序查看。')
  return lines.join('\n')
}

export function layoutAssessmentImage(context: AssessmentReportExportContext, userId: string,
  kind: 'summary'|'long', measure: (text:string,size:number)=>number, date=beijingDate()): ReportLayout {
  if (!userId) throw new Error('缺少可展示的用户编号，请先绑定学员身份')
  if(context.assessment.status!=='succeeded'||!context.assessment.output) throw new Error('当前报告不可导出')
  const name=context.displayName.trim() && context.displayName.trim()!=='微信用户' ? context.displayName.trim() : '某学员'
  const identity=`${name} ｜ 用户ID：${userId}\n导出日期：${date}`
  const text=shareReport(context,kind)
  const paragraphs=[identity,`报告日期：${formatAssessmentDate(context.assessment.completedAt || context.assessment.updatedAt)}`,'',text,'',identity]
  const lines: ReportLine[]=[]
  let y=42
  paragraphs.forEach(paragraph=>paragraph.split('\n').forEach(p=>{
    const heading=/^九辰|^免责声明$|^核心结论$|^优势$|^风险$|^目标建议$|^关键行动$|^参考依据$/.test(p)
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
