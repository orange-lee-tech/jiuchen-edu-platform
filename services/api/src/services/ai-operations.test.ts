import assert from 'node:assert/strict'
import test from 'node:test'
import type mysql from 'mysql2/promise'
import type { AppEnv } from '../config/env.js'
import { sealKey } from './admin-control-boxes.js'
import { assessmentObjectConfigurationFingerprint } from './assessment-key-objects.js'
import { parseOfficialDeepseekBalance, fetchOfficialDeepseekBalance } from './deepseek-balance.js'
import { accountDifferences, officialBalanceFresh, refreshOfficialObjectBalance,
  beginAssessmentBalanceWindow, finishAssessmentBalanceWindow, readOfficialBalanceStatus } from './ai-operations.js'

const master=Buffer.alloc(32,8).toString('base64'),env={ADMIN_AI_KEY_ENCRYPTION_KEY:master} as AppEnv
const payload=(total='9.12')=>({is_available:true,balance_infos:[{currency:'CNY',total_balance:total,granted_balance:'0.00',topped_up_balance:total}]})
test('official balance validates all monetary fields and strips unknown fields/credentials',async()=>{
  const parsed=parseOfficialDeepseekBalance({...payload(),secret:'must-not-return'})
  assert.equal(parsed.balances[0].total,'9.12');assert.equal(JSON.stringify(parsed).includes('secret'),false)
  for(const broken of [null,{}, {is_available:'true',balance_infos:[]},
    {is_available:true,balance_infos:[{currency:'EUR',total_balance:'1'}]},
    {...payload(),balance_infos:[{currency:'CNY',total_balance:'9',granted_balance:-1,topped_up_balance:'9'}]}])
    assert.throws(()=>parseOfficialDeepseekBalance(broken))
  let requested=''
  const result=await fetchOfficialDeepseekBalance('synthetic-key',(async(url,init)=>{
    requested=String(url);assert.equal(init?.redirect,'error')
    assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer synthetic-key')
    return new Response(JSON.stringify(payload()),{status:200})
  }) as typeof fetch)
  assert.equal(result.status,'official_observation');assert.equal(requested,'https://api.deepseek.com/user/balance')
  assert.equal(JSON.stringify(result).includes('synthetic-key'),false)
  const denied=await fetchOfficialDeepseekBalance('synthetic-key',(async()=>new Response('sensitive-provider-error',{status:401})) as typeof fetch)
  assert.deepEqual(denied,{status:'unavailable',httpStatus:401,error:'provider_balance_authentication'})
})
test('freshness rejects expired/future times; exact account differences remain unallocated including topups',()=>{
  const now=Date.now()
  assert.equal(officialBalanceFresh(new Date(now-299999),now),true)
  assert.equal(officialBalanceFresh(new Date(now-300001),now),false)
  assert.equal(officialBalanceFresh(new Date(now+1),now),false)
  const observation=(amount:string)=>parseOfficialDeepseekBalance(payload(amount))
  assert.deepEqual(accountDifferences(observation('9.12'),observation('9.11999999')),
    [{currency:'CNY',difference:'0.00000001',status:'unallocated'}])
  assert.deepEqual(accountDifferences(observation('9.12'),observation('10.00')),
    [{currency:'CNY',difference:'-0.88000000',status:'unallocated'}])
  assert.deepEqual(accountDifferences(null,observation('10.00')),[])
})
function fixture(){
  const writes:Array<{sql:string;args:unknown[]}>=[]
  const object={id:'object',label:'synthetic',provider:'deepseek',api_base_url:'https://api.deepseek.com',
    encrypted_secret:sealKey('synthetic-secret',master),version:2,status:'active',creator_user_id:'admin',model:'deepseek-flash'}
  const head={active_object_id:'object',version:3}
  let before:string|null=null,concurrent=0,binding:Record<string,unknown>={}
  const query=async(sql:string,args:unknown[]=[]):Promise<[any,any]>=>{
    if(sql.includes('FROM assessment_key_objects'))return [[object],null]
    if(sql.includes('FROM assessment_key_head'))return [[head],null]
    if(sql.includes('SELECT warning_threshold'))return [[{warning_threshold:'10.00'}],null]
    if(sql.includes('FROM ai_balance_settings'))return [[],null]
    if(sql.includes('FROM ai_balance_snapshots'))return [[],null]
    if(sql.includes('FROM ai_assessment_balance_windows'))return [before?[{object_id:'object',...binding,before_json:before,started_at:new Date(0)}]:[],null]
    if(sql.includes('FROM assessment_ai_calls'))return [[{count:concurrent}],null]
    if(sql.includes('INSERT IGNORE INTO ai_assessment_balance_windows')){before=args[5]==null?null:String(args[5]);binding={object_version:args[2],head_version:args[3],configuration_fingerprint:args[4]}}
    writes.push({sql,args});return [[],null]
  }
  const connection={query,async beginTransaction(){},async commit(){},async rollback(){},release(){}}
  return {pool:{query,getConnection:async()=>connection} as unknown as mysql.Pool,object,head,writes,setConcurrent:(count:number)=>{concurrent=count}}
}
test('automatic observations reuse snapshots and fail without fabricating or overwriting last success',async()=>{
  const f=fixture()
  const result=await refreshOfficialObjectBalance({pool:f.pool,env,objectId:'object',actorId:'admin',transport:(async()=>new Response(JSON.stringify(payload()))) as typeof fetch})
  assert.equal(result.status,'official_observation')
  const insert=f.writes.find(row=>row.sql.includes('INSERT INTO ai_balance_snapshots'))!
  assert.match(insert.sql,/'official'/);assert.equal(insert.args[4],'9.12');assert.equal(insert.args[5],'10.00')
  assert.equal(f.writes.some(row=>JSON.stringify(row.args).includes('synthetic-secret')),false)
  f.writes.length=0
  await refreshOfficialObjectBalance({pool:f.pool,env,objectId:'object',transport:(async()=>new Response('',{status:503})) as typeof fetch})
  assert.equal(f.writes.some(row=>row.sql.includes('INSERT INTO ai_balance_snapshots')),false)
  assert.ok(f.writes.some(row=>row.sql.includes('last_error')))
  f.object.provider='unsupported'
  let network=0
  assert.equal((await refreshOfficialObjectBalance({pool:f.pool,env,objectId:'object',transport:(async()=>{network++;throw new Error()}) as typeof fetch})).status,'unsupported')
  assert.equal(network,0)
})
test('complete assessment window captures both ends and concurrent/account-shared differences stay unallocated',async()=>{
  for(const concurrent of [0,2]){
    const f=fixture();f.setConcurrent(concurrent);let reads=0
    const transport=(async()=>new Response(JSON.stringify(payload(reads++===0?'9.12':'9.00')))) as typeof fetch
    await beginAssessmentBalanceWindow(f.pool,env,'assessment',{objectId:'object',version:3,objectVersion:2,
      configurationFingerprint:assessmentObjectConfigurationFingerprint(f.object),provider:'deepseek',model:'deepseek-flash'},transport)
    await finishAssessmentBalanceWindow(f.pool,env,'assessment',transport)
    assert.equal(reads,2)
    const update=f.writes.find(row=>row.sql.includes('UPDATE ai_assessment_balance_windows'))!
    assert.equal(update.args[1],'unallocated')
    assert.equal(update.args[2],concurrent?'concurrent_object_calls_observed':'shared_account_topups_or_delayed_settlement_not_excluded')
  }
})
test('key/model/head changes during a running assessment cannot form a cross-configuration balance difference',async()=>{
  for(const mutate of [(f:ReturnType<typeof fixture>)=>{f.object.encrypted_secret=sealKey('changed-synthetic-key',master)},
    (f:ReturnType<typeof fixture>)=>{f.object.version++},
    (f:ReturnType<typeof fixture>)=>{f.head.version++}]){
    const f=fixture();let reads=0
    const transport=(async()=>{reads++;return new Response(JSON.stringify(payload()))}) as typeof fetch
    await beginAssessmentBalanceWindow(f.pool,env,'assessment',{objectId:'object',version:3,objectVersion:2,
      configurationFingerprint:assessmentObjectConfigurationFingerprint(f.object),provider:'deepseek',model:'deepseek-flash'},transport)
    mutate(f)
    await finishAssessmentBalanceWindow(f.pool,env,'assessment',transport)
    assert.equal(reads,1,'changed credentials are not used to observe the old runtime window')
    const update=f.writes.find(row=>row.sql.includes('UPDATE ai_assessment_balance_windows'))!
    assert.equal(update.args[0],null);assert.equal(update.args[1],'unavailable')
    assert.match(String(update.args[2]),/configuration_changed/)
  }
})
test('reading stored official status performs no supplier request and distinguishes unsupported accounts',async()=>{
  const f=fixture();f.object.provider='unavailable-supplier'
  const result=await readOfficialBalanceStatus(f.pool,'object')
  assert.equal(result.status,'unsupported');assert.equal(result.attribution,'unallocated')
  assert.equal(JSON.stringify(result).includes('encrypted_secret'),false)
})
