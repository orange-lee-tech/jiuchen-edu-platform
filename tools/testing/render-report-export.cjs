// Synthetic visual QA of the actual export serializers; never loads production data/env.
const fs=require('node:fs'),path=require('node:path')
const {loader,fixture}=require('./report-export.test.cjs')
const sharp=require(path.join(process.argv[2],'sharp'))
const output=path.resolve('tmp/p1-report-qa')
const escape=text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
async function run(){
 fs.mkdirSync(output,{recursive:true})
 const load=loader(),context=fixture()
 context.displayName='合成学员';context.userId='JCS-SYNTHETIC';context.exportDate='2026-10-14'
 context.assessment.input.profile.backgroundNote='这是仅供回归的合成背景信息，不是生产学员资料。'
 const exporter=load('utils/assessment-report-export')
 const {layoutAssessmentImage}=load('utils/assessment-image')
 const {ReportPngEncoder}=load('utils/report-png')
 const {paginateAssessmentLayout,buildAssessmentPdf}=load('utils/report-pdf')
 const measure=(text,size)=>[...text].reduce((sum,char)=>sum+(char.charCodeAt(0)>255?size:size*.55),0)
 const svg=layout=>`<svg xmlns="http://www.w3.org/2000/svg" width="750" height="${layout.height}"><rect width="100%" height="100%" fill="white"/>`+
   Array.from({length:Math.ceil(layout.height/260)},(_,index)=>`<text x="40" y="${index*260+130}" fill="#b4becb" opacity="0.3" transform="rotate(-25 40 ${index*260+130})" font-size="23" font-family="Microsoft YaHei">${escape(context.displayName+' · 用户ID：'+context.userId+' · '+context.exportDate)}</text>`).join('')+
   layout.lines.map(line=>`<text x="50" y="${line.y+line.size}" fill="#414b58" font-size="${line.size}" font-family="Microsoft YaHei">${escape(line.text)}</text>`).join('')+'</svg>'
 const encode=async layout=>{
  const raw=await sharp(Buffer.from(svg(layout))).ensureAlpha().raw().toBuffer()
  const encoder=new ReportPngEncoder(layout.width,layout.height)
  return Buffer.concat([encoder.header(),encoder.strip(new Uint8ClampedArray(raw),layout.height),encoder.finish()].map(part=>Buffer.from(part)))
 }
 const long=layoutAssessmentImage(context,context.userId,'long',measure,context.exportDate)
 fs.writeFileSync(path.join(output,'summary.png'),await encode(layoutAssessmentImage(context,context.userId,'summary',measure,context.exportDate)))
 fs.writeFileSync(path.join(output,'long.png'),await encode(long))
 const pages=[]
 for(const layout of paginateAssessmentLayout(long))pages.push(await encode(layout))
 fs.writeFileSync(path.join(output,'report.pdf'),Buffer.from(buildAssessmentPdf(pages)))
 fs.writeFileSync(path.join(output,'report.docx'),Buffer.from(exporter.buildAssessmentReportDocx(context)))
 fs.writeFileSync(path.join(output,'report.md'),exporter.buildAssessmentReportMarkdown(context))
 console.log(JSON.stringify({output,pages:pages.length,syntheticOnly:true}))
}
run().catch(error=>{console.error(error);process.exitCode=1})
