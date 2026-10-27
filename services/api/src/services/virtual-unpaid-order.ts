import type mysql from 'mysql2/promise'
import type { AppEnv } from '../config/env.js'
import type { DatabaseContext } from '../db/client.js'
import { isVirtualOrderMissingOnWechat, type VirtualPayConfig } from './wechat-virtual-payment.js'

type ConfiguredDatabase = Extract<DatabaseContext, { configured: true }>
type OrderRow = mysql.RowDataPacket & {
  id:string; outTradeNo:string; status:string; amountFen:number; creditAmount:number;
  skuKey:string|null; openId:string|null; payEnvironment:string|null;
  providerTransactionId:string|null; paidAt:Date|null;
  deliveryConfirmedAt:Date|null; checkoutExpired:number;
}
export class UnpaidOrderError extends Error {
  constructor(readonly code:string) { super(code) }
}
const orderSql=`SELECT p.id,p.out_trade_no AS outTradeNo,p.status,
  p.amount_fen AS amountFen,p.credit_amount AS creditAmount,p.sku_key AS skuKey,
  p.pay_environment AS payEnvironment,p.provider_transaction_id AS providerTransactionId,
  p.paid_at AS paidAt,p.virtual_delivery_confirmed_at AS deliveryConfirmedAt,
  (p.expires_at IS NOT NULL AND p.expires_at <= CURRENT_TIMESTAMP()) AS checkoutExpired,
  u.wechat_open_id AS openId
  FROM payment_orders p JOIN users u ON u.id=p.user_id
  WHERE p.id=? AND p.user_id=? AND p.out_trade_no LIKE 'JCV%' LIMIT 1`

function assertUnpaid(row:OrderRow, config:VirtualPayConfig) {
  if (row.status !== 'pending') throw new UnpaidOrderError('virtual_order_not_pending')
  if (!row.openId || !row.outTradeNo || !row.skuKey ||
      !['JC000','JC001','JC002','JC003'].includes(row.skuKey) ||
      !Number.isInteger(Number(row.amountFen)) || Number(row.amountFen)<1 ||
      row.payEnvironment !== (config.env===0?'production':'sandbox') ||
      row.providerTransactionId!==null || row.paidAt!==null || row.deliveryConfirmedAt!==null)
    throw new UnpaidOrderError('virtual_order_payment_review_required')
  // The checkout window is stored by the server at order creation (30 min).
  if(Number(row.checkoutExpired)!==1) throw new UnpaidOrderError('virtual_order_checkout_window_open')
}
async function assertNoSettlementEvidence(connection:Pick<mysql.PoolConnection,'query'>,row:OrderRow) {
  const [ledger]=await connection.query<mysql.RowDataPacket[]>(
    'SELECT id FROM credit_ledger_entries WHERE payment_order_id=? LIMIT 1',[row.id])
  const [pushes]=await connection.query<mysql.RowDataPacket[]>(
    'SELECT id FROM payment_notifications WHERE out_trade_no=? LIMIT 1',[row.outTradeNo])
  if(ledger.length || pushes.length)
    throw new UnpaidOrderError('virtual_order_payment_review_required')
}

export async function endRejectedVirtualOrder(input:{
  database:ConfiguredDatabase; env:AppEnv; config:VirtualPayConfig;
  orderId:string; userId:string; prePaymentErrorCode:number; confirmUnpaid:boolean;
}):Promise<{state:'closed';credited:false}> {
  if(input.prePaymentErrorCode!==-15013 || input.confirmUnpaid!==true)
    throw new UnpaidOrderError('virtual_order_rejection_not_confirmed')
  const [rows]=await input.database.pool.query<OrderRow[]>(orderSql,[input.orderId,input.userId])
  const order=rows[0]
  if(!order) throw new UnpaidOrderError('virtual_order_not_found')
  if(order.status==='closed') {
    if(order.providerTransactionId!==null || order.paidAt!==null || order.deliveryConfirmedAt!==null)
      throw new UnpaidOrderError('virtual_order_payment_review_required')
    await assertNoSettlementEvidence(input.database.pool,order)
    return {state:'closed',credited:false}
  }
  assertUnpaid(order,input.config)
  await assertNoSettlementEvidence(input.database.pool,order)
  const missing=await isVirtualOrderMissingOnWechat(input.env,input.config,order.openId!,order.outTradeNo)
  if(!missing) throw new UnpaidOrderError('virtual_order_payment_review_required')

  const connection=await input.database.pool.getConnection()
  try {
    await connection.beginTransaction()
    try {
      const [locked]=await connection.query<OrderRow[]>(orderSql+' FOR UPDATE',[input.orderId,input.userId])
      const current=locked[0]
      if(!current || current.outTradeNo!==order.outTradeNo)
        throw new UnpaidOrderError('virtual_order_state_changed')
      assertUnpaid(current,input.config)
      await assertNoSettlementEvidence(connection,current)
      const [updated]=await connection.query<mysql.ResultSetHeader>(
        `UPDATE payment_orders p SET p.status='closed'
         WHERE p.id=? AND p.user_id=? AND p.out_trade_no=? AND p.status='pending'
           AND p.expires_at<=CURRENT_TIMESTAMP() AND p.provider_transaction_id IS NULL
           AND p.paid_at IS NULL AND p.virtual_delivery_confirmed_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM credit_ledger_entries l WHERE l.payment_order_id=p.id)
           AND NOT EXISTS (SELECT 1 FROM payment_notifications n WHERE n.out_trade_no=p.out_trade_no)`,
        [current.id,input.userId,current.outTradeNo])
      if(updated.affectedRows!==1) throw new UnpaidOrderError('virtual_order_state_changed')
      await connection.commit()
    } catch(error) { await connection.rollback(); throw error }
  } finally { connection.release() }
  return {state:'closed',credited:false}
}
