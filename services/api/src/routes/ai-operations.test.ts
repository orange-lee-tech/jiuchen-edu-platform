import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import type { AppEnv } from '../config/env.js'
import { registerAiOperationsRoutes } from './ai-operations.js'
import { registerAssessmentKeyObjectRoutes } from './assessment-key-objects.js'
function database(role:string){
  const db={select(){const q={from(){return q},innerJoin(){return q},leftJoin(){return q},where(){return q},
    async limit(){return [{sessionId:'session',userId:'user',role,status:'active',displayName:'synthetic',
      internalIdStatus:'claimed',expiresAt:new Date('2099-01-01T00:00:00Z')}]}};return q}}
  return {configured:true,db,pool:{query:async()=>{throw new Error('unexpected_database_secret_read')}}} as unknown as DatabaseContext
}
test('official balances and model mutation reject anonymous, student and teacher before credentials are read',async()=>{
  for(const role of [null,'student','teacher']){
    for(const [method,url] of [['GET','/me/admin/ai-operations/11111111-1111-4111-8111-111111111111/balance'],
      ['POST','/me/admin/ai-operations/11111111-1111-4111-8111-111111111111/balance/refresh'],
      ['PUT','/me/admin/ai-operations/11111111-1111-4111-8111-111111111111/balance/threshold'],
      ['POST','/me/admin/assessment-keys/11111111-1111-4111-8111-111111111111/change-model']] as const){
      const app=Fastify(),db=database(role??'student')
      registerAiOperationsRoutes(app,db,{} as AppEnv);registerAssessmentKeyObjectRoutes(app,db,{} as AppEnv,async()=>{})
      const response=await app.inject({method,url,headers:role?{authorization:'Bearer synthetic'}:{}})
      assert.equal(response.statusCode,role?403:401);await app.close()
    }
  }
})
test('administrator key reveal endpoint never returns a plaintext key even with a PIN',async()=>{
  const app=Fastify()
  registerAssessmentKeyObjectRoutes(app,database('admin'),{} as AppEnv,async()=>{})
  const response=await app.inject({method:'POST',url:'/me/admin/assessment-keys/11111111-1111-4111-8111-111111111111/reveal',
    headers:{authorization:'Bearer synthetic'},payload:{pin:'123456'}})
  assert.equal(response.statusCode,403)
  assert.deepEqual(response.json(),{ok:false,error:'key_reveal_not_supported'})
  assert.equal('apiKey' in response.json(),false)
  await app.close()
})
