import { randomUUID } from 'node:crypto'
import type mysql from 'mysql2/promise'
import type { VirtualPayConfig } from './wechat-virtual-payment.js'
import type { VirtualRefundPush, VirtualComplaintPush } from './wechat-virtual-push.js'

export type VirtualCaseKind='late_payment'|'refund'|'complaint'|'delivery'|'reconciliation'
export type VirtualCaseState='open'|'processing'|'succeeded'|'failed'|'resolved'
type Queryable=Pick<mysql.Pool,'query'>|Pick<mysql.PoolConnection,'query'>

// eventKey is a deterministic, non-secret idempotency key. The case row is a
// review record only; it must never grant or claw back assessment credits.
export async function recordVirtualPaymentCase(connection:Queryable,input:{
  eventKey:string;orderId:string|null;kind:VirtualCaseKind;state:VirtualCaseState;
  reasonCode:string;refundAmountFen?:number|null;providerReference?:string|null;
}) {
  if(input.eventKey.length>128 || !/^[a-z0-9:_-]+$/i.test(input.eventKey) ||
      !/^[a-z0-9_]{1,80}$/.test(input.reasonCode)) throw new Error('virtual_case_fields_invalid')
  await connection.query(
    `INSERT INTO virtual_payment_cases
      (id,order_id,event_key,kind,state,reason_code,refund_amount_fen,provider_reference,last_checked_at)
     VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       last_checked_at=CURRENT_TIMESTAMP,
       reason_code=IF(state IN ('resolved','succeeded') OR
         (state='processing' AND VALUES(state)='open'),reason_code,VALUES(reason_code)),
       state=IF(state IN ('resolved','succeeded') OR
         (state='processing' AND VALUES(state)='open'),state,VALUES(state)),
       refund_amount_fen=COALESCE(VALUES(refund_amount_fen),refund_amount_fen),
       provider_reference=COALESCE(VALUES(provider_reference),provider_reference)`,
    [randomUUID(),input.orderId,input.eventKey,input.kind,input.state,input.reasonCode,
      input.refundAmountFen??null,input.providerReference??null])
}

export const VIRTUAL_RECONCILE_ATTEMPT_LIMIT=64
export async function startVirtualReconcileAttempt(pool:mysql.Pool,orderId:string):Promise<boolean> {
  const eventKey='recovery:'+orderId
  await pool.query(
    `INSERT INTO virtual_payment_cases
      (id,order_id,event_key,kind,state,reason_code,attempt_count)
     VALUES (?,?,?,'reconciliation','processing','automatic_query',0)
     ON DUPLICATE KEY UPDATE event_key=event_key`,
    [randomUUID(),orderId,eventKey])
  const [updated]=await pool.query<mysql.ResultSetHeader>(
    `UPDATE virtual_payment_cases SET attempt_count=attempt_count+1,
      last_checked_at=CURRENT_TIMESTAMP
     WHERE event_key=? AND state IN ('processing','succeeded') AND attempt_count<?`,
    [eventKey,VIRTUAL_RECONCILE_ATTEMPT_LIMIT])
  return updated.affectedRows===1
}
export async function finishVirtualReconcileAttempt(pool:mysql.Pool,orderId:string,
  outcome:'completed'|'pending'|'delivery_pending'|'temporary_failure'|'permanent_failure'|'review_required') {
  const reasonCode={completed:'automatic_check_complete',pending:'waiting_for_payment',
    delivery_pending:'delivery_confirmation_pending',temporary_failure:'official_query_unavailable',
    permanent_failure:'official_query_rejected',
    review_required:'automatic_review_required'}[outcome]
  await pool.query(
    `UPDATE virtual_payment_cases SET
      state=CASE WHEN state='resolved' THEN 'resolved'
        WHEN ?='review_required' THEN 'open'
        WHEN ?='permanent_failure' THEN 'failed'
        WHEN attempt_count>=? AND ?<>'completed' THEN 'open'
        WHEN ?='completed' THEN 'succeeded' ELSE 'processing' END,
      reason_code=CASE WHEN attempt_count>=? AND ?<>'completed'
        THEN 'automatic_attempt_limit' ELSE ? END,
      last_checked_at=CURRENT_TIMESTAMP WHERE event_key=?`,
    [outcome,outcome,VIRTUAL_RECONCILE_ATTEMPT_LIMIT,outcome,outcome,
      VIRTUAL_RECONCILE_ATTEMPT_LIMIT,outcome,reasonCode,'recovery:'+orderId])
}

export async function recordVirtualAncillaryPush(pool:mysql.Pool,config:VirtualPayConfig,
  push:VirtualRefundPush|VirtualComplaintPush) {
  const [rows]=push.outTradeNo
    ? await pool.query<mysql.RowDataPacket[]>(
      `SELECT p.id,p.amount_fen AS amountFen,p.status,p.pay_environment AS payEnvironment,
        p.provider_transaction_id AS providerTransactionId,
        u.wechat_open_id AS openId
       FROM payment_orders p JOIN users u ON u.id=p.user_id
       WHERE p.out_trade_no=? LIMIT 1`,[push.outTradeNo])
    : [[] as mysql.RowDataPacket[]]
  const order=rows[0]
  const matched=Boolean(order && order.openId===push.openId &&
    order.payEnvironment===(config.env===0?'production':'sandbox'))
  if(push.event==='refund') {
    const amountMatched=matched && push.refundFeeFen>0 && push.refundFeeFen<=Number(order.amountFen)
    const transactionMatched=amountMatched && Boolean(push.wxOrderId) &&
      order.providerTransactionId===push.wxOrderId
    const fullRefund=transactionMatched && push.refundFeeFen===Number(order.amountFen)
    const reason=!transactionMatched?'refund_evidence_mismatch':
      push.retCode!==0?'refund_notification_failed':
        fullRefund?'full_refund_credit_review':'partial_refund_credit_review'
    const connection=await pool.getConnection()
    try {
      await connection.beginTransaction()
      try {
        await recordVirtualPaymentCase(connection,{eventKey:'refund:'+push.refundId,
          orderId:matched?String(order.id):null,kind:'refund',
          state:transactionMatched && push.retCode===0?'succeeded':
            transactionMatched?'failed':'open',reasonCode:reason,
          refundAmountFen:push.refundFeeFen,providerReference:push.refundId})
        if(fullRefund && push.retCode===0)
          await connection.query(
            "UPDATE payment_orders SET status='refunded' WHERE id=? AND status='paid'",[order.id])
        if(matched && push.retCode===0)
          await connection.query(
            `UPDATE virtual_payment_cases SET state='succeeded',
              reason_code='platform_refund_confirmed',last_checked_at=CURRENT_TIMESTAMP
             WHERE event_key=? AND state<>'resolved'`,['after_sales:'+order.id])
        else if(matched && push.retCode!==0)
          await connection.query(
            `UPDATE virtual_payment_cases SET state='failed',
              reason_code='platform_refund_failed',last_checked_at=CURRENT_TIMESTAMP
             WHERE event_key=? AND state<>'resolved'`,['after_sales:'+order.id])
        await connection.commit()
      } catch(error) {await connection.rollback();throw error}
    } finally {connection.release()}
    return
  }
  await recordVirtualPaymentCase(pool,{eventKey:'complaint:'+push.requestId,
    orderId:matched?String(order.id):null,kind:'complaint',state:'open',
    reasonCode:matched?'complaint_needs_review':'complaint_order_unmatched',
    providerReference:push.requestId})
}

export async function reviewVirtualPaymentCase(connection:mysql.PoolConnection,input:{
  caseId:string;actorUserId:string;note:string;action:'processing'|'resolved';
}) {
  await connection.beginTransaction()
  try {
    const [rows]=await connection.query<mysql.RowDataPacket[]>(
      'SELECT id,state FROM virtual_payment_cases WHERE id=? FOR UPDATE',[input.caseId])
    if(!rows.length) throw new Error('virtual_case_not_found')
    if(rows[0]!.state!=='resolved') {
      await connection.query(
        `UPDATE virtual_payment_cases SET state=?,
          resolved_at=IF(?='resolved',CURRENT_TIMESTAMP,NULL),
          resolved_by=IF(?='resolved',?,NULL),review_note=? WHERE id=?`,
        [input.action,input.action,input.action,input.actorUserId,input.note,input.caseId])
      await connection.query(
        `INSERT INTO virtual_payment_case_actions
          (id,case_id,actor_user_id,action,note) VALUES (?,?,?,?,?)`,
        [randomUUID(),input.caseId,input.actorUserId,input.action,input.note])
    }
    await connection.commit()
  } catch(error) { await connection.rollback(); throw error }
}
