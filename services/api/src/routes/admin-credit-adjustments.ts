import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type mysql from 'mysql2/promise'
import { z } from 'zod'
import type { DatabaseContext } from '../db/client.js'
import { resolveSessionUser } from '../services/session.js'
import { ControlError, sixDigitPin } from '../services/admin-control-boxes.js'
import { grantAdminCredits } from '../services/admin-credit-adjustment.js'
import { readCreditAccount, CommercialStateError } from '../services/credit-ledger.js'

export const creditAdjustmentInput = z.object({userId:z.string().uuid(),amount:z.number().int().min(1).max(10000),
  reason:z.string().trim().min(1).max(300),pin:sixDigitPin,idempotencyKey:z.string().uuid()}).strict()

export function registerAdminCreditAdjustmentRoutes(app:FastifyInstance,database:DatabaseContext) {
  function errorHandler(error:Error,_request:FastifyRequest,reply:FastifyReply){
    if(error instanceof ControlError)return reply.code(error.status).send({ok:false,error:error.code})
    if(error instanceof CommercialStateError||['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(String((error as {code?:string}).code)))
      return reply.code(503).send({ok:false,error:'credit_adjustment_schema_not_ready'})
    return reply.code(500).send({ok:false,error:'credit_adjustment_failed'})
  }
  async function admin(request:FastifyRequest,reply:FastifyReply){
    if(!database.configured){reply.code(503).send({ok:false,error:'database_not_configured'});return null}
    const user=await resolveSessionUser(request,database)
    if(!user){reply.code(401).send({ok:false,error:'unauthorized'});return null}
    if(user.role!=='admin'||('readOnly' in user&&user.readOnly)){
      reply.code(403).send({ok:false,error:'admin_forbidden'});return null}
    return user
  }
  app.get('/me/admin/credit-adjustments',{errorHandler},async(request,reply)=>{
    if(!await admin(request,reply)||!database.configured)return
    const [rows]=await database.pool.query<mysql.RowDataPacket[]>(`SELECT s.id,s.user_id AS userId,s.name,s.university,
      s.current_stage AS currentStage FROM students s INNER JOIN users u ON u.id=s.user_id
      WHERE u.status='active' ORDER BY s.name,s.id`)
    return {ok:true,students:rows}
  })
  app.get<{Params:{userId:string}}>('/me/admin/credit-adjustments/:userId',{errorHandler},async(request,reply)=>{
    if(!await admin(request,reply)||!database.configured)return
    if(!z.string().uuid().safeParse(request.params.userId).success)return reply.code(400).send({ok:false,error:'invalid_student_id'})
    const [rows]=await database.pool.query<mysql.RowDataPacket[]>('SELECT id FROM students WHERE user_id=?',[request.params.userId])
    if(!rows.length)return reply.code(404).send({ok:false,error:'student_account_not_found'})
    const account=await readCreditAccount(database,request.params.userId)
    return {ok:true,balance:account.availableBalance,settledBalance:account.settledBalance,heldBalance:account.heldBalance}
  })
  app.post<{Body:unknown}>('/me/admin/credit-adjustments',{errorHandler},async(request,reply)=>{
    const user=await admin(request,reply)
    if(!user||!database.configured)return
    const parsed=creditAdjustmentInput.safeParse(request.body)
    if(!parsed.success)return reply.code(400).send({ok:false,error:'invalid_credit_adjustment'})
    try{return {ok:true,...await grantAdminCredits({pool:database.pool,actorId:user.userId,...parsed.data})}}
    catch(error){
      if(error instanceof ControlError)return reply.code(error.status).send({ok:false,error:error.code})
      if((error as {code?:string}).code==='ER_NO_SUCH_TABLE')return reply.code(503).send({ok:false,error:'credit_adjustment_schema_not_ready'})
      throw error
    }
  })
}
