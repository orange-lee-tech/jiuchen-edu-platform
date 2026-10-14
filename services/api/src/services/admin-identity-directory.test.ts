import test from 'node:test'
import assert from 'node:assert/strict'
import {identityDirectoryState,officialRosterProjection} from './admin-identity-directory.js'
import Fastify from 'fastify'
import type {DatabaseContext} from '../db/client.js'
import {registerMobileAdminRoutes} from '../routes/mobile-admin.js'
import {loadEnv} from '../config/env.js'
const base={type:'student',status:'claimed',userId:'synthetic',name:'合成姓名',university:'合成学校',assignmentCount:0,userStatus:'active'}
test('identity read model distinguishes claim, allocation and incomplete records without changing grants',()=>{
 assert.equal(identityDirectoryState({...base,status:'available',userId:null}).assignmentState,'unclaimed')
 assert.equal(identityDirectoryState({...base,status:'available',userId:null}).nameLabel,'未认领')
 assert.equal(identityDirectoryState(base).assignmentState,'unassigned')
 assert.equal(identityDirectoryState({...base,assignmentCount:1}).assignmentState,'assigned')
 const incomplete=identityDirectoryState({...base,name:'测试学员',university:null})
 assert.equal(incomplete.profileState,'incomplete');assert.equal(incomplete.nameLabel,'待完善实名');assert.equal(incomplete.auditCategory,'test_named_bound')
 const disabled=identityDirectoryState({...base,status:'disabled',assignmentCount:2})
 assert.equal(disabled.status,'disabled');assert.equal(disabled.assignmentState,'assigned')
 const teacher=identityDirectoryState({...base,type:'teacher',university:null});assert.equal(teacher.assignmentState,'unassigned');assert.equal(teacher.profileState,'recorded')
 const admin=identityDirectoryState({...base,type:'admin',name:null,assignmentCount:null});assert.equal(admin.assignmentState,'not_recorded');assert.equal(admin.nameLabel,'待完善实名');assert.equal(admin.assignmentLabel,'未分配');assert.equal(admin.assignmentCount,null)
})

test('formal read-only roster isolates only proven unclaimed seeds, not nicknames or bound users',()=>{
 const source=[
  {id:'seed',type:'student',batch:'dev-seed-v1',userId:null,name:'测试学员01'},
  {id:'00000000-0000-4000-8000-000000000001',type:'student',userId:null,name:'演示学员'},
  {id:'real',type:'student',batch:'dev-seed-v1',userId:'account',name:'合成实名',university:'合成学校',major:'合成专业',identityStatus:'claimed',accountRole:'student',userStatus:'active',assignmentCount:0},
  {id:'unknown',type:'student',userId:null,name:'测试昵称不能证明种子'},
  {id:'incomplete',type:'student',userId:'account2',name:'测试学员02',identityStatus:'claimed',accountRole:'student',userStatus:'active'},
  {id:'teacher',type:'teacher',userId:'account3',name:'合成老师',identityStatus:'claimed',accountRole:'teacher',userStatus:'active',status:'active',assignmentCount:1},
 ]
 const snapshot=JSON.stringify(source),roster=officialRosterProjection(source)
 assert.equal(roster.isolatedUnclaimedSeedCount,2)
 assert.equal(roster.students.length,3);assert.equal(roster.teachers.length,1)
 assert.equal(roster.students.find(x=>x.id==='real')?.name,'合成实名')
 assert.equal(roster.students.find(x=>x.id==='real')?.stateLabel,'已认领未分配老师')
 assert.equal(roster.students.find(x=>x.id==='unknown')?.canView,false)
 assert.equal(roster.students.find(x=>x.id==='incomplete')?.name,'资料待完善')
 assert.equal(roster.teachers[0]?.canView,true)
 assert.equal(JSON.stringify(source),snapshot)
})

test('canonical roster requires an administrator and never reads payment or enrollment schema',async()=>{
 for(const role of [null,'user','student','teacher','staff','admin']){
  const app=Fastify(),sql:string[]=[]
  const query={from(){return this},innerJoin(){return this},leftJoin(){return this},where(){return this},async limit(){return role?[{userId:'synthetic',role,expiresAt:new Date('2099-01-01')}]:[]}}
  const database={configured:true,db:{select(){return query}},pool:{async query(statement:string){sql.push(statement);return [[]]}}} as unknown as DatabaseContext
  registerMobileAdminRoutes(app,database,loadEnv({}))
  const response=await app.inject({method:'GET',url:'/me/admin/read-only-directory',headers:{authorization:'Bearer synthetic'}})
  assert.equal(response.statusCode,role==='admin'?200:role?403:401)
  assert.equal(sql.length,role==='admin'?2:0)
  assert.doesNotMatch(sql.join('\n'),/enrollment_year|payment_orders|credit_ledger|credit_reservations/)
  await app.close()
 }
})
