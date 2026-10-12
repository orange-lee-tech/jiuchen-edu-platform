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
  vm.runInNewContext(code,{module,exports:module.exports,require:requireLocal,wx,console,Date,Map,Set,Uint8Array,Uint8ClampedArray,ArrayBuffer,DataView,Promise,Page:definition=>{pageDefinition=definition},getCurrentPages:()=>[]})
  return module.exports
 }
 load.page=()=>({...pageDefinition,data:{...pageDefinition.data},setData(value,callback){Object.assign(this.data,value);callback?.()}})
 return load
}
function fixture(){return {
 displayName:'某学员',references:[{index:1,ref:'case:1',caseId:'c1',title:'测试案例',metaLabel:'外部来源',excerpt:'完整证据'.repeat(100),similarityReason:'相似原因',resultSummary:'参考结果',sourceType:'external'}],
 assessment:{id:'synthetic-assessment',status:'succeeded',completedAt:'2026-10-12T10:00:00Z',updatedAt:'2026-10-12T10:00:00Z',model:{name:'test-model'},input:{profile:{university:'测试大学',major:'测试专业'}},evidence:[{ref:'official:1',title:'官方证据',sourceLabel:'学校官网',excerpt:'官方要求'}],
 output:{profileSummary:'真实概要',strengths:[{title:'优势一',detail:'具体优势',evidenceRefs:['case:1']}],risks:[{title:'风险一',detail:'具体风险',evidenceRefs:['official:1']}],targetAssessments:[{schoolName:'目标学校',programName:'目标专业',tier:'reach',rationale:'判断条件',gapItems:['差距甲'],actions:['动作甲'],evidenceRefs:['case:1']}],recommendedActions:[{title:'优先行动',priority:'high',rationale:'行动理由',timeframe:'两周'}],similarCases:[{caseId:'c2',evidenceRef:'missing:2',sourceType:'external',similarityReason:'无对应证据',resultSummary:'结果乙'}],uncertainties:['未知条件'],disclaimer:'仅供参考，不保证录取'}}
}}
const context=fixture()
test('consultation maps all profile fields, dates, nulls and unbound identity',()=>{
 const {buildSchoolConsultation,beijingDate}=loader()('utils/consultation-payload')
 assert.equal(beijingDate(new Date('2026-10-11T16:00:00Z')),'2026-10-12')
 const text=buildSchoolConsultation('当前学校',{bound:true,userId:'JCS-TEST'},null,'2026-10-12')
 assert.ok(text.includes('咨询院校：当前学校'));assert.ok(text.includes('学员：某学员'));assert.ok(text.includes('入学年份：未填写'));assert.ok(!/undefined|null/.test(text))
 const guest=buildSchoolConsultation('当前学校',{bound:false},null);assert.ok(guest.includes('身份资料尚未绑定'));assert.ok(!guest.includes('用户ID'))
})
test('full report retains every generated field, complete evidence, unresolved refs and disclaimer',()=>{
 const load=loader(),{buildAssessmentConsultation}=load('utils/consultation-payload')
 const text=buildAssessmentConsultation(context,'JCS-TEST')
 for(const part of ['真实概要','具体优势','具体风险','目标专业','判断条件','差距甲','动作甲','优先行动','两周','相似原因','参考结果','完整证据'.repeat(100),'官方证据','官方要求','无对应证据','结果乙','未知条件','仅供参考，不保证录取','[official:1]','synthetic-assessment'])assert.ok(text.includes(part),part)
 const empty=fixture();empty.assessment.output.strengths=[];empty.assessment.output.risks=[];empty.assessment.output.targetAssessments=[];empty.assessment.output.recommendedActions=[];empty.references=[]
 const noEmpty=load('utils/assessment-report-export').buildAssessmentReportPlainText(empty)
 assert.ok(!noEmpty.includes('一、优势'));assert.ok(!noEmpty.includes('三、目标评估'))
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
test('summary is labeled, deterministic; long layout contains all text and both identities',()=>{
 const {layoutAssessmentImage}=loader()('utils/assessment-image'),measure=(text,size)=>[...text].length*size
 const long=layoutAssessmentImage(context,'JCS-TEST','long',measure,'2026-10-12')
 const text=long.lines.map(l=>l.text).join('')
 assert.ok(text.includes('完整证据'.repeat(100)));assert.ok(text.includes('仅供参考，不保证录取'))
 assert.equal(long.lines.filter(l=>l.text.includes('用户ID')).length,2)
 const summary=layoutAssessmentImage(context,'JCS-TEST','summary',measure,'2026-10-12')
 assert.ok(summary.lines.map(l=>l.text).join('').includes('摘要图'))
 assert.ok(summary.height<long.height)
 assert.throws(()=>layoutAssessmentImage(context,'','long',measure))
 const huge=fixture();huge.assessment.output.profileSummary='长'.repeat(20000)
 assert.throws(()=>layoutAssessmentImage(huge,'JCS-TEST','long',measure),/资源预算/)
})
test('watermark uses 0.30 alpha, negative 25 degrees; every strip paints watermark before body',()=>{
 const {drawReportStrip,layoutAssessmentImage}=loader()('utils/assessment-image'),layout=layoutAssessmentImage(context,'JCS-TEST','long',(t,s)=>t.length*s)
 for(const offset of [0,800,1600]){
  const operations=[]
  const ctx={setFillStyle(){},fillRect(){operations.push('background')},save(){},restore(){},setGlobalAlpha:n=>operations.push(['alpha',n]),setFontSize(){},measureText:()=>({width:440}),translate(){},rotate:n=>operations.push(['rotate',n]),fillText:t=>operations.push(['text',t]),setTextBaseline(){}}
  drawReportStrip(ctx,layout,'JCS-TEST',offset,800)
  assert.equal(operations[0],'background');assert.ok(operations.some(o=>o[0]==='alpha'&&o[1]===.30));assert.ok(operations.some(o=>o[0]==='rotate'&&Math.abs(o[1]+25*Math.PI/180)<1e-9))
  const mark=operations.findIndex(o=>o[0]==='text'&&o[1].includes('某学员 ·'))
  const reset=operations.findIndex(o=>o[0]==='alpha'&&o[1]===1)
  assert.ok(mark>0&&reset>mark)
 }
})
function pngData(bytes){
 const buffer=Buffer.from(bytes),idat=[]
 for(let i=8;i<buffer.length;){const n=buffer.readUInt32BE(i),type=buffer.toString('ascii',i+4,i+8);if(type==='IDAT')idat.push(buffer.subarray(i+8,i+8+n));i+=12+n}
 return {buffer,raw:zlib.inflateSync(Buffer.concat(idat))}
}
test('streaming PNG decodes multiple strips across deflate blocks with exact complete height',()=>{
 const {ReportPngEncoder}=loader()('utils/report-png'),encoder=new ReportPngEncoder(750,1601),parts=[encoder.header()]
 for(const h of [800,800,1]){const pixels=new Uint8ClampedArray(750*h*4).fill(255);parts.push(encoder.strip(pixels,h))}
 parts.push(encoder.finish());const {buffer,raw}=pngData(Buffer.concat(parts.map(p=>Buffer.from(p))))
 assert.equal(buffer.readUInt32BE(16),750);assert.equal(buffer.readUInt32BE(20),1601);assert.equal(raw.length,751*1601)
 for(let y=0;y<1601;y++){assert.equal(raw[y*751],0);assert.equal(raw[y*751+750],255)}
 assert.ok(buffer.length<1250000)
 assert.throws(()=>new ReportPngEncoder(750,30000),/资源预算/)
 assert.throws(()=>new ReportPngEncoder(750,10).finish(),/完整/)
})
module.exports={loader,fixture}

function pageHarness(){
 const storage=new Map(),requests=[],files=new Map(),saved=[],modals=[]
 const wx={env:{USER_DATA_PATH:'/synthetic'},getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),request:o=>requests.push(o),showLoading(){},hideLoading(){},showToast(){},showModal:o=>modals.push(o),
  createCanvasContext:()=>({setFontSize(){},measureText:t=>({width:[...t].length*25}),setFillStyle(){},fillRect(){},save(){},restore(){},setGlobalAlpha(){},setTextBaseline(){},translate(){},rotate(){},fillText(){},draw:(_keep,cb)=>cb()}),
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
 const {buffer,raw}=pngData(h.saved[0]);assert.equal(raw.length,(buffer.readUInt32BE(16)+1)*buffer.readUInt32BE(20))
})
test('actual export page reports save errors and never claims success',async()=>{
 const h=pageHarness();h.wx.saveImageToPhotosAlbum=o=>o.fail({errMsg:'denied'})
 const flow=h.page.exportImageReport('summary');h.respond();await flow
 assert.equal(h.saved.length,0);assert.equal(h.files.size,0);assert.equal(h.modals[0].title,'图片导出未完成');assert.equal(h.page.data.exporting,false)
})
test('result contact copies only the loaded successful report and preserves disclaimer',async()=>{
 const h=pageHarness();let copied='',opened=0
 h.wx.setClipboardData=o=>{copied=o.data;o.success()};h.wx.openCustomerServiceChat=()=>opened++
 const flow=h.page.onCustomerServiceTap();h.respond();await new Promise(resolve=>setImmediate(resolve))
 assert.ok(copied.includes('synthetic-assessment'));assert.ok(copied.includes('仅供参考，不保证录取'));assert.equal(opened,0)
 h.modals[0].success({confirm:true});await flow;assert.equal(opened,1);assert.equal(h.requests.length,1)
})
