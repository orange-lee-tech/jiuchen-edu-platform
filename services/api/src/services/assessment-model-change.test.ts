import assert from 'node:assert/strict'
import test from 'node:test'
import type mysql from 'mysql2/promise'
import type { AppEnv } from '../config/env.js'
import { changeAssessmentObjectModel } from './assessment-model-change.js'
import { ControlError, pinDigest, sealKey } from './admin-control-boxes.js'

const master=Buffer.alloc(32,9).toString('base64'),salt='cd'.repeat(16)
function fixture(){
  const writes:Array<{sql:string;args:unknown[]}>=[]
  const head={initialized:1,version:4,pin_salt:salt,pin_hash:pinDigest('123456',salt),pin_locked:0,failed_attempts:0}
  const object={id:'object',provider:'deepseek',api_base_url:'https://api.deepseek.com',model:'old-model',version:2,
    encrypted_secret:sealKey('synthetic-key-only',master),temperature:.7,status:'active',creator_user_id:'creator'}
  let commits=0,rollbacks=0
  const connection={async beginTransaction(){},async commit(){commits++},async rollback(){rollbacks++},release(){},
    async query(sql:string,args:unknown[]=[]):Promise<[any,any]>{
      if(sql.includes('FROM assessment_key_head'))return [[head],null]
      if(sql.includes('FROM assessment_key_objects'))return [[object],null]
      writes.push({sql,args});return [[],null]
    }}
  return {pool:{getConnection:async()=>connection} as unknown as mysql.Pool,head,object,writes,counts:()=>({commits,rollbacks})}
}
const data={expectedVersion:4,expectedObjectVersion:2,currentPin:'123456',model:'new-model'}
const env={ADMIN_AI_KEY_ENCRYPTION_KEY:master} as AppEnv
test('same-object model change probes before activation and retains ciphertext/provider/base/id/creator',async()=>{
  const f=fixture(),original={...f.object}
  const result=await changeAssessmentObjectModel({pool:f.pool,actorId:'another-admin',id:'object',env,data,
    probe:async config=>{assert.equal(config.model,'new-model');assert.equal(config.temperature,.7);assert.equal(config.apiKey,'synthetic-key-only');assert.ok(!f.writes.some(row=>row.sql.includes('SET model=')));return true}})
  assert.equal(result.version,5);assert.equal(result.objectVersion,3)
  assert.deepEqual(f.object,original)
  const update=f.writes.find(row=>row.sql.includes('SET model='))!
  assert.deepEqual(update.args,['new-model','object'])
  assert.ok(!/encrypted_secret|api_base_url|creator_user_id|provider=/.test(update.sql))
  assert.ok(f.writes.some(row=>row.sql.includes("'change_model'")))
  assert.equal(JSON.stringify(result).includes('synthetic-key-only'),false)
})
test('wrong PIN/locked PIN/stale versions never invoke the supplier or update the model',async()=>{
  for(const change of [{currentPin:'999999',code:'control_pin_invalid'},
    {expectedVersion:3,code:'control_version_conflict'},
    {expectedObjectVersion:1,code:'assessment_object_version_conflict'}]){
    const f=fixture();let calls=0
    const {code,...values}=change
    await assert.rejects(()=>changeAssessmentObjectModel({pool:f.pool,actorId:'admin',id:'object',env,data:{...data,...values},probe:async()=>{calls++;return true}}),
      (error:unknown)=>error instanceof ControlError&&error.code===code)
    assert.equal(calls,0);assert.ok(!f.writes.some(row=>row.sql.includes('SET model=')))
  }
  const f=fixture();f.head.pin_locked=1
  await assert.rejects(()=>changeAssessmentObjectModel({pool:f.pool,actorId:'admin',id:'object',env,data,probe:async()=>true}),
    (error:unknown)=>error instanceof ControlError&&error.code==='control_pin_locked')
})
test('failed format probe and concurrent configuration change preserve active model',async()=>{
  const f=fixture()
  await assert.rejects(()=>changeAssessmentObjectModel({pool:f.pool,actorId:'admin',id:'object',env,data,probe:async()=>false}),
    (error:unknown)=>error instanceof ControlError&&error.code==='assessment_model_probe_failed')
  assert.ok(!f.writes.some(row=>row.sql.includes('SET model=')))
  assert.ok(f.writes.some(row=>row.sql.includes('change_model_probe_failed')))
  const concurrent=fixture()
  await assert.rejects(()=>changeAssessmentObjectModel({pool:concurrent.pool,actorId:'admin',id:'object',env,data,
    probe:async()=>{concurrent.head.version++;return true}}),
    (error:unknown)=>error instanceof ControlError&&error.code==='control_version_conflict')
  assert.ok(!concurrent.writes.some(row=>row.sql.includes('SET model=')))
})
