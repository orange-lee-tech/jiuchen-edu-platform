import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import { registerAdminCreditAdjustmentRoutes } from './admin-credit-adjustments.js'
import { registerReadOnlyWriteGuard } from '../services/read-only-context.js'

function fixture(role:string){
  let sqlCalls=0
  const db={select(){const q={from(){return q},innerJoin(){return q},leftJoin(){return q},where(){return q},
    async limit(){return [{userId:'admin',role,status:'active',internalIdStatus:'claimed',expiresAt:new Date('2099-01-01')}]} };return q}}
  const app=Fastify();registerReadOnlyWriteGuard(app)
  registerAdminCreditAdjustmentRoutes(app,{configured:true,db,pool:{query(){sqlCalls++;throw new Error('must not query')}}} as unknown as DatabaseContext)
  return {app,calls:()=>sqlCalls}
}
const payload={userId:'11111111-1111-4111-8111-111111111111',amount:3,reason:'合成补偿',pin:'123456',idempotencyKey:'22222222-2222-4222-8222-222222222222'}
test('credit adjustment routes deny student, teacher and readonly roles before any ledger query',async()=>{
  for(const role of ['student','teacher','staff']){
    const {app,calls}=fixture(role)
    try{for(const method of ['GET','POST'] as const){const result=await app.inject({method,url:'/me/admin/credit-adjustments',headers:{authorization:'Bearer synthetic'},...(method==='POST'?{payload}:{})});assert.equal(result.statusCode,403)}assert.equal(calls(),0)}
    finally{await app.close()}
  }
  const {app,calls}=fixture('admin')
  try{assert.equal((await app.inject({method:'POST',url:'/me/admin/credit-adjustments',headers:{authorization:'Bearer synthetic','x-jiuchen-read-only-target':'student:11111111-1111-4111-8111-111111111111'},payload})).statusCode,403);assert.equal(calls(),0)}finally{await app.close()}
})
test('credit adjustment requires login, bounded positive amount, reason and idempotency token',async()=>{
  const {app,calls}=fixture('admin')
  try{
    assert.equal((await app.inject({method:'POST',url:'/me/admin/credit-adjustments',payload})).statusCode,401)
    for(const invalid of [{amount:0},{amount:-1},{amount:1.5},{reason:' '},{pin:'12345'},{idempotencyKey:''},{userId:'not-an-id'}]){
      const response=await app.inject({method:'POST',url:'/me/admin/credit-adjustments',headers:{authorization:'Bearer synthetic'},payload:{...payload,...invalid}})
      assert.equal(response.statusCode,400)
    }
    assert.equal(calls(),0)
  }finally{await app.close()}
})
