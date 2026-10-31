const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const ts=require('../../apps/miniprogram/node_modules/typescript')
const root=path.resolve(__dirname,'../../apps/miniprogram/miniprogram')
const settle=()=>new Promise(resolve=>setImmediate(resolve))
const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222'
function harness(){
  const storage=new Map(),requests=[],modals=[],cache=new Map();let definition
  const wx={getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value),removeStorageSync:key=>storage.delete(key),
    request:options=>requests.push(options),pageScrollTo(){},showToast(){},setNavigationBarTitle(){},
    showModal(options){modals.push(options);options.success?.({confirm:true,cancel:false})}}
  function load(relative){
    const filename=path.resolve(root,relative.endsWith('.ts')?relative:relative+'.ts')
    if(cache.has(filename))return cache.get(filename).exports
    const module={exports:{}};cache.set(filename,module)
    const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText
    vm.runInNewContext(source,{module,exports:module.exports,require:target=>target.includes('config/runtime')?
      {runtimeConfig:{apiTransport:'http',apiBaseUrl:'https://test.invalid'}}:load(path.relative(root,path.resolve(path.dirname(filename),target))),
      wx,Page:value=>{definition=value},getCurrentPages:()=>[],console,setTimeout,clearTimeout,setInterval,clearInterval,Date,Promise,Set,Map,WeakMap},{filename})
    return module.exports
  }
  const auth=load('utils/auth')
  auth.saveAuthResult({ok:true,user:{id:first,role:'admin',displayName:'synthetic'},businessIdentity:null,
    agreement:{type:'user_terms',version:'test',accepted:true},session:{token:'synthetic',expiresAt:'2099-01-01T00:00:00Z'}})
  load('pages/admin/admin')
  const page={...definition,data:JSON.parse(JSON.stringify(definition.data)),setData(values,callback){Object.assign(this.data,values);callback?.()}}
  return {page,requests,modals,respond(index,data,statusCode=200){requests[index].success({statusCode,data})}}
}
const object=id=>({id,label:'同名对象',provider:'deepseek',model:'deepseek-flash',version:2,status:'active',hasObjectPin:true})
test('administrator changes model through same-object endpoint with PIN and both expected versions',async()=>{
  const h=harness(),p=h.page;p.data.keyObjects=[object(first)];p.data.keyHead={version:7};p.loadControls=async()=>{}
  p.onOpenKeyAction({currentTarget:{dataset:{action:'model',id:first}}})
  p.setData({keyActionPin:'123456',keyCopyModel:'deepseek-v4-pro'})
  const pending=p.onConfirmKeyAction();await settle()
  assert.match(h.requests[0].url,new RegExp(`/assessment-keys/${first}/change-model$`))
  assert.equal(h.requests[0].method,'POST')
  assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0].data)),{expectedVersion:7,expectedObjectVersion:2,currentPin:'123456',model:'deepseek-v4-pro'})
  h.respond(0,{ok:true});await pending
  assert.equal(h.requests.length,1);assert.equal(p.data.keyActionPin,'')
})
test('the old reveal action cannot open a plaintext-key flow in the mini-program',()=>{
  const h=harness();h.page.data.keyObjects=[object(first)]
  h.page.onOpenKeyAction({currentTarget:{dataset:{action:'reveal',id:first}}})
  assert.equal(h.page.data.keyAction,'');assert.equal(h.requests.length,0)
})
test('a balance reading expires while the page remains open and clears a stale low-balance assertion',()=>{
  const h=harness(),now=Date.now()
  h.page.data.officialBalance={status:'fresh',balances:[{observedAt:new Date(now-300001).toISOString(),fresh:true,lowBalance:true}]}
  h.page.expireOfficialBalance(now)
  assert.equal(h.page.data.officialBalance.status,'stale')
  assert.equal(h.page.data.officialBalance.balances[0].fresh,false)
  assert.equal(h.page.data.officialBalance.balances[0].lowBalance,null)
})
test('switching balance objects ignores delayed responses and keeps official/manual observations separate',async()=>{
  const h=harness(),p=h.page;p.data.balanceAccounts=[object(first),object(second)]
  const a=p.onBalanceAccount({detail:{value:'0'}}),b=p.onBalanceAccount({detail:{value:'1'}})
  await settle();assert.equal(h.requests.length,4)
  h.respond(2,{ok:true,balance:{object:{id:second},status:'fresh',balances:[],windows:[]}})
  h.respond(3,{ok:true,history:[{id:'manual-second'}],estimate:null})
  await b
  h.respond(0,{ok:true,balance:{object:{id:first},status:'fresh',balances:[],windows:[]}})
  h.respond(1,{ok:true,history:[{id:'manual-first'}],estimate:null})
  await a;await settle()
  assert.equal(p.data.officialBalance.object.id,second)
  assert.equal(p.data.balanceLedger.history[0].id,'manual-second')
  assert.equal(p.data.showManualBalance,false)
})
test('official price parsing only fills a draft; reviewed version requires a separate deliberate submit',async()=>{
  const h=harness(),p=h.page;p.loadAnalytics=async()=>{}
  const pending=p.onCheckDeepseekPriceSource();await settle()
  const draft={model:'deepseek-flash',currency:'USD',unit:'per_1000000_tokens',inputCacheHitPerMillion:.003,
    inputCacheMissPerMillion:.15,outputPerMillion:.6,peakInputCacheHitPerMillion:.006,peakInputCacheMissPerMillion:.3,
    peakOutputPerMillion:1.2,peakWindowUtc:'synthetic reviewed time rule'}
  h.respond(0,{ok:true,status:'review_required',sourceUrl:'https://api-docs.deepseek.com/quick_start/pricing/',
    fetchedAt:'2026-10-30T00:00:00Z',parserVersion:'test',drafts:[draft],parseError:null})
  await pending;assert.equal(h.requests.length,1)
  p.onOfficialPriceDraft({detail:{value:'0'}})
  assert.equal(p.data.aiPriceHit,'0.003');assert.equal(p.data.aiPricePeakHit,'0.006')
  assert.equal(h.requests.length,1,'selecting a draft never writes a reviewed price')
  p.setData({aiCosts:{priceSource:{status:'review_required'},latestPriceVersions:[]},aiPriceDate:'2026-10-30',aiPriceNote:'合成测试人工核对说明'})
  const review=p.onReviewAiPrice();await settle()
  assert.match(h.requests[1].url,/assessment-ai-prices\/review$/)
  assert.equal(h.requests[1].data.peakInputCacheHitPerMillion,.006)
  h.respond(1,{ok:true,version:'synthetic'});await review
})
