import { buildAssessmentReportPlainText, formatAssessmentDate, traceableAssessmentCaseId, type AssessmentReportExportContext } from './assessment-report-export'
import { beijingDate } from './consultation-payload'

export const REPORT_WIDTH = 750
export const REPORT_TILE_HEIGHT = 800
export const WATERMARK_ALPHA = .30
export const WATERMARK_ANGLE = -25 * Math.PI / 180

export type ReportLine = {text: string; y: number; size: number; heading: boolean}
export type ReportLayout = {width: number; height: number; lines: ReportLine[]; identity: string; name: string; date: string; kind: 'summary'|'long'}

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
  if(kind==='long')return buildAssessmentReportPlainText(context)
  const limit = kind === 'summary' ? 2 : 4
  const lines = [
    '九辰教育 AI评估报告',
    '摘要分享图｜适合转发，仅含重点结论',
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
  let summary=lines.join('\n')
  for(const privateValue of [context.userId,context.displayName.trim()]){
    if(privateValue&&privateValue.length>=2&&privateValue!=='微信用户'&&privateValue!=='某学员')
      summary=summary.split(privateValue).join('学员')
  }
  return summary
}

export function layoutAssessmentImage(context: AssessmentReportExportContext, userId: string,
  kind: 'summary'|'long', measure: (text:string,size:number)=>number, date=beijingDate()): ReportLayout {
  if (!userId) throw new Error('缺少可展示的用户编号，请先绑定学员身份')
  if(context.assessment.status!=='succeeded'||!context.assessment.output) throw new Error('当前报告不可导出')
  const name=context.displayName.trim() && !['微信用户','用户','某学员'].includes(context.displayName.trim()) ? context.displayName.trim() : '姓名未登记'
  const identity=kind==='summary'
    ? `报告标识：${context.assessment.id.slice(0, 8)} · ${date}`
    : `${name} ｜ 用户ID：${userId}\n导出日期：${date}`
  const text=shareReport({...context,userId,exportDate:date},kind)
  const paragraphs=kind==='summary'
    ? [text.split('\n').slice(0,2).join('\n'),identity,...text.split('\n').slice(2)]
    : [identity,`报告日期：${formatAssessmentDate(context.assessment.completedAt || context.assessment.updatedAt)}`,'',text,'',identity]
  const lines: ReportLine[]=[]
  let y=kind==='summary'?54:42
  paragraphs.forEach(paragraph=>paragraph.split('\n').forEach(p=>{
    const heading=/^九辰|^免责声明$|^核心结论$|^优势$|^风险$|^目标建议$|^关键行动$|^参考依据$/.test(p)
    if(kind==='summary'&&heading&&p!=='九辰教育 AI评估报告')y+=18
    const size=heading?(kind==='summary'&&p==='九辰教育 AI评估报告'?38:30):25
    wrapReportText(p,t=>measure(t,size),kind==='summary'?610:650).forEach(text=>{lines.push({text,y,size,heading});y+=kind==='summary'?(heading?52:42):(heading?48:38)})
  }))
  const height=Math.ceil(y+(kind==='summary'?64:42))
  if(height*REPORT_WIDTH>15000000) throw new Error('报告超出单张长图资源预算，请使用文本报告联系老师')
  return {width:REPORT_WIDTH,height,lines,identity,name,date,kind}
}

function roundedCard(ctx: WechatMiniprogram.CanvasContext,x:number,y:number,w:number,h:number,r:number){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r)
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h)
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r)
  ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.fill()
}

function paintWatermark(ctx: WechatMiniprogram.CanvasContext, mark:string, offset:number, height:number, alpha:number, color:string, firstY:number){
  ctx.save();ctx.setGlobalAlpha(alpha);ctx.setFillStyle(color);ctx.setFontSize(23)
  const spacing=Math.max(520,ctx.measureText(mark).width+80)
  // Anchor the grid to document coordinates, including across canvas strips.
  for(let y=Math.floor((offset-firstY-600)/260)*260+firstY;y<offset+height+600;y+=260){
    if(y<firstY)continue
    const stagger=(Math.abs(Math.round((y-firstY)/260))%2)*spacing/2
    for(let x=-spacing;x<REPORT_WIDTH+spacing;x+=spacing){
      ctx.save();ctx.translate(x+stagger,y-offset);ctx.rotate(WATERMARK_ANGLE);ctx.fillText(mark,0,0);ctx.restore()
    }
  }
  ctx.restore();ctx.setGlobalAlpha(1)
}

function longSectionTitle(text:string){
  return /^(?:用户提供的信息|学业背景与评估概要|[一二三四五六七八九十]+、|免责声明$)/.test(text)
}

/** Each strip uses absolute layout coordinates so colors and cards align at tile boundaries. */
export function drawReportStrip(ctx: WechatMiniprogram.CanvasContext, layout: ReportLayout, userId:string, offset:number, height:number) {
  ctx.setFillStyle('#f2f5f9');ctx.fillRect(0,0,layout.width,height)
  if(layout.kind==='summary'){
    ctx.setFillStyle('#142b4b');ctx.fillRect(0,-offset,layout.width,205)
    ctx.setFillStyle('#c9a85b');ctx.fillRect(48,188-offset,654,5)
    const headings=layout.lines.filter(line=>line.heading&&line.y>200)
    headings.forEach((line,index)=>{
      const next=headings[index+1]?.y??layout.height-40
      if(next<offset||line.y>offset+height)return
      ctx.setFillStyle('#ffffff');roundedCard(ctx,30,line.y-16-offset,690,next-line.y-2,18)
      ctx.setFillStyle('#c9a85b');ctx.fillRect(49,line.y-2-offset,5,29)
    })
    // Public mark carries only the brand. Cards stay readable above the light ink.
    paintWatermark(ctx,'九辰教育 · AI 保研评估',offset,height,.10,'#35547b',245)
    ctx.setTextBaseline('top')
    layout.lines.filter(line=>line.y+52>offset&&line.y<offset+height).forEach(line=>{
      ctx.setFontSize(line.size)
      ctx.setFillStyle(line.y<205?'#ffffff':line.heading?'#17375e':'#33445a')
      ctx.fillText(line.text||' ',line.y<205?48:66,line.y-offset)
    })
    return
  }
  ctx.setFillStyle('#142b4b');ctx.fillRect(0,-offset,layout.width,232)
  ctx.setFillStyle('#c9a85b');ctx.fillRect(48,226-offset,654,5)
  const sections=layout.lines.filter(line=>longSectionTitle(line.text))
  const first=layout.lines.find(line=>line.y>=232)
  const cards=first?[first,...sections.filter(line=>line.y>first.y)]:sections
  cards.forEach((line,index)=>{
    const top=index===0?228:line.y-16
    const bottom=(cards[index+1]?.y??layout.height-24)-14
    if(bottom<offset||top>offset+height)return
    ctx.setFillStyle('#ffffff');roundedCard(ctx,30,top-offset,690,Math.max(20,bottom-top),18)
    if(index>0){ctx.setFillStyle('#c9a85b');ctx.fillRect(49,line.y-2-offset,5,29)}
  })
  const mark=`${layout.name} · 用户ID：${userId} · ${layout.date}`
  paintWatermark(ctx,mark,offset,height,WATERMARK_ALPHA,'#b4becb',0)
  ctx.setTextBaseline('top')
  layout.lines.filter(line=>line.y+48>offset && line.y<offset+height).forEach(line=>{
    ctx.setFontSize(line.size)
    ctx.setFillStyle(line.y<232?'#ffffff':longSectionTitle(line.text)?'#17375e':'#33445a')
    ctx.fillText(line.text||' ',line.y<232?48:66,line.y-offset)
  })
}
