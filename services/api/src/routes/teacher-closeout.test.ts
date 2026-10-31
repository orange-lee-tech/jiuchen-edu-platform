import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import { registerTeacherRoutes } from './teacher.js'
import { registerReadOnlyWriteGuard } from '../services/read-only-context.js'

const studentId='11111111-1111-4111-8111-111111111111'
function fixture(role: 'teacher'|'student', userId: string, store: Map<string, { owner:string; title:string }>, assigned: boolean | (() => boolean)=false) {
  const queries:string[]=[]
  const db={ select(){ const q={from(){return q},innerJoin(){return q},leftJoin(){return q},where(){return q},
    async limit(){return [{userId,role,status:'active',internalIdStatus:'claimed',expiresAt:new Date('2099-01-01')}]} }; return q } }
  const pool={ async query(sql:string,values:unknown[]=[]){
    queries.push(sql)
    if(sql.startsWith('SELECT id FROM teachers')) return [[{id:userId}],null]
    if(sql.startsWith('SELECT s.id')) return [(typeof assigned === 'function' ? assigned() : assigned)?[{id:studentId,userId:'student-user'}]:[],null]
    if(sql.startsWith('SELECT id,title,description')) return [[...store.entries()].filter(([,v])=>v.owner===values[0]).map(([id,v])=>({id,title:v.title})),null]
    if(sql.startsWith('INSERT INTO teacher_todos')) { store.set(String(values[0]),{owner:String(values[1]),title:String(values[2])}); return [{affectedRows:1},null] }
    if(sql.includes('FROM students')) return [[{}],null]
    throw new Error('unexpected synthetic query')
  }, async execute(sql:string,values:unknown[]){
    const id=String(values[sql.startsWith('UPDATE')?4:0]), owner=String(values[sql.startsWith('UPDATE')?5:1]), row=store.get(id)
    if(!row || row.owner!==owner)return [{affectedRows:0},null]
    if(sql.startsWith('DELETE'))store.delete(id);else row.title=String(values[0])
    return [{affectedRows:1},null]
  } }
  const app=Fastify();registerReadOnlyWriteGuard(app);registerTeacherRoutes(app,{configured:true,db,pool} as unknown as DatabaseContext)
  return {app,queries}
}
const headers={authorization:'Bearer synthetic'}
test('teacher todos are persisted per teacher and cannot be changed by another teacher',async()=>{
  const store=new Map<string,{owner:string;title:string}>(), a=fixture('teacher','teacher-a',store), b=fixture('teacher','teacher-b',store)
  try {
    const body={title:'测试待办',description:null,dueDate:'2026-11-01',status:'pending'}
    const created=await a.app.inject({method:'POST',url:'/me/teacher/todos',headers,payload:body})
    assert.equal(created.statusCode,201);const id=created.json().id
    assert.equal((await a.app.inject({url:'/me/teacher/todos',headers})).json().todos.length,1)
    assert.equal((await b.app.inject({url:'/me/teacher/todos',headers})).json().todos.length,0)
    assert.equal((await b.app.inject({method:'PUT',url:'/me/teacher/todos/'+id,headers,payload:body})).statusCode,404)
    assert.equal((await b.app.inject({method:'DELETE',url:'/me/teacher/todos/'+id,headers})).statusCode,404)
    assert.equal((await a.app.inject({method:'PUT',url:'/me/teacher/todos/'+id,headers,payload:{...body,title:'已编辑',status:'done'}})).statusCode,200)
    assert.equal((await a.app.inject({method:'DELETE',url:'/me/teacher/todos/'+id,headers})).statusCode,200)
  } finally {await a.app.close();await b.app.close()}
})
test('student cannot access teacher tasks and unassigned students cannot be queried',async()=>{
  const store=new Map<string,{owner:string;title:string}>(), student=fixture('student','student',store), teacher=fixture('teacher','teacher',store)
  try {
    assert.equal((await student.app.inject({url:'/me/teacher/todos',headers})).statusCode,403)
    assert.equal((await teacher.app.inject({url:'/me/teacher/students/'+studentId+'/summary',headers})).statusCode,403)
    assert.equal((await teacher.app.inject({method:'POST',url:'/me/teacher/todos',headers,payload:{title:'',status:'pending'}})).statusCode,400)
    assert.equal((await teacher.app.inject({method:'POST',url:'/me/teacher/todos',headers:{...headers,'x-jiuchen-read-only-target':'teacher:11111111-1111-4111-8111-111111111111'},payload:{title:'x',status:'pending'}})).statusCode,403)
  } finally {await student.app.close();await teacher.app.close()}
})
test('assigned student summary contains aggregates but no report or payment identifiers',async()=>{
  const {app,queries}=fixture('teacher','teacher-a',new Map(),true)
  try {
    const response=await app.inject({url:'/me/teacher/students/'+studentId+'/summary',headers})
    assert.equal(response.statusCode,200)
    assert.equal(response.json().summary.assessments.total,0)
    const assessmentQuery=queries.find(sql=>sql.includes('LEFT JOIN assessments a'))
    assert.ok(assessmentQuery)
    assert.match(assessmentQuery,/COUNT\(CASE WHEN a\.status IN \('running','succeeded','failed'\) THEN a\.id END\)/)
    assert.doesNotMatch(response.body,/outputJson|transactionId|openId|apiKey/)
  } finally {await app.close()}
})
test('a revoked assignment blocks the summary even if it existed when the request started',async()=>{
  let checks=0
  const {app}=fixture('teacher','teacher-a',new Map(),()=>++checks===1)
  try { assert.equal((await app.inject({url:'/me/teacher/students/'+studentId+'/summary',headers})).statusCode,403) }
  finally {await app.close()}
})
