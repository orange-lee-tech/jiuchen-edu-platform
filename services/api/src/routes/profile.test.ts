import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { registerProfileRoutes } from './profile.js'
import { userSessions, userProfiles, users, students } from '../db/schema.js'
import type { DatabaseContext } from '../db/client.js'

function fixture(role='student') {
  let profile: Record<string,unknown>|null=null
  let displayName:string|null=null
  let studentName='测试学员零三'
  const session={sessionId:'synthetic',userId:'synthetic-user',role,status:'active',internalIdStatus:'claimed',expiresAt:new Date('2099-01-01')}
  const db={
    async transaction<T>(work:(tx:unknown)=>Promise<T>){return work(db)},
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
    update(table:unknown){return {set(value:Record<string,unknown>){return {async where(){
      if(table===users)displayName=String(value.displayName)
      else if(table===students)studentName=String(value.name)
      else profile={...profile,...value}
    }}}}},
  }
  const app=Fastify()
  registerProfileRoutes(app,{configured:true,db,pool:null} as unknown as DatabaseContext)
  const headers={authorization:'Bearer synthetic-test-token'}
  return {app,headers,getDisplayName:()=>displayName,getStudentName:()=>studentName}
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
test('authenticated student sets a real display name and updates only their linked roster name',async()=>{
  const {app,headers,getDisplayName,getStudentName}=fixture()
  try{
    assert.equal((await app.inject({method:'PUT',url:'/me/display-name',payload:{displayName:'李同学'}})).statusCode,401)
    for(const displayName of ['', ' '.repeat(3), '甲'.repeat(81)]){
      assert.equal((await app.inject({method:'PUT',url:'/me/display-name',headers,payload:{displayName}})).statusCode,400)
    }
    assert.equal(getDisplayName(),null)
    const result=await app.inject({method:'PUT',url:'/me/display-name',headers,payload:{displayName:'  李同学  '}})
    assert.equal(result.statusCode,200)
    assert.equal(result.json().displayName,'李同学')
    assert.equal(getDisplayName(),'李同学')
    assert.equal(getStudentName(),'李同学')
  }finally{await app.close()}
})
test('a teacher account name edit does not change a student roster name',async()=>{
  const {app,headers,getStudentName}=fixture('teacher')
  try{
    assert.equal((await app.inject({method:'PUT',url:'/me/display-name',headers,payload:{displayName:'王老师'}})).statusCode,200)
    assert.equal(getStudentName(),'测试学员零三')
  }finally{await app.close()}
})
test('switching to admin updates the account label without overwriting the linked student name',async()=>{
  const {app,headers,getDisplayName,getStudentName}=fixture('admin')
  try{
    const result=await app.inject({method:'PUT',url:'/me/display-name',headers,payload:{displayName:'管理员显示名'}})
    assert.equal(result.statusCode,200)
    assert.equal(getDisplayName(),'管理员显示名')
    assert.equal(getStudentName(),'测试学员零三')
  }finally{await app.close()}
})
test('profile enrollment support preserves authentication and role checks',async()=>{
  const {app,headers}=fixture('teacher')
  try {
    assert.equal((await app.inject({url:'/me/profile'})).statusCode,401)
    assert.equal((await app.inject({url:'/me/profile',headers})).statusCode,403)
    assert.equal((await app.inject({method:'PUT',url:'/me/profile',headers,payload:{enrollmentYear:2022}})).statusCode,403)
  } finally {await app.close()}
})
