import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import { registerNewsV2Routes } from './news-v2.js'

function fixture(role:'student'|'teacher'|'admin'|null){
  const app=Fastify({logger:false})
  let calls=0
  const query={from(){return this},innerJoin(){return this},leftJoin(){return this},where(){return this},async limit(){
    return role?[{userId:'synthetic-user',role,status:'active',internalIdStatus:'claimed',expiresAt:new Date('2099-01-01')}]:[]
  }}
  const database={configured:true,db:{select(){return query}},pool:{async query(){calls++;return [[]]}}} as unknown as DatabaseContext
  registerNewsV2Routes(app,database)
  return {app,getCalls:()=>calls}
}

test('favorites are session scoped; unauthenticated and invalid IDs never touch the store',async()=>{
  const {app,getCalls}=fixture(null)
  assert.equal((await app.inject({method:'GET',url:'/me/news-favorites'})).statusCode,401)
  assert.equal((await app.inject({method:'PUT',url:'/me/news-favorites/invalid',headers:{authorization:'Bearer synthetic'}})).statusCode,401)
  assert.equal(getCalls(),0)
  await app.close()
  const student=fixture('student')
  assert.equal((await student.app.inject({method:'PUT',url:'/me/news-favorites/invalid',headers:{authorization:'Bearer synthetic'}})).statusCode,400)
  assert.equal(student.getCalls(),0)
  await student.app.close()
})

test('students and teachers cannot change retirement task state or mark admin alerts read',async()=>{
  for(const role of ['student','teacher'] as const){
    const {app,getCalls}=fixture(role)
    const headers={authorization:'Bearer synthetic'}
    assert.equal((await app.inject({method:'GET',url:'/me/news-retirements',headers})).statusCode,role==='student'?403:200)
    assert.equal((await app.inject({method:'POST',url:'/me/news-retirements/00000000-0000-4000-8000-000000000001/read',headers})).statusCode,403)
    assert.equal((await app.inject({method:'PUT',url:'/me/news-retirement-tasks/00000000-0000-4000-8000-000000000001',headers,payload:{state:'doing',note:''}})).statusCode,403)
    assert.equal(getCalls(),role==='teacher'?1:0)
    await app.close()
  }
})
