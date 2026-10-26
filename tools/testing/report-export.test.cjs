const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib')
const ts=require('../../apps/miniprogram/node_modules/typescript')
const root=path.resolve(__dirname,'../../apps/miniprogram/miniprogram')
function loader(wx={}){
 const cache=new Map()
 let pageDefinition
 function load(name){
  const filename=path.resolve(root,name.endsWith('.ts')?name:name+'.ts')
  if(cache.has(filename))return cache.get(filename).exports
  const module={exports:{}};cache.set(filename,module)
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  const requireLocal=n=>n.includes('config/runtime')?{runtimeConfig:{apiTransport:'http',apiBaseUrl:'https://test.invalid',wechatCustomerService:{corpId:'test-corp',url:'https://test.invalid'}}}:load(path.relative(root,path.resolve(path.dirname(filename),n)))
  vm.runInNewContext(code,{module,exports:module.exports,require:requireLocal,wx,console,Date,Map,Set,Uint8Array,Uint8ClampedArray,ArrayBuffer,DataView,Promise,setTimeout,clearTimeout,Page:definition=>{pageDefinition=definition},getCurrentPages:()=>[]})
  return module.exports
 }
 load.page=()=>({...pageDefinition,data:{...pageDefinition.data},setData(value,callback){Object.assign(this.data,value);callback?.()}})
 return load
}
function fixture(){return {
 displayName:'某学员',references:[{ref:'case:1',caseId:'JCC-000113',title:'测试案例',metaLabel:'外部来源',excerpt:'完整证据'.repeat(100),similarityReason:'相似原因',resultSummary:'参考结果',sourceType:'external'}],
 assessment:{id:'synthetic-assessment',status:'succeeded',completedAt:'2026-10-12T10:00:00Z',updatedAt:'2026-10-12T10:00:00Z',model:{name:'test-model'},input:{profile:{university:'测试大学',major:'测试专业'}},evidence:[{ref:'official:1',title:'官方证据',sourceLabel:'学校官网',excerpt:'官方要求'}],
 output:{profileSummary:'真实概要',strengths:[{title:'优势一',detail:'具体优势',evidenceRefs:['case:1']}],risks:[{title:'风险一',detail:'具体风险',evidenceRefs:['official:1']}],targetAssessments:[{schoolName:'目标学校',programName:'目标专业',tier:'reach',rationale:'判断条件',gapItems:['差距甲'],actions:['动作甲'],evidenceRefs:['case:1']}],recommendedActions:[{title:'优先行动',priority:'high',rationale:'行动理由',timeframe:'两周'}],similarCases:[{caseId:'c2',evidenceRef:'missing:2',sourceType:'external',similarityReason:'无对应证据',resultSummary:'结果乙'}],uncertainties:['未知条件'],disclaimer:'仅供参考，不保证录取'}}
}}
const context=fixture()
test('school consultation uses the agreed clipboard template with missing-field fallbacks',()=>{
 const {buildSchoolConsultation,beijingDate}=loader()('utils/consultation-payload')
 assert.equal(beijingDate(new Date('2026-10-11T16:00:00Z')),'2026-10-12')
 const text=buildSchoolConsultation('目标学校',{bound:true,userId:'JCS-TEST',displayName:'某学员'},{currentGrade:'大四上',major:'能源与动力工程'},'2026-10-12')
 for(const line of ['九辰教育咨询','学校：目标学校','学生：某学员','用户ID：JCS-TEST','学校阶段：大四上','专业：能源与动力工程','咨询问题：请填写'])assert.ok(text.includes(line),line)
 assert.ok(!text.includes('评估编号'))
 const guest=buildSchoolConsultation('目标学校',{bound:false},null);assert.ok(guest.includes('学生：未认领'));assert.ok(guest.includes('用户ID：未认领'));assert.ok(guest.includes('学校阶段：未填写'));assert.ok(!/undefined|null/.test(guest))
})
test('AI consultation copies only summary, advice and risks; full report remains a separate export',()=>{
 const load=loader(),{buildAssessmentConsultation}=load('utils/consultation-payload')
 const text=buildAssessmentConsultation(context,'JCS-TEST')
 for(const part of ['九辰AI评估咨询','学生：某学员','UID：JCS-TEST','日期：2026-10-12','评估摘要：','真实概要','核心建议：','优先行动：行动理由','风险提示：','风险一：具体风险'])assert.ok(text.includes(part),part)
 for(const forbidden of ['synthetic-assessment','test-model','完整证据','[official:1]','case:1'])assert.ok(!text.includes(forbidden),forbidden)
 const empty=fixture();empty.assessment.output.strengths=[];empty.assessment.output.risks=[];empty.assessment.output.targetAssessments=[];empty.assessment.output.recommendedActions=[];empty.references=[]
 const fallback=buildAssessmentConsultation(empty,'');assert.ok(fallback.includes('UID：未填写'));assert.ok(fallback.includes('核心建议：\n暂无明确建议'));assert.ok(fallback.includes('风险提示：\n暂无明确风险提示'))
 const noEmpty=load('utils/assessment-report-export').buildAssessmentReportPlainText(empty)
 assert.ok(!noEmpty.includes('一、优势'));assert.ok(!noEmpty.includes('三、目标评估'));assert.ok(noEmpty.includes('完整证据')===false)
 assert.throws(()=>buildAssessmentConsultation({...context,assessment:{...context.assessment,status:'draft'}},'JCS-TEST'))
})
test('copy failure never opens chat; success requires genuine clipboard success and preserves text',async()=>{
 let copied='',opened=0,modal
 const wx={setClipboardData:o=>{copied=o.data;o.fail()},showModal:o=>{modal=o},openCustomerServiceChat:()=>opened++,showToast:()=>{}}
 const {copyConsultationAndOpen}=loader(wx)('utils/customer-service')
 const flow=copyConsultationAndOpen('完整咨询');assert.equal(opened,0);assert.equal(modal.title,'复制失败');modal.success({confirm:false});await flow
 wx.setClipboardData=o=>{copied=o.data;o.success()}
 const ok=copyConsultationAndOpen('完整咨询');assert.equal(opened,0);assert.equal(copied,'完整咨询');modal.success({confirm:true});await ok;assert.equal(opened,1)
})
test('stale identity cannot copy or open customer service',async()=>{
 let writes=0,opens=0
 const wx={setClipboardData:()=>writes++,openCustomerServiceChat:()=>opens++,showToast:()=>{}}
 await loader(wx)('utils/customer-service').copyConsultationAndOpen('旧账号',undefined,()=>false)
 assert.equal(writes,0);assert.equal(opens,0)
})
test('mixed Chinese/English/emoji wrap without dropping any characters',()=>{
 const {wrapReportText}=loader()('utils/assessment-image')
 const text='中文English123😀'.repeat(20)
 const lines=wrapReportText(text,t=>[...t].length*25,650)
 assert.equal(lines.join(''),text);assert.ok(lines.every(t=>[...t].length<=26))
})
test('case references expose only canonical six-digit JCC identifiers',()=>{
 const {traceableAssessmentCaseId,buildAssessmentReportPlainText}=loader()('utils/assessment-report-export')
 assert.equal(traceableAssessmentCaseId('case:JCC-000113:v1'),'JCC-000113')
 for(const value of ['source-42','JCC-113','JCC-0001137',''])assert.equal(traceableAssessmentCaseId(value),'')
 const report=buildAssessmentReportPlainText(context)
 assert.ok(report.includes('JCC-000113'))
 for(const internalRef of ['case:1','missing:2','official:1'])assert.ok(!report.includes(internalRef))
})
test('summary and long share images stay bounded, traceable and repeat identity information',()=>{
 const {layoutAssessmentImage}=loader()('utils/assessment-image'),measure=(text,size)=>[...text].length*size
 const named={...context,displayName:'李同学'}
 const long=layoutAssessmentImage(named,'JCS-TEST','long',measure,'2026-10-12')
 const text=long.lines.map(l=>l.text).join('')
 assert.ok(text.includes('完整证据'.repeat(100)));assert.ok(text.includes('仅供参考，不保证录取'));assert.ok(text.includes('JCC-000113'))
 assert.ok(long.lines.filter(l=>l.text.includes('用户ID')).length>=2);assert.ok(text.includes('李同学'));assert.equal(long.name,'李同学')
 const summary=layoutAssessmentImage(context,'JCS-TEST','summary',measure,'2026-10-12')
 const summaryText=summary.lines.map(l=>l.text).join('')
 assert.ok(summaryText.includes('摘要分享图'))
 assert.ok(summaryText.includes(context.assessment.id.slice(0,8)))
 assert.ok(!summaryText.includes('JCS-TEST'))
 assert.ok(!summaryText.includes('李同学'))
 const leak={...named,assessment:{...named.assessment,output:{...named.assessment.output,
   profileSummary:'李同学的完整编号是 JCS-TEST。'}}}
 const safe=layoutAssessmentImage(leak,'JCS-TEST','summary',measure,'2026-10-12')
 assert.ok(!safe.lines.map(l=>l.text).join('').includes('李同学'))
 assert.ok(!safe.lines.map(l=>l.text).join('').includes('JCS-TEST'))
 assert.ok(!summary.lines.map(l=>l.text).join('').includes('完整证据'))
 assert.ok(summary.height<=long.height)
 assert.throws(()=>layoutAssessmentImage(context,'','long',measure))
 const huge=fixture();huge.assessment.output.profileSummary='长'.repeat(20000)
 assert.throws(()=>layoutAssessmentImage(huge,'JCS-TEST','long',measure),/资源预算/)
})
test('watermark uses 0.30 alpha, negative 25 degrees; every strip paints watermark before body',()=>{
 const {drawReportStrip,layoutAssessmentImage}=loader()('utils/assessment-image'),layout=layoutAssessmentImage(context,'JCS-TEST','long',(t,s)=>t.length*s)
 for(const offset of [0,800,1600]){
  const operations=[]
  const ctx={setFillStyle(){},fillRect(){operations.push('background')},beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(){},fill(){},save(){},restore(){},setGlobalAlpha:n=>operations.push(['alpha',n]),setFontSize(){},measureText:()=>({width:440}),translate(){},rotate:n=>operations.push(['rotate',n]),fillText:t=>operations.push(['text',t]),setTextBaseline(){}}
  drawReportStrip(ctx,layout,'JCS-TEST',offset,800)
  assert.equal(operations[0],'background');assert.ok(operations.some(o=>o[0]==='alpha'&&o[1]===.30));assert.ok(operations.some(o=>o[0]==='rotate'&&Math.abs(o[1]+25*Math.PI/180)<1e-9))
  const mark=operations.findIndex(o=>o[0]==='text'&&o[1].includes('姓名未登记 ·'))
  const reset=operations.findIndex(o=>o[0]==='alpha'&&o[1]===1)
  assert.ok(mark>0&&reset>mark)
 }
})
test('public summary paints blue and gold cards without name or full business ID',()=>{
 const {drawReportStrip,layoutAssessmentImage}=loader()('utils/assessment-image')
 const named={...context,displayName:'李同学'}
 const layout=layoutAssessmentImage(named,'JCS-PRIVATE-123','summary',(t,s)=>t.length*s)
 const colors=[],texts=[]
 const ctx={setFillStyle:c=>colors.push(c),fillRect(){},beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(){},fill(){},save(){},restore(){},setGlobalAlpha(){},measureText:t=>({width:t.length*23}),translate(){},rotate(){},
  setTextBaseline(){},setFontSize(){},fillText:t=>texts.push(t)}
 drawReportStrip(ctx,layout,'JCS-PRIVATE-123',0,800)
 assert.ok(colors.includes('#142b4b'));assert.ok(colors.includes('#c9a85b'))
 assert.ok(colors.includes('#ffffff'));assert.ok(texts.join('').includes('报告标识'))
 assert.ok(!texts.join('').includes('JCS-PRIVATE-123'))
 assert.ok(!texts.join('').includes('李同学'))
})
test('result exposes copy and five useful export formats from one download entry',()=>{
 const result=fs.readFileSync(path.resolve(root,'pages/assessment-result/assessment-result.wxml'),'utf8')
 const history=fs.readFileSync(path.resolve(root,'pages/assessment-history/assessment-history.ts'),'utf8')
 assert.match(result,/bindtap="onCopyReport"/);assert.match(result,/bindtap="onDownloadReport"/)
 assert.doesNotMatch(result,/bindtap="onSaveSummary"|bindtap="onSaveLong"/)
 assert.match(history,/pages\/assessment-result\/assessment-result\?id=/)
 const source=fs.readFileSync(path.resolve(root,'pages/assessment-result/assessment-result.ts'),'utf8')
 for(const label of ['Markdown','Word','PDF','摘要分享图','完整报告长图'])assert.ok(source.includes(label))
 assert.ok(!result.includes('暂无明确优势结论'));assert.match(result,/output.profileSummary/)
 assert.match(result,/参考案例 \{\{citation.label\}\}/)
})

test('every full format contains persisted user input and reliable identity without a nickname fallback',()=>{
 const load=loader(),exports=load('utils/assessment-report-export')
 const supplied=fixture();supplied.displayName='';supplied.userId='JCS-TEST';supplied.exportDate='2026-10-14'
 supplied.assessment.input.profile.backgroundNote='用户提供的背景必须保留'
 supplied.assessment.input.english=[{type:'cet6',score:'620',note:'用户备注'}]
 const text=exports.buildAssessmentReportPlainText(supplied),md=exports.buildAssessmentReportMarkdown(supplied)
 for(const value of ['姓名未登记','JCS-TEST','2026-10-14','用户提供的背景必须保留','620','用户备注']){assert.ok(text.includes(value));assert.ok(md.includes(value))}
 const docx=Buffer.from(exports.buildAssessmentReportDocx(supplied)).toString('utf8')
 assert.ok(docx.includes('header.xml'));assert.ok(docx.includes('用户提供的背景必须保留'));assert.ok(docx.includes('w:headerReference'))
})

test('PDF pagination preserves every body line and creates a valid RGB-image PDF without Chinese font substitution',()=>{
 const load=loader(),{ReportPngEncoder}=load('utils/report-png'),{buildAssessmentPdf,paginateAssessmentLayout}=load('utils/report-pdf')
 const {layoutAssessmentImage}=load('utils/assessment-image')
 const layout=layoutAssessmentImage(context,'JCS-TEST','long',(text,size)=>[...text].length*size,'2026-10-14')
 const layouts=paginateAssessmentLayout(layout)
 assert.ok(layouts.length>1)
 const bodies=layouts.flatMap(page=>page.lines.filter(line=>line.y>=150&&line.y<1000).map(line=>line.text))
 const content=layout.lines.slice(0,-3)
 assert.deepEqual(Array.from(bodies),Array.from(content,line=>line.text));assert.ok(layouts.every(page=>page.lines.every(line=>line.y+line.size<1060)))
 const png=()=>{const encoder=new ReportPngEncoder(2,2);return Buffer.concat([encoder.header(),encoder.strip(new Uint8ClampedArray(16).fill(255),2),encoder.finish()].map(part=>Buffer.from(part)))}
 const pdf=Buffer.from(buildAssessmentPdf([png(),png()]))
 assert.ok(pdf.toString('ascii').startsWith('%PDF-1.4'));assert.ok(pdf.toString('ascii').includes('/Count 2'))
 assert.ok(pdf.toString('ascii').includes('/ColorSpace /DeviceRGB'))
 const offset=Number(pdf.toString('ascii').match(/startxref\n(\d+)/)[1]);assert.equal(pdf.toString('ascii',offset,offset+4),'xref')
 assert.throws(()=>buildAssessmentPdf([]),/页数/)
})
function pngData(bytes){
 const buffer=Buffer.from(bytes),idat=[]
 for(let i=8;i<buffer.length;){const n=buffer.readUInt32BE(i),type=buffer.toString('ascii',i+4,i+8);if(type==='IDAT')idat.push(buffer.subarray(i+8,i+8+n));i+=12+n}
 return {buffer,raw:zlib.inflateSync(Buffer.concat(idat))}
}
function rasterCanvas(height,{skipWatermark=false}={}){
 const width=750,pixels=new Uint8ClampedArray(width*height*4)
 let state={color:[0,0,0],alpha:1,tx:0,ty:0,angle:0},path=[],stack=[]
 function pixel(x,y){
  x=Math.round(x);y=Math.round(y);if(x<0||x>=width||y<0||y>=height)return
  const i=(y*width+x)*4,a=state.alpha
  for(let c=0;c<3;c++)pixels[i+c]=Math.round(state.color[c]*a+pixels[i+c]*(1-a))
  pixels[i+3]=255
 }
 function rect(x,y,w,h){
  for(let row=Math.max(0,Math.floor(y));row<Math.min(height,Math.ceil(y+h));row++)
   for(let col=Math.max(0,Math.floor(x));col<Math.min(width,Math.ceil(x+w));col++)pixel(col,row)
 }
 const ctx={
  setFillStyle(hex){state.color=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))},
  setGlobalAlpha(alpha){state.alpha=alpha},setFontSize(){},setTextBaseline(){},
  measureText:t=>({width:[...t].length*23}),fillRect:rect,
  beginPath(){path=[]},moveTo(x,y){path.push([x,y])},lineTo(x,y){path.push([x,y])},quadraticCurveTo(_x,_y,x,y){path.push([x,y])},
  fill(){const xs=path.map(p=>p[0]),ys=path.map(p=>p[1]);rect(Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))},
  save(){stack.push({...state,color:[...state.color]})},restore(){state=stack.pop()},
  translate(x,y){state.tx+=x*Math.cos(state.angle)-y*Math.sin(state.angle);state.ty+=x*Math.sin(state.angle)+y*Math.cos(state.angle)},
  rotate(angle){state.angle+=angle},
  fillText(text,x,y){
   if(skipWatermark&&state.alpha<1)return
   for(let i=0;i<[...text].length;i++)for(let yy=0;yy<5;yy++)for(let xx=0;xx<3;xx++){
    const gx=x+i*12+xx,gy=y+yy
    pixel(state.tx+gx*Math.cos(state.angle)-gy*Math.sin(state.angle),state.ty+gx*Math.sin(state.angle)+gy*Math.cos(state.angle))
   }
  }
 }
 return {ctx,pixels}
}
function renderReportPng(layout,userId,skipWatermark=false){
 const {drawReportStrip}=loader()('utils/assessment-image'),{ReportPngEncoder}=loader()('utils/report-png')
 const encoder=new ReportPngEncoder(layout.width,layout.height),parts=[encoder.header()]
 for(let offset=0;offset<layout.height;offset+=800){
  const height=Math.min(800,layout.height-offset),canvas=rasterCanvas(height,{skipWatermark})
  drawReportStrip(canvas.ctx,layout,userId,offset,height)
  parts.push(encoder.strip(canvas.pixels,height))
 }
 parts.push(encoder.finish())
 return pngData(Buffer.concat(parts.map(part=>Buffer.from(part))))
}
function rgbAt(raw,width,x,y){const i=y*(width*3+1)+1+x*3;return [...raw.subarray(i,i+3)]}
test('public poster brand watermark survives RGB PNG encoding without private identity',()=>{
 const {layoutAssessmentImage}=loader()('utils/assessment-image')
 const named={...fixture(),displayName:'李同学'}
 const layout=layoutAssessmentImage(named,'JCS-PRIVATE-123','summary',(text,size)=>[...text].length*size,'2026-10-12')
 const withMark=renderReportPng(layout,'JCS-PRIVATE-123'),withoutMark=renderReportPng(layout,'JCS-PRIVATE-123',true)
 assert.equal(withMark.buffer[25],2)
 assert.ok(withMark.raw.some((value,i)=>i>245*2251&&value!==withoutMark.raw[i]),'brand watermark changes actual poster pixels')
 assert.deepEqual(rgbAt(withMark.raw,750,400,220),[242,245,249])
 const ink=withMark.raw.findIndex((value,i)=>i>245*2251&&value!==withoutMark.raw[i])
 assert.ok(ink>0&&withMark.raw[ink]>80,'watermark stays translucent over the pale card')
})
test('long image keeps personal watermark and colored sections across RGB strip boundaries',()=>{
 const {layoutAssessmentImage,drawReportStrip}=loader()('utils/assessment-image')
 const layout=layoutAssessmentImage(fixture(),'JCS-TEST','long',(text,size)=>[...text].length*size,'2026-10-14')
 const withMark=renderReportPng(layout,'JCS-TEST'),withoutMark=renderReportPng(layout,'JCS-TEST',true)
 assert.equal(withMark.buffer[25],2)
 assert.ok(withMark.raw.some((value,i)=>i>260*2251&&value!==withoutMark.raw[i]),'personal watermark changes actual long-image pixels')
 assert.deepEqual(rgbAt(withMark.raw,750,15,15),[20,43,75])
 assert.deepEqual(rgbAt(withMark.raw,750,50,226),[201,168,91])
 assert.ok(layout.lines.some(line=>line.text.includes('完整证据')))
 const full=rasterCanvas(1600)
 drawReportStrip(full.ctx,layout,'JCS-TEST',0,1600)
 for(const offset of [0,800]){
  const tile=rasterCanvas(800)
  drawReportStrip(tile.ctx,layout,'JCS-TEST',offset,800)
  assert.deepEqual(Buffer.from(tile.pixels),Buffer.from(full.pixels.subarray(offset*750*4,(offset+800)*750*4)))
 }
})
test('streaming PNG decodes multiple strips across deflate blocks with exact complete height',()=>{
 const {ReportPngEncoder}=loader()('utils/report-png'),encoder=new ReportPngEncoder(750,1601),parts=[encoder.header()]
 for(const h of [800,800,1]){const pixels=new Uint8ClampedArray(750*h*4).fill(255);parts.push(encoder.strip(pixels,h))}
 parts.push(encoder.finish());const {buffer,raw}=pngData(Buffer.concat(parts.map(p=>Buffer.from(p))))
 assert.equal(buffer.readUInt32BE(16),750);assert.equal(buffer.readUInt32BE(20),1601);assert.equal(buffer[25],2);assert.equal(raw.length,(750*3+1)*1601)
 for(let y=0;y<1601;y++){assert.equal(raw[y*2251],0);assert.equal(raw[y*2251+2250],255)}
 assert.ok(buffer.length<4000000)
 assert.throws(()=>new ReportPngEncoder(750,30000),/资源预算/)
 assert.throws(()=>new ReportPngEncoder(750,10).finish(),/完整/)
})
test('streaming PNG composites transparent device pixels over white instead of black',()=>{
 const {ReportPngEncoder}=loader()('utils/report-png'),encoder=new ReportPngEncoder(2,1)
 const pixels=new Uint8ClampedArray([0,0,0,0,220,70,20,255])
 const {raw}=pngData(Buffer.concat([encoder.header(),encoder.strip(pixels,1),encoder.finish()].map(p=>Buffer.from(p))))
 assert.deepEqual([...raw],[0,255,255,255,220,70,20])
})
test('RGB PNG preserves color and strip boundaries without losing rows',()=>{
 const {ReportPngEncoder}=loader()('utils/report-png'),encoder=new ReportPngEncoder(1,2)
 const bytes=Buffer.concat([encoder.header(),encoder.strip(new Uint8ClampedArray([255,0,0,255]),1),
   encoder.strip(new Uint8ClampedArray([0,0,255,128]),1),encoder.finish()].map(p=>Buffer.from(p)))
 const {raw}=pngData(bytes)
 assert.deepEqual([...raw],[0,255,0,0,0,127,127,255])
})
module.exports={loader,fixture}

function pageHarness(){
 const storage=new Map(),requests=[],files=new Map(),saved=[],modals=[]
 const wx={env:{USER_DATA_PATH:'/synthetic'},getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),request:o=>requests.push(o),showLoading(){},hideLoading(){},showToast(){},showModal:o=>modals.push(o),
  createCanvasContext:()=>({setFontSize(){},measureText:t=>({width:[...t].length*25}),setFillStyle(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(){},fill(){},save(){},restore(){},setGlobalAlpha(){},setTextBaseline(){},translate(){},rotate(){},fillText(){},draw:(_keep,cb)=>cb()}),
  canvasGetImageData:o=>o.success({data:new Uint8ClampedArray(o.width*o.height*4).fill(255)}),
  saveImageToPhotosAlbum:o=>{saved.push(Buffer.from(files.get(o.filePath)));o.success()},
  getFileSystemManager:()=>({writeFile:o=>{files.set(o.filePath,Buffer.from(o.data));o.success()},appendFile:o=>{files.set(o.filePath,Buffer.concat([files.get(o.filePath),Buffer.from(o.data)]));o.success()},unlink:o=>files.delete(o.filePath)})
 }
 const load=loader(wx),auth=load('utils/auth'),identity={ok:true,agreement:{type:'user_terms',version:'test',accepted:true},user:{id:'00000000-0000-4000-8000-000000000001',role:'student',displayName:'某学员'},session:{token:'synthetic-session',expiresAt:'2099-01-01'},businessIdentity:{businessId:'JCS-TEST',type:'student',status:'claimed'}}
 auth.saveAuthResult(identity);load('pages/assessment-result/assessment-result');const page=load.page()
 Object.assign(page.data,{assessment:fixture().assessment,ownerUserId:identity.user.id,references:fixture().references,displayName:'某学员'})
 const respond=()=>requests[0].success({statusCode:200,data:{ok:true,user:identity.user,businessIdentity:identity.businessIdentity}})
 return {wx,load,page,identity,requests,files,saved,modals,respond}
}
test('actual export page writes one complete PNG, saves once, rejects double taps and cleans temporary file',async()=>{
 const h=pageHarness(),flow=h.page.exportImageReport('long')
 await h.page.exportImageReport('long');assert.equal(h.requests.length,1)
 h.respond();await flow
 assert.equal(h.saved.length,1);assert.equal(h.files.size,0);assert.equal(h.page.data.exporting,false)
 const {buffer,raw}=pngData(h.saved[0]);assert.equal(raw.length,(buffer.readUInt32BE(16)*3+1)*buffer.readUInt32BE(20))
})
test('actual export page reports save errors and never claims success',async()=>{
 const h=pageHarness();h.wx.saveImageToPhotosAlbum=o=>o.fail({errMsg:'denied'})
 const flow=h.page.exportImageReport('summary');h.respond();await flow
 assert.equal(h.saved.length,0);assert.equal(h.files.size,0);assert.equal(h.modals[0].title,'图片导出未完成');assert.equal(h.page.data.exporting,false)
})
test('result contact copies the loaded assessment consultation summary only',async()=>{
 const h=pageHarness();let copied='',opened=0
 h.wx.setClipboardData=o=>{copied=o.data;o.success()};h.wx.openCustomerServiceChat=()=>opened++
 const flow=h.page.onCustomerServiceTap();h.respond();await new Promise(resolve=>setImmediate(resolve))
 assert.ok(copied.includes('评估摘要：'));assert.ok(copied.includes('核心建议：'));assert.ok(copied.includes('风险提示：'));assert.ok(!copied.includes('synthetic-assessment'));assert.equal(opened,0)
 h.modals[0].success({confirm:true});await flow;assert.equal(opened,1);assert.equal(h.requests.length,1)
})
