import type mysql from 'mysql2/promise'
import type { FastifyBaseLogger } from 'fastify'
import type { AppEnv } from '../config/env.js'
import type { DatabaseContext } from '../db/client.js'
import { settleVerifiedPaymentNotification } from './payment-orders.js'
import { finishVirtualReconcileAttempt, recordVirtualPaymentCase,
  startVirtualReconcileAttempt, VIRTUAL_RECONCILE_ATTEMPT_LIMIT } from './virtual-payment-cases.js'
import {
  confirmVirtualDelivery,
  isVirtualOrderMissingOnWechat,
  queryVirtualPayment,
  VirtualQueryError,
  type VirtualPayConfig,
} from './wechat-virtual-payment.js'

type ConfiguredDatabase = Extract<DatabaseContext, { configured: true }>
export type VirtualOrder = {
  id: string
  outTradeNo: string
  amountFen: number
  status: string
  openId: string | null
  deliveryConfirmedAt: Date | null
  payEnvironment: string | null
  wechatProductId: string | null
}

export async function reconcileVirtualOrder(input: {
  database: ConfiguredDatabase
  env: AppEnv
  config: VirtualPayConfig
  order: VirtualOrder
  checkPaidState?: boolean
  deliveryPush?: boolean
}): Promise<{ state: 'paid' | 'pending' | 'refunded' | 'closed' | 'review'; credited: boolean; deliveryPending?: boolean; requiresFinanceReview?: boolean }> {
  const { database, env, config, order } = input
  if (order.payEnvironment && order.payEnvironment !== (config.env === 0 ? 'production' : 'sandbox')) {
    throw new Error('virtual_payment_environment_mismatch')
  }
  if(order.status==='refunded') return {state:'refunded',credited:false}
  if(order.status==='closed') {
    if(input.checkPaidState && order.openId) {
      const missing=await isVirtualOrderMissingOnWechat(env,config,order.openId,order.outTradeNo)
      if(!missing) {
        const late=await queryVirtualPayment(env,config,order.openId,order.outTradeNo,
          order.amountFen,order.wechatProductId??undefined)
        if(['paid','refunded','review'].includes(late.state)) {
          await recordVirtualPaymentCase(database.pool,{eventKey:'late:'+order.id,
            orderId:order.id,kind:'late_payment',state:'open',
            reasonCode:'closed_order_payment_evidence'})
          return {state:'review',credited:false,requiresFinanceReview:true}
        }
      }
    }
    return {state:'closed',credited:false}
  }
  if (!order.openId) throw new Error('wechat_openid_missing')
  if (order.status === 'paid' && input.checkPaidState) {
    const state = await queryVirtualPayment(env, config, order.openId, order.outTradeNo, order.amountFen, order.wechatProductId ?? undefined)
    if (state.state === 'review' || state.state === 'refunded' || state.state === 'closed') {
      await recordVirtualPaymentCase(database.pool,{eventKey:'query:'+order.id,
        orderId:order.id,kind:'reconciliation',state:'open',
        reasonCode:state.reason??(state.state==='refunded'?'refund_needs_credit_review':'paid_order_closed')})
      if(state.state==='refunded') {
        await database.pool.query(
          "UPDATE payment_orders SET status='refunded' WHERE id=? AND status='paid'",[order.id])
      }
      return { state: state.state, credited: true, requiresFinanceReview: true }
    }
    if (state.state !== 'paid') throw new Error('virtual_paid_state_conflict')
  }

  // A settled order needs only the independent delivery acknowledgement.
  // After a restart the timestamp tells the worker whether to retry it.
  if (order.status !== 'paid') {
    const verified = await queryVirtualPayment(env, config, order.openId, order.outTradeNo, order.amountFen, order.wechatProductId ?? undefined)
    if (verified.state === 'pending') return { state: 'pending', credited: false }
    if (verified.state === 'review') {
      await recordVirtualPaymentCase(database.pool,{eventKey:'query:'+order.id,
        orderId:order.id,kind:'reconciliation',state:'open',
        reasonCode:verified.reason??'query_needs_review'})
      return {state:'review',credited:false,requiresFinanceReview:true}
    }
    if (verified.state === 'closed' || verified.state === 'refunded') {
      const [updated] = await database.pool.query<mysql.ResultSetHeader>(
        "UPDATE payment_orders SET status = ? WHERE id = ? AND status = 'pending'",
        [verified.state, order.id],
      )
      if (updated.affectedRows !== 1) throw new Error('virtual_order_state_changed')
      if(verified.state==='refunded') await recordVirtualPaymentCase(database.pool,{
        eventKey:'query:'+order.id,orderId:order.id,kind:'refund',state:'open',
        reasonCode:'refund_needs_credit_review'})
      return { state: verified.state, credited: false }
    }
    if (!verified.transactionId || !verified.notificationId || !verified.payloadHash) {
      throw new Error('virtual_payment_unverified')
    }
    const settlement = await settleVerifiedPaymentNotification({
      database,
      notification: {
        notificationId: verified.notificationId,
        outTradeNo: order.outTradeNo,
        providerTransactionId: verified.transactionId,
        amountFen: order.amountFen,
        currency: 'CNY',
        merchantId: config.offerId,
        appId: env.WECHAT_APP_ID || '',
        success: true,
        payloadHash: verified.payloadHash,
      },
    })
    if (settlement.status === 'rejected') throw new Error('virtual_payment_settlement_rejected')
  }

  if (order.deliveryConfirmedAt) return { state: 'paid', credited: true }
  if(input.deliveryPush) {
    await database.pool.query(
      `UPDATE payment_orders SET virtual_delivery_confirmed_at=CURRENT_TIMESTAMP
       WHERE id=? AND status='paid' AND virtual_delivery_confirmed_at IS NULL`,[order.id])
    return {state:'paid',credited:true,deliveryPending:false}
  }
  try {
    await confirmVirtualDelivery(env, config, order.outTradeNo)
    await database.pool.query(
      `UPDATE payment_orders SET virtual_delivery_confirmed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'paid' AND virtual_delivery_confirmed_at IS NULL`,
      [order.id],
    )
    return { state: 'paid', credited: true, deliveryPending: false }
  } catch {
    return { state: 'paid', credited: true, deliveryPending: true }
  }
}

export async function readVirtualOrder(
  pool: mysql.Pool, id: string, userId?: string,
): Promise<VirtualOrder | null> {
  const base = `SELECT p.id, p.out_trade_no AS outTradeNo, p.amount_fen AS amountFen,
            p.status, u.wechat_open_id AS openId,
            p.virtual_delivery_confirmed_at AS deliveryConfirmedAt`
  const tail = ` FROM payment_orders p INNER JOIN users u ON u.id = p.user_id
      WHERE p.id = ? AND p.out_trade_no LIKE 'JCV%' ${userId ? 'AND p.user_id = ?' : ''}
      LIMIT 1`
  const params = userId ? [id, userId] : [id]
  let rows: mysql.RowDataPacket[] = []
  try {
    [rows] = await pool.query<mysql.RowDataPacket[]>(
      base + ', p.pay_environment AS payEnvironment,p.wechat_product_id AS wechatProductId' + tail, params)
  } catch (error) {
    if ((error as { code?: string }).code !== 'ER_BAD_FIELD_ERROR') {
      throw error instanceof Error ? error : new Error('virtual_order_read_failed')
    }
    [rows] = await pool.query<mysql.RowDataPacket[]>(base + tail, params)
  }
  const row = rows[0]
  return row ? {
    id: String(row.id),
    outTradeNo: String(row.outTradeNo),
    amountFen: Number(row.amountFen),
    status: String(row.status),
    openId: row.openId ? String(row.openId) : null,
    deliveryConfirmedAt: row.deliveryConfirmedAt instanceof Date ? row.deliveryConfirmedAt : null,
    payEnvironment: row.payEnvironment ? String(row.payEnvironment) : null,
    wechatProductId: row.wechatProductId ? String(row.wechatProductId) : null,
  } : null
}

export function createVirtualPaymentRecovery(input: {
  database: ConfiguredDatabase
  env: AppEnv
  config: VirtualPayConfig
  logger: Pick<FastifyBaseLogger, 'warn'>
  intervalMs?: number
}) {
  let timer: ReturnType<typeof setInterval> | undefined
  let busy = false
  async function tick() {
    if (busy) return
    busy = true
    try {
      // Bounded batch. Never infer failure from a client leaving the page.
      // Unsettled orders stay queryable after the checkout window expires.
      const [rows] = await input.database.pool.query<mysql.RowDataPacket[]>(
        `SELECT p.id FROM payment_orders p
          LEFT JOIN virtual_payment_cases c ON c.event_key=CONCAT('recovery:',p.id)
          WHERE p.out_trade_no LIKE 'JCV%' AND
            ((p.status IN ('pending','closed') AND p.created_at >= CURRENT_TIMESTAMP - INTERVAL 7 DAY) OR
             (p.status = 'paid' AND p.virtual_delivery_confirmed_at IS NULL
               AND p.created_at >= CURRENT_TIMESTAMP - INTERVAL 30 DAY))
            AND COALESCE(c.attempt_count,0) < ?
            AND (c.state IS NULL OR c.state IN ('processing','succeeded'))
            AND (p.virtual_reconcile_checked_at IS NULL OR
              (p.created_at > CURRENT_TIMESTAMP - INTERVAL 30 MINUTE AND
                p.virtual_reconcile_checked_at < CURRENT_TIMESTAMP - INTERVAL 2 MINUTE) OR
              (p.created_at <= CURRENT_TIMESTAMP - INTERVAL 30 MINUTE AND
               p.created_at > CURRENT_TIMESTAMP - INTERVAL 2 HOUR AND
                p.virtual_reconcile_checked_at < CURRENT_TIMESTAMP - INTERVAL 10 MINUTE) OR
              (p.created_at <= CURRENT_TIMESTAMP - INTERVAL 2 HOUR AND
               p.created_at > CURRENT_TIMESTAMP - INTERVAL 1 DAY AND
                p.virtual_reconcile_checked_at < CURRENT_TIMESTAMP - INTERVAL 1 HOUR) OR
              (p.created_at <= CURRENT_TIMESTAMP - INTERVAL 1 DAY AND
                p.virtual_reconcile_checked_at < CURRENT_TIMESTAMP - INTERVAL 12 HOUR))
          ORDER BY p.virtual_reconcile_checked_at ASC, p.created_at ASC LIMIT 5`,
        [VIRTUAL_RECONCILE_ATTEMPT_LIMIT],
      )
      for (const row of rows) {
        const order = await readVirtualOrder(input.database.pool, String(row.id))
        if (!order) continue
        try {
          if(!(await startVirtualReconcileAttempt(input.database.pool,order.id))) continue
          await input.database.pool.query(
            'UPDATE payment_orders SET virtual_reconcile_checked_at = CURRENT_TIMESTAMP WHERE id = ?',
            [order.id],
          )
          const result=await reconcileVirtualOrder({ ...input, order,checkPaidState:true })
          await finishVirtualReconcileAttempt(input.database.pool,order.id,
            result.requiresFinanceReview?'review_required':result.deliveryPending?'delivery_pending':
              result.state==='pending'?'pending':'completed')
        } catch (error) {
          const gatewayCode=error instanceof VirtualQueryError?error.gatewayCode:null
          const message=error instanceof Error?error.message:''
          const temporary=gatewayCode===268490002 || /^virtual_gateway_http_(429|5\d\d)$/.test(message) ||
            error instanceof TypeError || error instanceof DOMException
          await finishVirtualReconcileAttempt(input.database.pool,order.id,
            temporary?'temporary_failure':'permanent_failure')
          input.logger.warn({ orderId: order.id, code: error instanceof Error ? error.name : 'unknown' }, 'virtual order recovery pending')
        }
      }
    } catch (error) {
      input.logger.warn({ code: error instanceof Error ? error.name : 'unknown' }, 'virtual order recovery unavailable')
    } finally {
      busy = false
    }
  }
  return {
    start() {
      if (timer) return
      timer = setInterval(() => { void tick() }, input.intervalMs ?? 60_000)
      timer.unref()
      void tick()
    },
    stop() { if (timer) clearInterval(timer); timer = undefined },
    tick,
  }
}
