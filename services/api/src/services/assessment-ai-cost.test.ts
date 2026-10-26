import assert from 'node:assert/strict'
import test from 'node:test'
import type mysql from 'mysql2/promise'
import type { AppEnv } from '../config/env.js'
import { sealKey } from './admin-control-boxes.js'
import { createJsonModelProvider, parseModelTokenUsage } from './ai-provider.js'
import { checkDeepseekPriceSource, estimateAssessmentTokenRange, recordAssessmentModelCall,
  reviewDeepseekPrice } from './assessment-ai-cost.js'
import { readAdminAssessmentAiCosts, readAdminDeepseekBalance,
  readTeacherAssessmentAiCosts } from './assessment-ai-cost-summary.js'
import { ControlError } from './admin-control-boxes.js'

test('provider usage extracts only numeric counters from a simulated response',async()=>{
  assert.equal(parseModelTokenUsage({prompt_tokens:'99'}),null)
  let observed:ReturnType<typeof parseModelTokenUsage>|undefined
  let chars=0,budget=0
  const provider=createJsonModelProvider({baseUrl:'https://example.com',apiKey:'synthetic-test',model:'synthetic',
    transport:async()=>({ok:true,status:200,json:async()=>({usage:{prompt_tokens:120,
      completion_tokens:80,prompt_cache_hit_tokens:30,prompt_cache_miss_tokens:90,
      completion_tokens_details:{reasoning_tokens:12}},choices:[{message:{content:'{}'}}]})})})
  await provider.generateJson({system:'safe',user:'synthetic',maxTokens:400,
    onUsage:usage=>{observed=usage},onPrepared:(c,b)=>{chars=c;budget=b}})
  assert.deepEqual(observed,{promptTokens:120,completionTokens:80,cacheHitTokens:30,
    cacheMissTokens:90,reasoningTokens:12})
  assert.ok(chars>0);assert.equal(budget,400)
})

test('call observations retain unknown usage and mark failed calls for reconciliation',async()=>{
  const statements:Array<{sql:string;params:unknown[]}>=[]
  const pool={async query(sql:string,params:unknown[]=[]):Promise<[any,any]>{
    statements.push({sql,params});return [sql.startsWith('SELECT')?[]:[],null]
  }} as unknown as mysql.Pool
  const identity={provider:'deepseek',model:'deepseek-v4-pro',objectId:'obj',version:3}
  const base={callId:'call',phase:'initial' as const,requestCount:1}
  await recordAssessmentModelCall(pool,'assessment',{...base,outcome:'started'},identity)
  await recordAssessmentModelCall(pool,'assessment',{...base,outcome:'failed',usage:null,
    promptChars:4500,outputBudget:4096},identity)
  const update=statements.at(-1)!
  assert.equal(update.params[12],'awaiting_reconciliation')
  assert.equal(update.params[13],'call')
  assert.equal(update.params[14],'assessment')
  assert.ok(!JSON.stringify(statements).includes('synthetic-test'))
  const range=estimateAssessmentTokenRange(4500,4096)
  assert.ok(range.upperTokensWithOneRepair>range.lowerTokens)
  assert.equal(range.repairBudget,1)
})

test('teacher cost query is scoped by active assignment and exposes no balance or price',async()=>{
  let sql='',params:unknown[]=[]
  const pool={async query(text:string,args:unknown[]):Promise<[any,any]>{
    if(!text.includes('AVG(c.prompt_chars)'))return [[],null]
    sql=text;params=args;return [[{calls:2,initialCalls:1,repairCalls:1,
      usageReturned:1,awaitingReconciliation:1,promptTokens:100,
      completionTokens:50,avgPromptChars:1000,avgOutputBudget:2000}],null]
  }} as unknown as mysql.Pool
  const result=await readTeacherAssessmentAiCosts(pool,'teacher-user','assessment-id')
  assert.match(sql,/EXISTS \(SELECT 1 FROM students/)
  assert.match(sql,/t\.user_id=\?/)
  assert.match(sql,/a\.id=\?/)
  assert.deepEqual(params,['teacher-user','assessment-id'])
  assert.equal(result.scope,'assigned_students')
  assert.equal(result.providerBalance,'forbidden')
  assert.equal(result.providerPrices,'forbidden')
  assert.ok(result.tokenForecast)
})

test('admin forecast uses reviewed price and dated FX but never labels estimates as supplier billing',async()=>{
  const now=new Date()
  const pool={async query(sql:string):Promise<[any,any]>{
    if(sql.includes('AVG(c.prompt_chars)'))return [[{calls:2,initialCalls:1,repairCalls:1,
      usageReturned:1,awaitingReconciliation:1,promptTokens:1200,
      completionTokens:600,avgPromptChars:4000,avgOutputBudget:2000}],null]
    if(sql.includes('GROUP BY provider,model'))return [[{provider:'deepseek',model:'deepseek-v4-pro',
      calls:2,usageReturned:1,awaitingReconciliation:1}],null]
    if(sql.includes('FROM assessment_ai_price_versions'))return [[{id:'price-v1',provider:'deepseek',
      model:'deepseek-v4-pro',currency:'USD',input_cache_miss_per_million:'1',
      output_per_million:'2',peak_input_cache_miss_per_million:'1.5',
      peak_output_per_million:'3',source_url:'https://api-docs.deepseek.com/quick_start/pricing/',
      source_sha256:'b'.repeat(64),effective_at:now,fetched_at:now,reviewed_at:now}],null]
    if(sql.includes('FROM assessment_key_head'))return [[{provider:'deepseek',model:'deepseek-v4-pro'}],null]
    if(sql.includes('FROM assessment_ai_price_source_checks'))return [[{source_sha256:'b'.repeat(64),fetched_at:now}],null]
    if(sql.includes('FROM assessment_ai_fx_versions'))return [[{id:'fx-v1',rate:'7',
      source_url:'https://bank.example/rate',observed_at:now,reviewed_at:now}],null]
    if(sql.includes('FROM assessment_ai_price_heads'))return [[{provider:'deepseek',
      model:'deepseek-v4-pro',latest_version:'price-v1'}],null]
    return [[],null]
  }} as unknown as mysql.Pool
  const result=await readAdminAssessmentAiCosts(pool)
  assert.equal(result.scope,'platform')
  assert.equal(result.forecast?.status,'reviewed_price_estimate')
  assert.ok((result.forecast?.costRange?.maxCnyWithOneRepair??0)>
    (result.forecast?.costRange?.minCny??0))
  assert.equal(result.forecast?.costRange?.priceVersion,'price-v1')
  assert.equal(result.forecast?.costRange?.fxSource,'https://bank.example/rate')
  assert.equal(result.actualSupplierCharge,'not_connected')
})

test('teacher receives only scoped monetary range when reviewed snapshots exist',async()=>{
  const now=new Date()
  const pool={async query(sql:string,args:unknown[]=[]):Promise<[any,any]>{
    if(sql.includes('AVG(c.prompt_chars)')){
      assert.deepEqual(args,['assigned-teacher'])
      return [[{calls:1,initialCalls:1,repairCalls:0,usageReturned:1,
        awaitingReconciliation:0,promptTokens:1000,completionTokens:500,
        avgPromptChars:4000,avgOutputBudget:2000}],null]
    }
    if(sql.includes('INNER JOIN assessment_ai_price_versions'))return [[{currency:'USD',
      input_cache_miss_per_million:'1',output_per_million:'2',
      peak_input_cache_miss_per_million:'1.5',peak_output_per_million:'3',
      source_sha256:'c'.repeat(64),reviewed_at:now}],null]
    if(sql.includes('FROM assessment_ai_price_source_checks'))return [[{source_sha256:'c'.repeat(64)}],null]
    if(sql.includes('FROM assessment_ai_fx_versions'))return [[{rate:'7',observed_at:now}],null]
    return [[],null]
  }} as unknown as mysql.Pool
  const result=await readTeacherAssessmentAiCosts(pool,'assigned-teacher')
  assert.ok((result.costForecast?.maxCnyWithOneRepair??0)>0)
  assert.equal(result.providerPrices,'forbidden')
  assert.equal(result.providerBalance,'forbidden')
  assert.equal(JSON.stringify(result).includes('input_cache_miss_per_million'),false)
})

test('reviewed DeepSeek price requires expected version and commits audit atomically',async()=>{
  const statements:Array<{sql:string;params:unknown[]}>=[]
  let committed=0,rolledBack=0,released=0
  const connection={async beginTransaction(){},async commit(){committed++},
    async rollback(){rolledBack++},release(){released++},
    async query(sql:string,params:unknown[]=[]):Promise<[any,any]>{
      statements.push({sql,params})
      return [sql.includes('SELECT latest_version')?[{latest_version:null}]:
        sql.includes('SELECT source_sha256')?[{source_sha256:'a'.repeat(64),fetched_at:new Date()}]:[],null]
    }}
  const pool={getConnection:async()=>connection} as unknown as mysql.Pool
  const data={pool,actorId:'admin',model:'deepseek-v4-pro',expectedLatestVersion:null,
    inputCacheHitPerMillion:.2,inputCacheMissPerMillion:1,outputPerMillion:2,
    peakInputCacheMissPerMillion:null,peakOutputPerMillion:null,peakWindowUtc:null,
    effectiveAt:new Date('2026-10-26T00:00:00Z'),reviewNote:'手工核对官方价格'}
  const result=await reviewDeepseekPrice(data)
  assert.ok(result.version)
  assert.ok(statements.some(item=>item.sql.includes('assessment_ai_cost_audit')))
  assert.deepEqual([committed,rolledBack,released],[1,0,1])
  await assert.rejects(()=>reviewDeepseekPrice({...data,expectedLatestVersion:'wrong'}),
    (error:unknown)=>error instanceof ControlError&&error.code==='price_version_conflict')
})

test('official price source checker pins one URL, bounds response and requests review on digest change',async()=>{
  const statements:string[]=[]
  const pool={async query(sql:string):Promise<[any,any]>{statements.push(sql);return [[],null]}} as unknown as mysql.Pool
  let requested=''
  const transport=(async(input:RequestInfo|URL,init?:RequestInit)=>{
    requested=String(input)
    assert.equal(init?.redirect,'error')
    return new Response('<html>synthetic price page</html>',{status:200})
  }) as typeof fetch
  const result=await checkDeepseekPriceSource(pool,transport)
  assert.equal(requested,'https://api-docs.deepseek.com/quick_start/pricing/')
  assert.equal(result.status,'review_required')
  assert.ok(statements.some(sql=>sql.includes('assessment_ai_price_source_checks')))
  await assert.rejects(()=>checkDeepseekPriceSource(pool,
    (async()=>new Response('x',{headers:{'content-length':'600001'}})) as typeof fetch),
  /price_source_too_large/)
})

test('official balance proxy returns only sanitized totals and caches the same active version',async()=>{
  const master=Buffer.alloc(32,7).toString('base64')
  const secret='synthetic-provider-key'
  const pool={async query(sql:string):Promise<[any,any]>{
    if(sql.includes('FROM assessment_key_head'))return [[{initialized:1,version:4,
      active_object_id:'balance-test-object'}],null]
    if(sql.includes('FROM assessment_key_objects'))return [[{id:'balance-test-object',
      status:'active',provider:'deepseek',api_base_url:'https://api.deepseek.com',
      model:'deepseek-v4-pro',temperature:0,encrypted_secret:sealKey(secret,master)}],null]
    return [[],null]
  }} as unknown as mysql.Pool
  const env={ADMIN_AI_KEY_ENCRYPTION_KEY:master} as AppEnv
  let calls=0
  const transport=(async(url:RequestInfo|URL,options?:RequestInit)=>{
    calls++;assert.equal(String(url),'https://api.deepseek.com/user/balance')
    assert.equal(options?.redirect,'error')
    assert.equal((options?.headers as Record<string,string>).Authorization,'Bearer '+secret)
    return new Response(JSON.stringify({is_available:true,balance_infos:[
      {currency:'CNY',total_balance:'10.25',granted_balance:'2',topped_up_balance:'8.25'}]}),
    {status:200,headers:{'content-type':'application/json'}})
  }) as typeof fetch
  const first=await readAdminDeepseekBalance(pool,env,transport,1000)
  const second=await readAdminDeepseekBalance(pool,env,transport,1100)
  assert.equal(calls,1);assert.deepEqual(first,second)
  assert.equal(first.status,'official_observation')
  assert.equal(JSON.stringify(first).includes(secret),false)
})
