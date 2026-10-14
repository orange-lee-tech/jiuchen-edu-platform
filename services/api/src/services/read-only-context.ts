import type {FastifyInstance,FastifyRequest} from 'fastify'
import type {DatabaseContext} from '../db/client.js'
import type mysql from 'mysql2/promise'
import {randomBytes} from 'node:crypto'

export const READ_ONLY_HEADER='x-jiuchen-read-only-target'
type Capability={operatorSessionId:string;operatorUserId:string;target:{kind:'student'|'teacher';id:string};expiresAt:number}
const capabilities=new Map<string,Capability>()
export function issueReadOnlyCapability(operator:{sessionId:string;userId:string},target:Capability['target']){
 const now=Date.now()
 for(const [token,item] of capabilities)if(item.expiresAt<=now)capabilities.delete(token)
 if(capabilities.size>=512)throw Object.assign(new Error('read_only_capacity_reached'),{statusCode:503})
 const token='ro.'+randomBytes(32).toString('base64url'),expiresAt=now+10*60*1000
 capabilities.set(token,{operatorSessionId:operator.sessionId,operatorUserId:operator.userId,target,expiresAt})
 return {readToken:token,expiresAt:new Date(expiresAt).toISOString()}
}
export function getReadOnlyCapability(token:string){
 const item=capabilities.get(token)
 if(item&&item.expiresAt>Date.now())return item
 capabilities.delete(token);return null
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function forbidden(code:string):never{throw Object.assign(new Error(code),{statusCode:403,code})}
export function parseReadOnlyTarget(value:unknown){
 if(typeof value!=='string')forbidden('read_only_invalid_target')
 const [kind,id,...rest]=value.split(':')
 if(rest.length||!['student','teacher'].includes(kind)||!uuid.test(id))forbidden('read_only_invalid_target')
 return {kind:kind as 'student'|'teacher',id}
}

export function registerReadOnlyWriteGuard(app:FastifyInstance){
 app.addHook('onRequest',async(request,reply)=>{
  if((request.headers[READ_ONLY_HEADER]!==undefined||String(request.headers.authorization||'').startsWith('Bearer ro.'))&&!['GET','HEAD','OPTIONS'].includes(request.method))
   return reply.code(403).send({ok:false,error:'read_only_write_forbidden'})
 })
}

export async function readOnlySubject(database:Extract<DatabaseContext,{configured:true}>,operator:{userId:string;role:string},target:{kind:'student'|'teacher';id:string}){
 if(operator.role!=='admin'){
  if(operator.role!=='teacher'||target.kind!=='student')forbidden('read_only_target_forbidden')
  const [assigned]=await database.pool.query<mysql.RowDataPacket[]>(`SELECT a.student_id FROM student_teacher_assignments a
   JOIN teachers t ON t.id=a.teacher_id WHERE t.user_id=? AND t.status='active' AND a.student_id=? LIMIT 1`,[operator.userId,target.id])
  if(!assigned.length)forbidden('read_only_target_forbidden')
 }
 const table=target.kind==='student'?'students':'teachers'
 const [rows]=await database.pool.query<mysql.RowDataPacket[]>(`SELECT e.user_id AS userId,e.name,u.role,u.status,
   i.status AS identityStatus,i.business_id AS businessId FROM ${table} e
   LEFT JOIN users u ON u.id=e.user_id LEFT JOIN internal_ids i ON i.user_id=e.user_id AND i.entity_id=e.id AND i.type=?
   WHERE e.id=? ${target.kind==='teacher'?"AND e.status='active'":''} LIMIT 1`,[target.kind,target.id])
 const row=rows[0]
 if(!row||!row.userId||row.status!=='active'||row.identityStatus!=='claimed'||
   !(target.kind==='student'?row.role==='student':['teacher','staff'].includes(row.role)))forbidden('read_only_target_account_unavailable')
 return {kind:target.kind,id:target.id,userId:String(row.userId),role:row.role as 'student'|'teacher'|'staff',name:String(row.name||''),businessId:String(row.businessId||'')}
}

export async function applyReadOnlyContext<T extends {userId:string;role:string;displayName:string|null}>(request:FastifyRequest,database:Extract<DatabaseContext,{configured:true}>,operator:T,capabilityTarget?:Capability['target']){
 const raw=request.headers[READ_ONLY_HEADER]
 if(raw!==undefined&&!['GET','HEAD','OPTIONS'].includes(request.method))forbidden('read_only_write_forbidden')
 if(capabilityTarget&&!['GET','HEAD','OPTIONS'].includes(request.method))forbidden('read_only_write_forbidden')
 if(request.url.startsWith('/auth/')||request.url.startsWith('/me/read-only/')){
  if(capabilityTarget)forbidden('read_only_read_forbidden')
  return operator
 }
 if(raw===undefined&&!capabilityTarget)return operator
 if(!capabilityTarget)forbidden('read_only_capability_required')
 const headerTarget=raw===undefined?null:parseReadOnlyTarget(raw)
 if(headerTarget&&(headerTarget.kind!==capabilityTarget.kind||headerTarget.id!==capabilityTarget.id))forbidden('read_only_target_mismatch')
 const target=capabilityTarget
 // Explicit reads only. Never expose target session credentials or payment instruments.
 if(!['/me/profile','/me/classroom','/me/teacher','/me/assessments','/me/growth-profile','/me/resume','/me/application','/me/news-favorites','/news'].some(prefix=>request.url===prefix||request.url.startsWith(prefix+'/')||request.url.startsWith(prefix+'?')))
  forbidden('read_only_read_forbidden')
 const subject=await readOnlySubject(database,operator,target)
 return {...operator,userId:subject.userId,role:subject.role,displayName:subject.name,readOnly:true,operatorUserId:operator.userId}
}
