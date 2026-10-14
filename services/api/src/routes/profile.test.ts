import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { registerProfileRoutes } from './profile.js'
import { userSessions, userProfiles } from '../db/schema.js'
import type { DatabaseContext } from '../db/client.js'

function fixture(role='student') {
  let profile: Record<string,unknown>|null=null
  const session={sessionId:'synthetic',userId:'synthetic-user',role,status:'active',internalIdStatus:'claimed',expiresAt:new Date('2099-01-01')}
  const db={
    select(fields: Record<string,unknown>) {
      let table:unknown
      const q={from(t:unknown){table=t;return q},innerJoin(){return q},leftJoin(){return q},where(){return q},
        async limit(){
          if(table===userSessions)return [session]
          if(table!==userProfiles)throw new Error('unexpected_table')
          if(!profile)return []
          return [Object.fromEntries(Object.keys(fields).map(k=>[k,profile![k]??null]))]
        }}
      return q
    },
    insert(){return {async values(value:Record<string,unknown>){profile={...value}}}},
    update(){return {set(value:Record<string,unknown>){return {async where(){profile={...profile,...value}}}}}},
  }
  const app=Fastify()
  registerProfileRoutes(app,{configured:true,db,pool:null} as unknown as DatabaseContext)
  const headers={authorization:'Bearer synthetic-test-token'}
  return {app,headers}
}

test('profile GET/PUT/GET retains enrollment year and supports legacy null profiles',async()=>{
  const {app,headers}=fixture()
  try {
    const empty=await app.inject({url:'/me/profile',headers})
    assert.equal(empty.statusCode,200);assert.equal(empty.json().profile.enrollmentYear,null)
    const saved=await app.inject({method:'PUT',url:'/me/profile',headers,payload:{university:'测试大学',enrollmentYear:2022}})
    assert.equal(saved.statusCode,200);assert.equal(saved.json().profile.enrollmentYear,2022)
    const reopen=await app.inject({url:'/me/profile',headers})
    assert.equal(reopen.json().profile.enrollmentYear,2022)
    const clear=await app.inject({method:'PUT',url:'/me/profile',headers,payload:{enrollmentYear:null}})
    assert.equal(clear.statusCode,200);assert.equal(clear.json().profile.enrollmentYear,null)
    assert.equal(clear.json().profile.university,'测试大学')
    for(const year of [1989,2101,2022.5,'2022']){
      const invalid=await app.inject({method:'PUT',url:'/me/profile',headers,payload:{enrollmentYear:year}})
      assert.equal(invalid.statusCode,400)
    }
  } finally {await app.close()}
})
test('profile enrollment support preserves authentication and role checks',async()=>{
  const {app,headers}=fixture('teacher')
  try {
    assert.equal((await app.inject({url:'/me/profile'})).statusCode,401)
    assert.equal((await app.inject({url:'/me/profile',headers})).statusCode,403)
    assert.equal((await app.inject({method:'PUT',url:'/me/profile',headers,payload:{enrollmentYear:2022}})).statusCode,403)
  } finally {await app.close()}
})
