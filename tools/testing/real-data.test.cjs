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
 const verified=internalIdView({...base,profileState:'recorded',nameLabel:'张三',name:'张三',displayName:'昵称不是实名'})
 assert.equal(verified.entityLabel,'张三');assert.equal(verified.schoolMajorLabel,'学校待补充 · 专业待补充')
 const screen=fs.readFileSync(path.join(root,'pages/admin/admin.wxml'),'utf8')
 assert.match(screen,/实际负责学员：\{\{item.assignmentCount/)
 assert.match(screen,/item.type === 'admin'.*item.assignmentLabel/)
})
test('news administrator defaults to publication ordering and switches classification priority explicitly',()=>{
 const load=loadModules();load('pages/admin/admin');const page=load.page()
 page.data.posts=[{id:'new',tags:['已分类'],publishedAt:'2026-10-12T01:00:00Z',source:'manual'},{id:'old',tags:[],publishedAt:'2026-10-11T01:00:00Z',source:'manual'}]
 assert.equal(page.data.newsUnclassifiedFirst,false)
 page.onNewsSort();assert.equal(page.data.posts[0].id,'old');page.onNewsSort();assert.equal(page.data.posts[0].id,'new')
})
test('news cards expose source date, keep every category and defer favorites until the V2 source is ready',()=>{
 const load=loadModules();load('pages/news/news');const page=load.page()
 const cards=[{id:'a',tags:['分类一']},{id:'b',tags:['分类二']}]
 assert.equal(page.filterArticles(cards,1,['全部','分类一','分类二'])[0].id,'a')
 const listing=fs.readFileSync(path.join(root,'pages/news/news.wxml'),'utf8')
 const detail=fs.readFileSync(path.join(root,'pages/news-detail/news-detail.wxml'),'utf8')
 const source=fs.readFileSync(path.join(root,'pages/news/news.ts'),'utf8')
 assert.match(listing,/来源：\{\{featured.sourceLabel\}\}/)
 assert.match(listing,/发布时间：\{\{featured.dateLabel\}\}/)
 assert.match(listing,/!loading && !featured.id/)
 assert.match(source,/return tags\s*\n/)
 assert.match(detail,/收藏原文 · 待开放/)
 assert.match(detail,/favoriteBusy \|\| !favoritesReady/)
 assert.match(detail,/\{\{favoriteError\}\}/)
})
test('Release A news response only reads the old public endpoint',async()=>{
 const requests=[],wx={request:o=>requests.push(o),getStorageSync:()=>null}
 const load=loadModules(wx)
 load('pages/news/news');const page=load.page(),flow=page.loadNews()
 assert.equal(new URL(requests[0].url).pathname,'/news')
 requests[0].success({statusCode:200,data:{ok:true,posts:[]}})
 await flow
 assert.equal(page.data.newsV2Enabled,false)
 assert.equal(requests.length,1,'no favorites or retirement request without server V2 flag')
})
test('analytics page retains successful assessments but removes error-backed payment plots',async()=>{
 const storage=new Map(),requests=[],wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),request:o=>requests.push(o)}
 const load=loadModules(wx),auth=load('utils/auth')
 auth.saveAuthResult({ok:true,user:{id:'00000000-0000-4000-8000-000000000001',role:'admin',displayName:'合成'},agreement:{type:'user_terms',version:'test',accepted:true},session:{token:'synthetic',expiresAt:'2099-01-01'},businessIdentity:null})
 load('pages/admin/admin');const page=load.page(),flow=page.loadAnalytics()
 requests[0].success({statusCode:200,data:{analytics:{period:'week',buckets:[{key:'2026-10-12',label:'10/12',assessmentCount:3,createdCount:4,failedCount:0,runningCount:0,rechargeCount:null,rechargeAmountFen:null,consumptionCount:null}],summary:{assessmentCount:3,assessmentUserCount:2,rechargeAmountFen:null},sources:{assessments:{status:'ok'},payments:{status:'error',error:'ER_NO_SUCH_TABLE'},ledger:{status:'error',error:'ER_NO_SUCH_TABLE'},reservations:{status:'ok'}},payers:[],range:{},ledger:{},gaps:{},reservations:{},supplier:{}}}})
 requests[1].success({statusCode:503,data:{ok:false,error:'database_error'}})
 await flow;assert.equal(page.data.analytics.summary.assessmentCount,3);assert.match(page.data.analyticsWarning,/支付读取失败/)
 assert.equal(page.data.userCount,null);assert.ok(page.data.userCountError)
 assert.equal(page.data.analyticsPlots.some(p=>p.key==='rechargeCount'),false)
 assert.equal(page.data.analyticsPlots.find(p=>p.key==='createdCount').points[0].display,'4')
 assert.equal(page.data.analyticsPlots.find(p=>p.key==='failedCount').max,0)
})
test('account total uses real users endpoint and does not follow assessment period counts',async()=>{
 const storage=new Map(),requests=[],wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),request:o=>requests.push(o)}
 const load=loadModules(wx),auth=load('utils/auth')
 auth.saveAuthResult({ok:true,user:{id:'00000000-0000-4000-8000-000000000001',role:'admin'},agreement:{type:'user_terms',version:'test',accepted:true},session:{token:'synthetic',expiresAt:'2099-01-01'},businessIdentity:null})
 load('pages/admin/admin');const page=load.page(),flow=page.loadAnalytics()
 assert.match(requests[1].url,/me\/admin\/users/)
 requests[0].success({statusCode:200,data:{ok:true,analytics:{period:'week',buckets:[],summary:{assessmentCount:0,assessmentUserCount:0,rechargeAmountFen:null},sources:{assessments:{status:'ok'},payments:{status:'error',error:'missing'},ledger:{status:'error',error:'missing'},reservations:{status:'error',error:'missing'}},payers:[],range:{},ledger:{},gaps:{},reservations:{},supplier:{}}}})
 requests[1].success({statusCode:200,data:{ok:true,users:[{id:'u1'},{id:'u2'}]}})
 await flow;assert.equal(page.data.analytics.summary.assessmentCount,0);assert.equal(page.data.userCount,2);assert.equal(page.data.userCountError,'')
})
test('Release A analytics without distinct-user field keeps real assessment data and marks the gap',async()=>{
 const storage=new Map(),requests=[],wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),request:o=>requests.push(o)}
 const load=loadModules(wx),auth=load('utils/auth')
 auth.saveAuthResult({ok:true,user:{id:'00000000-0000-4000-8000-000000000001',role:'admin'},agreement:{type:'user_terms',version:'test',accepted:true},session:{token:'synthetic',expiresAt:'2099-01-01'},businessIdentity:null})
 load('pages/admin/admin');const page=load.page(),flow=page.loadAnalytics()
 requests[0].success({statusCode:200,data:{ok:true,analytics:{period:'week',buckets:[{key:'2026-10-12',label:'10/12',assessmentCount:3,createdCount:4,failedCount:1,runningCount:0}],summary:{assessmentCount:3,createdCount:4,failedCount:1,runningCount:0,rechargeAmountFen:null},sources:{assessments:{status:'ok'},payments:{status:'error',error:'ER_NO_SUCH_TABLE'},ledger:{status:'error',error:'ER_NO_SUCH_TABLE'},reservations:{status:'error',error:'ER_NO_SUCH_TABLE'}},payers:[],range:{from:'2026-10-06',before:'2026-10-13',timezone:'Asia/Shanghai',basis:'合成口径'},ledger:{},gaps:{},reservations:{},supplier:{}}}})
 requests[1].success({statusCode:200,data:{ok:true,users:[{id:'synthetic'}]}})
 await flow
 assert.equal(page.data.analytics.summary.assessmentCount,3)
 assert.equal(page.data.assessmentUserCountLabel,'当前 API 未提供')
 assert.equal(page.data.analyticsPlots.find(p=>p.key==='createdCount').points[0].display,'4')
 assert.equal(page.data.analyticsPlots.some(p=>p.key==='rechargeAmountFen'),false)
})
test('admin pages only request their own Release A sources',()=>{
 for(const [section,expected] of [
  ['admin-users',['/me/admin/internal-ids','/me/admin/users']],
  ['admin-assignments',['/me/admin/students','/me/admin/teachers','/me/admin/assignments']],
  ['admin-news',['/me/admin/news']],
 ]){
  const storage=new Map(),requests=[],wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),request:o=>requests.push(o)}
  const load=loadModules(wx),auth=load('utils/auth')
  auth.saveAuthResult({ok:true,user:{id:'00000000-0000-4000-8000-000000000001',role:'admin'},agreement:{type:'user_terms',version:'test',accepted:true},session:{token:'synthetic',expiresAt:'2099-01-01'},businessIdentity:null})
  load('pages/admin/admin');const page=load.page()
  page.setData({section});void page.loadData()
  assert.deepEqual(requests.map(r=>new URL(r.url).pathname).sort(),expected.slice().sort())
 }
})
