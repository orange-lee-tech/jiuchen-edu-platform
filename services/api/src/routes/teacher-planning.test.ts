import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import type { SQL } from 'drizzle-orm'
import type { DatabaseContext } from '../db/client.js'
import { planItems, studentPlans } from '../db/schema.js'
import { registerTeacherPlanningRoutes } from './teacher-planning.js'
import { registerReadOnlyWriteGuard } from '../services/read-only-context.js'

const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222'
const dialect=new MySqlDialect()
type Row=Record<string,unknown>
function fixture() {
  const templates=new Map<string,Row>(),plans:Row[]=[],items:Row[]=[]
  const state={role:'teacher',userId:'teacher-a',active:true,schemaMissing:false,assigned:new Set([first])}
  const values=(condition:SQL)=>dialect.sqlToQuery(condition).params
  const select=(table:unknown)=>{
    let rows:Row[]=[]
    const q={innerJoin(){return q},leftJoin(){return q},where(condition:SQL){
      if(table===studentPlans){const params=values(condition);rows=plans.filter(p=>p.studentId===params[0]&&p.stageCode===params[1]&&p.type===params[2])}
      else rows=[{userId:state.userId,role:state.role,status:'active',internalIdStatus:'claimed',expiresAt:new Date('2099-01-01')}]
      return q
    },async limit(n:number){return rows.slice(0,n)}};return q
  }
  const tx={
    async execute(query:SQL){const compiled=dialect.sqlToQuery(query);if(compiled.sql.includes('INNER JOIN teachers'))return [state.active&&state.assigned.has(String(compiled.params[0]))?[{id:'assignment'}]:[]];return [[]]},
    select(){return {from:select}},
    update(table:unknown){
      return {set:(patch:Row)=>({where:async(condition:SQL)=>{
        if(table===studentPlans){
          const row=plans.find(p=>p.id===values(condition)[0])
          if(row)Object.assign(row,patch)
        }
      }})}
    },
    delete(table:unknown){
      return {where:async(condition:SQL)=>{
        if(table===planItems){
          const planId=values(condition)[0]
          for(let i=items.length-1;i>=0;i--)if(items[i]?.planId===planId)items.splice(i,1)
        }
      }}
    },
    insert(table:unknown){
      return {values:async(value:Row|Row[])=>{
        if(table===studentPlans)plans.push({...value as Row})
        if(table===planItems)items.push(...(value as Row[]).map(item=>({...item})))
      }}
    },
  }
  const pool={async query(sql:string,params:unknown[]=[]){
    if(sql.startsWith('SELECT id FROM teachers'))return [state.active?[{id:state.userId}]:[]]
    if(sql.includes('FROM teacher_plan_templates')){
      if(state.schemaMissing)throw Object.assign(new Error('synthetic missing schema'),{code:'ER_NO_SUCH_TABLE'})
      return [sql.includes('WHERE id=?')?[templates.get(String(params[0]))].filter(row=>row?.teacherId===params[1]):[...templates.values()].filter(row=>row.teacherId===params[0])]
    }
    throw new Error('unexpected query')
  },async execute(sql:string,params:unknown[]){
    if(sql.startsWith('INSERT')){templates.set(String(params[0]),{id:params[0],teacherId:params[1],name:params[2],stageCode:params[3],type:params[4],title:params[5],itemsJson:params[6]});return [{affectedRows:1}]}
    if(sql.startsWith('UPDATE')){const row=templates.get(String(params[5]));if(!row||row.teacherId!==params[6])return [{affectedRows:0}];Object.assign(row,{name:params[0],stageCode:params[1],type:params[2],title:params[3],itemsJson:params[4]});return [{affectedRows:1}]}
    if(sql.startsWith('DELETE')){const row=templates.get(String(params[0]));if(row?.teacherId!==params[1])return [{affectedRows:0}];templates.delete(String(params[0]));return [{affectedRows:1}]}
    throw new Error('unexpected write')
  }}
  const db={select(){return {from:select}},async transaction<T>(run:(value:typeof tx)=>Promise<T>){return run(tx)}}
  const app=Fastify();registerReadOnlyWriteGuard(app);registerTeacherPlanningRoutes(app,{configured:true,db,pool} as unknown as DatabaseContext)
  return {app,state,templates,plans,items}
}
const headers={authorization:'Bearer synthetic'}
const plan={stageCode:'senior-fall',type:'custom',title:'个人申请安排',items:[{name:'整理申请材料',target:'完成清单',dueDate:'2026-11-01',status:'pending'}]}

test('templates support create, owner-only edit, copy and delete without sharing private templates',async()=>{
  const {app,state}=fixture()
  try{
    const created=await app.inject({method:'POST',url:'/me/teacher/plan-templates',headers,payload:{name:'申请模板',plan}})
    assert.equal(created.statusCode,201);const id=created.json().id
    assert.equal((await app.inject({url:'/me/teacher/plan-templates',headers})).json().templates[0].plan.type,'custom')
    state.userId='teacher-b'
    assert.equal((await app.inject({url:'/me/teacher/plan-templates',headers})).json().templates.length,0)
    assert.equal((await app.inject({method:'PUT',url:'/me/teacher/plan-templates/'+id,headers,payload:{name:'越权',plan}})).statusCode,404)
    assert.equal((await app.inject({method:'POST',url:'/me/teacher/plan-templates/'+id+'/copy',headers,payload:{}})).statusCode,404)
    assert.equal((await app.inject({method:'DELETE',url:'/me/teacher/plan-templates/'+id,headers})).statusCode,404)
    state.userId='teacher-a'
    assert.equal((await app.inject({method:'PUT',url:'/me/teacher/plan-templates/'+id,headers,payload:{name:'重命名',plan}})).statusCode,200)
    const copy=await app.inject({method:'POST',url:'/me/teacher/plan-templates/'+id+'/copy',headers,payload:{name:'独立副本'}})
    assert.equal(copy.statusCode,201);assert.notEqual(copy.json().id,id)
    assert.equal((await app.inject({method:'DELETE',url:'/me/teacher/plan-templates/'+id,headers})).statusCode,200)
    assert.equal((await app.inject({url:'/me/teacher/plan-templates',headers})).json().templates.length,1)
  }finally{await app.close()}
})

test('batch apply authorizes every learner and generated tasks remain independent of later template edits',async()=>{
  const {app,state,plans,items}=fixture()
  try{
    const created=await app.inject({method:'POST',url:'/me/teacher/plan-templates',headers,payload:{name:'申请模板',plan}}),id=created.json().id
    const applied=await app.inject({method:'POST',url:'/me/teacher/plan-templates/'+id+'/apply',headers,payload:{studentIds:[first,second,first]}})
    assert.equal(applied.statusCode,200)
    assert.deepEqual(applied.json().results.map((r:Row)=>[r.studentId,r.ok]),[[first,true],[second,false]])
    assert.equal(applied.json().results[1].error,'student_not_assigned');assert.equal(plans.length,1);assert.equal(items.length,1)
    const itemId=items[0]?.id
    await app.inject({method:'PUT',url:'/me/teacher/plan-templates/'+id,headers,payload:{name:'新模板',plan:{...plan,items:[{name:'新任务',status:'pending'}]}}})
    assert.equal(items[0]?.name,'整理申请材料');assert.equal(items[0]?.id,itemId)
    state.assigned.add(second)
    const again=await app.inject({method:'POST',url:'/me/teacher/plans/apply',headers,payload:{studentIds:[first,second],plan}})
    assert.ok(again.json().results.every((r:Row)=>r.ok));assert.equal(plans.length,2)
    assert.notEqual(plans[0]?.id,plans[1]?.id);assert.notEqual(items[0]?.id,items[1]?.id)
    state.assigned.clear()
    const revoked=await app.inject({method:'POST',url:'/me/teacher/plans/apply',headers,payload:{studentIds:[first],plan}})
    assert.equal(revoked.json().results[0].ok,false);assert.equal(plans.length,2)
  }finally{await app.close()}
})

test('student, inactive teacher, readonly context and invalid stage cannot use template writes',async()=>{
  const {app,state}=fixture()
  try{
    state.role='student';assert.equal((await app.inject({method:'POST',url:'/me/teacher/plan-templates',headers,payload:{name:'模板',plan}})).statusCode,403)
    state.role='teacher';state.active=false;assert.equal((await app.inject({url:'/me/teacher/plan-templates',headers})).statusCode,403)
    state.active=true
    assert.equal((await app.inject({method:'POST',url:'/me/teacher/plans/apply',headers,payload:{studentIds:[first],plan:{...plan,stageCode:'invalid'}}})).statusCode,400)
    assert.equal((await app.inject({method:'POST',url:'/me/teacher/plan-templates',headers:{...headers,'x-jiuchen-read-only-target':'teacher:'+first},payload:{name:'模板',plan}})).statusCode,403)
  }finally{await app.close()}
})

test('missing template migration is a schema error rather than an empty template list',async()=>{
  const {app,state}=fixture()
  try{
    state.schemaMissing=true
    const response=await app.inject({url:'/me/teacher/plan-templates',headers})
    assert.equal(response.statusCode,503)
    assert.equal(response.json().error,'teacher_schema_not_ready')
    assert.equal(response.json().templates,undefined)
  }finally{await app.close()}
})
