import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import type {DatabaseContext} from '../db/client.js'
import {registerReadOnlyWriteGuard,readOnlySubject,applyReadOnlyContext,READ_ONLY_HEADER,issueReadOnlyCapability,getReadOnlyCapability} from './read-only-context.js'

const id='00000000-0000-4000-8000-000000000001'
function database(assigned=true,active=true){
 const calls:Array<{sql:string;params:unknown[]}>=[]
 const db={configured:true,pool:{async query(sql:string,params:unknown[]){
  calls.push({sql,params})
  if(sql.includes('student_teacher_assignments'))return [assigned?[{student_id:id}]:[]]
  return [[{userId:'target-account',name:'合成目标姓名',role:'student',status:active?'active':'deleted',identityStatus:'claimed',businessId:'JCS-SYNTHETIC'}]]
 }}} as unknown as Extract<DatabaseContext,{configured:true}>
 return {db,calls}
}
test('read-only headers block every mutation before any handler, including AI/OCR/payment/approval',async()=>{
 const app=Fastify();registerReadOnlyWriteGuard(app)
 let writes=0
 for(const method of ['POST','PUT','PATCH','DELETE'] as const)app.route({method,url:'/operation',handler:()=>{writes++;return {ok:true}}})
 for(const method of ['POST','PUT','PATCH','DELETE'] as const){
  const reply=await app.inject({method,url:'/operation',headers:{[READ_ONLY_HEADER]:'student:'+id}})
  assert.equal(reply.statusCode,403);assert.equal(reply.json().error,'read_only_write_forbidden')
  const stripped=await app.inject({method,url:'/operation',headers:{authorization:'Bearer ro.synthetic-without-target-header'}})
  assert.equal(stripped.statusCode,403)
 }
 assert.equal(writes,0)
 assert.equal((await app.inject({method:'POST',url:'/operation'})).statusCode,200)
 assert.equal(writes,1);await app.close()
})
test('teacher context is assignment-scoped and revocation immediately invalidates the next read',async()=>{
 const valid=database();const operator={userId:'operator-teacher',role:'teacher'}
 const subject=await readOnlySubject(valid.db,operator,{kind:'student',id})
 assert.equal(subject.userId,'target-account');assert.deepEqual(valid.calls[0].params,['operator-teacher',id])
 await assert.rejects(readOnlySubject(database(false).db,operator,{kind:'student',id}),/target_forbidden/)
 await assert.rejects(readOnlySubject(valid.db,operator,{kind:'teacher',id}),/target_forbidden/)
 for(const role of ['student','user','staff'])await assert.rejects(readOnlySubject(valid.db,{userId:'untrusted',role},{kind:'student',id}),/target_forbidden/)
 await assert.rejects(readOnlySubject(database(true,false).db,{userId:'admin',role:'admin'},{kind:'student',id}),/account_unavailable/)
})
test('GET projection keeps the operator unchanged and refuses credentials, payment and writes',async()=>{
 const {db}=database();const operator={userId:'admin',role:'admin',displayName:'原管理员',sessionId:'original-session'}
 const request=(url:string,method='GET')=>({url,method,headers:{[READ_ONLY_HEADER]:'student:'+id}}) as unknown as Parameters<typeof applyReadOnlyContext>[0]
 const target={kind:'student' as const,id}
 const view=await applyReadOnlyContext(request('/me/profile'),db,operator,target)
 assert.equal(view.userId,'target-account');assert.equal(operator.userId,'admin');assert.equal(view.sessionId,'original-session')
 assert.equal((await applyReadOnlyContext(request('/auth/me'),db,operator)).userId,'admin')
 await assert.rejects(applyReadOnlyContext(request('/auth/me'),db,operator,target),/read_forbidden/)
 await assert.rejects(applyReadOnlyContext(request('/me/admin/users'),db,operator,target),/read_forbidden/)
 await assert.rejects(applyReadOnlyContext(request('/me/payments'),db,operator,target),/read_forbidden/)
 await assert.rejects(applyReadOnlyContext(request('/me/profile','PUT'),db,operator,target),/write_forbidden/)
 await assert.rejects(applyReadOnlyContext(request('/me/profile'),db,operator),/capability_required/)
})

test('opaque read-only capability binds the operator session and a fixed target without containing session credentials',()=>{
 const target={kind:'student' as const,id}
 const issued=issueReadOnlyCapability({sessionId:'trusted-session-id',userId:'operator'},target)
 const capability=getReadOnlyCapability(issued.readToken)!
 assert.equal(capability.operatorSessionId,'trusted-session-id');assert.equal(capability.target.id,id)
 assert.equal(issued.readToken.includes('trusted-session-id'),false)
 assert.equal(getReadOnlyCapability('ro.guessed'),null)
})
