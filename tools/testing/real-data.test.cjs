const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const ts=require('../../apps/miniprogram/node_modules/typescript'),root=path.resolve(__dirname,'../../apps/miniprogram/miniprogram')
function loadModules(wx={}){
 const cache=new Map();let pageDefinition
 function load(name){const file=path.resolve(root,name.endsWith('.ts')?name:name+'.ts');if(cache.has(file))return cache.get(file).exports
  const module={exports:{}};cache.set(file,module)
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  vm.runInNewContext(source,{module,exports:module.exports,require:n=>n.includes('config/runtime')?{runtimeConfig:{apiTransport:'http',apiBaseUrl:'https://synthetic.invalid'}}:load(path.relative(root,path.resolve(path.dirname(file),n))),wx,console,Page:p=>pageDefinition=p,getCurrentPages:()=>[],setTimeout,clearTimeout})
  return module.exports}
 load.page=()=>({...pageDefinition,data:JSON.parse(JSON.stringify(pageDefinition.data)),setData(value){Object.assign(this.data,value)}})
 return load
}
test('news dates use Beijing time and distinguish verified publications from legacy updates',()=>{
 const {newsPublicationLabel}=loadModules()('utils/news-date')
 assert.match(newsPublicationLabel({source:'manual',publishedAt:'2026-10-11T16:00:01Z'},true),/2026-10-12 00:00:01/)
 assert.match(newsPublicationLabel({source:'wechat_official',publishedAt:'2026-09-25T01:00:02Z'}),/发表时间待核实.*来源更新/)
 assert.equal(newsPublicationLabel({source:'wechat_official',publishedAt:null}),'发表时间待核实')
})
test('identity filters preserve paused authorization while showing actual assignment and profile flags',()=>{
 const {filterInternalIds,internalIdView,ID_FILTERS}=loadModules()('utils/admin-id-view')
 const base={id:'1',businessId:'JCS-SYNTHETIC',type:'student',status:'claimed',userId:'owner',assignmentState:'unassigned',profileState:'incomplete',nameLabel:'待完善实名',assignmentLabel:'未分配'}
 assert.equal(filterInternalIds([base],'',ID_FILTERS.indexOf('未分配')).length,1)
 assert.equal(filterInternalIds([base],'',ID_FILTERS.indexOf('资料待完善')).length,1)
 const paused=internalIdView({...base,status:'disabled',assignmentState:'assigned',assignmentLabel:'已分配'})
 assert.equal(paused.statusLabel,'已暂停');assert.equal(paused.allocationLabel,'已分配')
 assert.ok(!paused.actions.includes('绑定账号'))
 const own=internalIdView({...base,userId:'owner'},'owner');assert.equal(own.actions.length,0)
 const screen=fs.readFileSync(path.join(root,'pages/admin/admin.wxml'),'utf8')
 assert.match(screen,/实际负责学员：\{\{item.assignmentCount/)
})
test('news administrator defaults to publication ordering and switches classification priority explicitly',()=>{
 const load=loadModules();load('pages/admin/admin');const page=load.page()
 page.data.posts=[{id:'new',tags:['已分类'],publishedAt:'2026-10-12T01:00:00Z',source:'manual'},{id:'old',tags:[],publishedAt:'2026-10-11T01:00:00Z',source:'manual'}]
 assert.equal(page.data.newsUnclassifiedFirst,false)
 page.onNewsSort();assert.equal(page.data.posts[0].id,'old');page.onNewsSort();assert.equal(page.data.posts[0].id,'new')
})
test('analytics page retains successful assessments but removes error-backed payment plots',async()=>{
 const storage=new Map(),requests=[],wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),request:o=>requests.push(o)}
 const load=loadModules(wx),auth=load('utils/auth')
 auth.saveAuthResult({ok:true,user:{id:'00000000-0000-4000-8000-000000000001',role:'admin',displayName:'合成'},agreement:{type:'user_terms',version:'test',accepted:true},session:{token:'synthetic',expiresAt:'2099-01-01'},businessIdentity:null})
 load('pages/admin/admin');const page=load.page(),flow=page.loadAnalytics()
 requests[0].success({statusCode:200,data:{analytics:{period:'week',buckets:[{key:'2026-10-12',label:'10/12',assessmentCount:3,failedCount:0,runningCount:0,rechargeCount:null,rechargeAmountFen:null,consumptionCount:null}],summary:{assessmentCount:3,rechargeAmountFen:null},sources:{assessments:{status:'ok'},payments:{status:'error',error:'ER_NO_SUCH_TABLE'},ledger:{status:'error',error:'ER_NO_SUCH_TABLE'},reservations:{status:'ok'}},payers:[],range:{},ledger:{},gaps:{},reservations:{},supplier:{}}}})
 requests[1].success({statusCode:503,data:{ok:false,error:'database_error'}})
 await flow;assert.equal(page.data.analytics.summary.assessmentCount,3);assert.match(page.data.analyticsWarning,/支付读取失败/)
 assert.equal(page.data.userCount,null);assert.ok(page.data.userCountError)
 assert.equal(page.data.analyticsPlots.some(p=>p.key==='rechargeCount'),false)
 assert.equal(page.data.analyticsPlots.find(p=>p.key==='failedCount').max,0)
})
test('account total uses real users endpoint and does not follow assessment period counts',async()=>{
 const storage=new Map(),requests=[],wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),request:o=>requests.push(o)}
 const load=loadModules(wx),auth=load('utils/auth')
 auth.saveAuthResult({ok:true,user:{id:'00000000-0000-4000-8000-000000000001',role:'admin'},agreement:{type:'user_terms',version:'test',accepted:true},session:{token:'synthetic',expiresAt:'2099-01-01'},businessIdentity:null})
 load('pages/admin/admin');const page=load.page(),flow=page.loadAnalytics()
 assert.match(requests[1].url,/me\/admin\/users/)
 requests[0].success({statusCode:200,data:{ok:true,analytics:{period:'week',buckets:[],summary:{assessmentCount:0,rechargeAmountFen:null},sources:{assessments:{status:'ok'},payments:{status:'error',error:'missing'},ledger:{status:'error',error:'missing'},reservations:{status:'error',error:'missing'}},payers:[],range:{},ledger:{},gaps:{},reservations:{},supplier:{}}}})
 requests[1].success({statusCode:200,data:{ok:true,users:[{id:'u1'},{id:'u2'}]}})
 await flow;assert.equal(page.data.analytics.summary.assessmentCount,0);assert.equal(page.data.userCount,2);assert.equal(page.data.userCountError,'')
})
