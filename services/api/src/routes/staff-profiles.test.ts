import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import { registerStaffProfileRoutes } from './staff-profiles.js'
import { registerReadOnlyWriteGuard } from '../services/read-only-context.js'

const headers={authorization:'Bearer synthetic-only'}
function fixture(role:string,owner:string,records:Map<string,Record<string,unknown>>,hasTeacher=role==='teacher'){
  const names=new Map<string,string>()
  const db={select(){const q={from(){return q},innerJoin(){return q},leftJoin(){return q},where(){return q},
    async limit(){return [{userId:owner,role,status:'active',internalIdStatus:'claimed',expiresAt:new Date('2099-01-01')}]} };return q}}
  const connection={async beginTransaction(){},async commit(){},async rollback(){},release(){},
    async query(sql:string,args:unknown[]=[]){
      if(sql.startsWith('SELECT id FROM teachers'))return [[{id:'teacher'}],[]]
      if(sql.startsWith('SELECT real_name'))return [[records.get(String(args[0]))].filter(Boolean),[]]
      if(sql.startsWith('INSERT INTO staff_profiles')){records.set(String(args[0]),{realName:args[1],phone:args[2],department:args[3],supervisor:args[4]});return [{affectedRows:1},[]]}
      if(sql.startsWith('UPDATE teachers')){if(hasTeacher)names.set(String(args[1]),String(args[0]));return [{affectedRows:hasTeacher?1:0},[]]}
      if(sql.includes('FROM teachers t LEFT JOIN staff_profiles'))return [[...records].map(([userId,p])=>({teacherId:userId,userId,businessName:names.get(userId)||'既有业务名称',...p})),[]]
      throw new Error('Unexpected staff query')
    }}
  const pool={query:connection.query,async getConnection(){return connection}}
  const app=Fastify();registerReadOnlyWriteGuard(app);registerStaffProfileRoutes(app,{configured:true,db,pool} as unknown as DatabaseContext)
  return {app,names}
}
test('teacher and admin save and reload explicit staff identity without changing account nickname',async()=>{
  const records=new Map<string,Record<string,unknown>>()
  for(const role of ['teacher','admin']){
    const {app,names}=fixture(role,role,records)
    try{
      const profile={realName:'合成员工',phone:'+86 13800000000',department:'教学',supervisor:'合成主管'}
      assert.equal((await app.inject({method:'PUT',url:'/me/staff-profile',headers,payload:profile})).statusCode,200)
      const result=(await app.inject({url:'/me/staff-profile',headers})).json()
      assert.deepEqual(result.profile,{...profile,completedFields:4,complete:true})
      assert.equal(names.get(role),role==='teacher'?'合成员工':undefined)
      assert.equal((await app.inject({method:'PUT',url:'/me/staff-profile',headers,payload:{...profile,phone:'invalid'}})).statusCode,400)
    }finally{await app.close()}
  }
})
test('staff phone is inaccessible to students and other teachers; admin directory is explicit',async()=>{
  const records=new Map<string,Record<string,unknown>>([['teacher-a',{realName:'合成甲',phone:'13800000000'}]])
  for(const role of ['student','teacher','admin']){
    const {app}=fixture(role,role+'-b',records)
    try{
      const directory=await app.inject({url:'/me/admin/staff-profiles',headers})
      assert.equal(directory.statusCode,role==='admin'?200:403)
      if(role==='teacher')assert.equal((await app.inject({url:'/me/staff-profile',headers})).json().profile.phone,null)
      if(role==='student')assert.equal((await app.inject({url:'/me/staff-profile',headers})).statusCode,403)
      assert.equal((await app.inject({method:'PUT',url:'/me/staff-profile',headers:{...headers,'x-jiuchen-read-only-target':'teacher:11111111-1111-4111-8111-111111111111'},payload:{}})).statusCode,403)
    }finally{await app.close()}
  }
})
test('admin active role synchronizes its own dual teacher identity formal name',async()=>{
  const {app,names}=fixture('admin','dual-identity',new Map(),true)
  try{
    const response=await app.inject({method:'PUT',url:'/me/staff-profile',headers,payload:{realName:'合成兼任教师',phone:null,department:null,supervisor:null}})
    assert.equal(response.statusCode,200);assert.equal(names.get('dual-identity'),'合成兼任教师')
  }finally{await app.close()}
})
