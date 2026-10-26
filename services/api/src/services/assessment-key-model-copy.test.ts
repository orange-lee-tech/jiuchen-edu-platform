import assert from 'node:assert/strict'
import test from 'node:test'
import type mysql from 'mysql2/promise'
import { pinDigest, ControlError } from './admin-control-boxes.js'
import { copyAssessmentKeyForModel } from './assessment-key-objects.js'

const salt='ab'.repeat(16)
function fixture() {
  const writes:Array<{sql:string;params:unknown[]}>=[]
  let commits=0,rollbacks=0,releases=0
  const head={initialized:1,version:7,active_object_id:'source',pin_salt:salt,
    pin_hash:pinDigest('111111',salt),failed_attempts:0,pin_locked:0}
  const source={id:'source',creator_user_id:'admin',provider:'deepseek',
    api_base_url:'https://api.deepseek.com',model:'deepseek-flash',
    encrypted_secret:'ciphertext-only',temperature:0,note:'',status:'active',
    pin_salt:salt,pin_hash:pinDigest('222222',salt),failed_attempts:0,pin_locked:0}
  const connection={
    async beginTransaction(){},async commit(){commits++},async rollback(){rollbacks++},
    release(){releases++},
    async query(sql:string,params:unknown[]=[]):Promise<[any,any]>{
      if(sql.includes('FROM assessment_key_head')&&sql.includes('FOR UPDATE'))return [[head],null]
      if(sql.includes('FROM assessment_key_objects')&&sql.includes('FOR UPDATE'))return [[source],null]
      writes.push({sql,params});return [[],null]
    },
  }
  return {pool:{getConnection:async()=>connection} as unknown as mysql.Pool,
    source,head,writes,counts:()=>({commits,rollbacks,releases})}
}
const request={actorId:'admin',sourceId:'source',expectedVersion:7,
  currentPin:'111111',sourcePin:'222222',newPin:'333333',label:'新模型',
  model:'deepseek-v4-pro',note:'同平台模型',
  validateUrl:async(url:string)=>url}

test('copying a model retains ciphertext and provider URL, resets probe, audits origin and leaves active head intact',async()=>{
  const f=fixture()
  const result=await copyAssessmentKeyForModel({pool:f.pool,...request})
  assert.equal(result.active,false)
  assert.equal(result.sourceObjectId,'source')
  const insert=f.writes.find(item=>item.sql.includes('INSERT INTO assessment_key_objects'))!
  assert.equal(insert.params[2],'deepseek')
  assert.equal(insert.params[3],'https://api.deepseek.com')
  assert.equal(insert.params[4],'deepseek-v4-pro')
  assert.equal(insert.params[6],'ciphertext-only')
  assert.equal(insert.params.at(-1),'source')
  assert.match(insert.sql,/candidate.*NULL,NULL/s)
  assert.ok(!f.writes.some(item=>item.sql.includes('active_object_id=')))
  assert.ok(f.writes.some(item=>item.sql.includes('assessment_key_events')&&item.params[3]==='copy_model'))
  assert.deepEqual(f.counts(),{commits:1,rollbacks:0,releases:1})
})

test('model copy enforces version, creator, both PINs and trusted source address',async()=>{
  for(const change of [
    {expectedVersion:6,code:'control_version_conflict'},
    {currentPin:'999999',code:'control_pin_invalid'},
    {sourcePin:'999999',code:'object_pin_invalid'},
  ]){
    const f=fixture()
    await assert.rejects(()=>copyAssessmentKeyForModel({pool:f.pool,...request,...change}),
      (error:unknown)=>error instanceof ControlError&&error.code===change.code)
    assert.ok(!f.writes.some(item=>item.sql.includes('INSERT INTO assessment_key_objects')))
    assert.ok(f.writes.some(item=>item.sql.includes('assessment_key_events')&&
      String(item.params[3]).startsWith('copy_denied_')))
    assert.equal(f.counts().releases,1)
  }
  const f=fixture();f.source.creator_user_id='different-admin'
  await assert.rejects(()=>copyAssessmentKeyForModel({pool:f.pool,...request}),
    (error:unknown)=>error instanceof ControlError&&error.code==='assessment_key_creator_required')
  const bad=fixture()
  await assert.rejects(()=>copyAssessmentKeyForModel({...request,pool:bad.pool,
    validateUrl:async()=>{throw new ControlError('assessment_api_url_forbidden',400)}}),
  (error:unknown)=>error instanceof ControlError&&error.code==='assessment_api_url_forbidden')
})
