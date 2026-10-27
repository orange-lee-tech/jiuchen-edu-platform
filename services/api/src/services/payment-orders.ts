import { randomUUID } from 'node:crypto'
import type mysql from 'mysql2/promise'
import type { DatabaseContext } from '../db/client.js'
import { paymentGrantIdempotencyKey } from '../domain/credit-policy.js'
import type { CreditSku } from './commercial-config.js'
import { CommercialStateError } from './credit-ledger.js'
import { recordVirtualPaymentCase } from './virtual-payment-cases.js'
import type {
  VerifiedWechatPayNotification,
  WechatPayClientParams,
  WechatPayGateway,
} from './wechat-pay.js'

type ConfiguredDatabase = Extract<DatabaseContext, { configured: true }>

const PAYMENT_ORDER_WINDOW_MS = 30 * 60 * 1000

function isMissingTable(error: unknown) {
  const seen = new Set<unknown>()
  let current: unknown = error
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== 'object' || seen.has(current)) return false
    seen.add(current)
    const candidate = current as {
      code?: unknown
      errno?: unknown
      sqlState?: unknown
      cause?: unknown
    }
    if (
      String(candidate.code ?? '') === 'ER_NO_SUCH_TABLE' ||
      Number(candidate.errno) === 1146 ||
      String(candidate.sqlState ?? '') === '42S02'
    ) return true
    current = candidate.cause
  }
  return false
}

function isDuplicateKey(error: unknown) {
  const candidate = error as { code?: unknown; errno?: unknown }
  return (
    String(candidate?.code ?? '') === 'ER_DUP_ENTRY' ||
    Number(candidate?.errno) === 1062
  )
}

function outTradeNo(now: Date) {
  const stamp = now
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14)
  return `JC${stamp}${randomUUID().replaceAll('-', '').slice(0, 24)}`
}

export type PaymentOrderView = {
  id: string
  outTradeNo: string
  status: 'pending' | 'paid' | 'closed' | 'refunded'
  amountFen: number
  creditAmount: number
  providerTransactionId: string | null
  paidAt: string | null
  expiresAt: string | null
  createdAt: string
}

function serializeOrder(row: mysql.RowDataPacket): PaymentOrderView {
  return {
    id: String(row.id),
    outTradeNo: String(row.outTradeNo),
    status: row.status as PaymentOrderView['status'],
    amountFen: Number(row.amountFen),
    creditAmount: Number(row.creditAmount),
    providerTransactionId:
      typeof row.providerTransactionId === 'string'
        ? row.providerTransactionId
        : null,
    paidAt:
      row.paidAt instanceof Date ? row.paidAt.toISOString() : null,
    expiresAt:
      row.expiresAt instanceof Date ? row.expiresAt.toISOString() : null,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(row.createdAt).toISOString(),
  }
}

async function readOrderById(
  connection: mysql.Pool | mysql.PoolConnection,
  userId: string,
  orderId: string,
) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT
      id,
      out_trade_no AS outTradeNo,
      status,
      amount_fen AS amountFen,
      credit_amount AS creditAmount,
      provider_transaction_id AS providerTransactionId,
      paid_at AS paidAt,
      expires_at AS expiresAt,
      created_at AS createdAt
     FROM payment_orders
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [orderId, userId],
  )
  return rows[0] ? serializeOrder(rows[0]) : null
}

export async function createPaymentOrder(input: {
  database: ConfiguredDatabase
  userId: string
  sku: CreditSku
  gateway: WechatPayGateway
  now?: Date
}): Promise<{
  order: PaymentOrderView
  payment: WechatPayClientParams
}> {
  if (!input.gateway.isConfigured()) {
    throw new CommercialStateError('wechat_pay_not_configured')
  }

  const now = input.now ?? new Date()

  try {
    const [userRows] = await input.database.pool.query<mysql.RowDataPacket[]>(
      'SELECT wechat_open_id AS openId FROM users WHERE id = ? LIMIT 1',
      [input.userId],
    )
    const openId = userRows[0]?.openId
    if (typeof openId !== 'string' || !openId) {
      throw new CommercialStateError('wechat_pay_openid_required')
    }

    const id = randomUUID()
    const tradeNo = outTradeNo(now)
    const expiresAt = new Date(now.getTime() + PAYMENT_ORDER_WINDOW_MS)

    await input.database.pool.query(
      `INSERT INTO payment_orders
        (id, user_id, out_trade_no, provider, status, amount_fen, credit_amount, expires_at)
       VALUES (?, ?, ?, 'wechat_pay', 'pending', ?, ?, ?)`,
      [
        id,
        input.userId,
        tradeNo,
        input.sku.amountFen,
        input.sku.creditAmount,
        expiresAt,
      ],
    )

    const payment = await input.gateway.createJsapiOrder({
      outTradeNo: tradeNo,
      description: input.sku.description,
      amountFen: input.sku.amountFen,
      openId,
    })

    const order = await readOrderById(input.database.pool, input.userId, id)
    if (!order) {
      throw new Error('payment_order_readback_failed')
    }

    return { order, payment }
  } catch (error) {
    if (isMissingTable(error)) {
      throw new CommercialStateError('credit_payment_schema_not_ready')
    }
    throw error
  }
}

export async function getPaymentOrder(input: {
  database: ConfiguredDatabase
  userId: string
  orderId: string
}) {
  try {
    return await readOrderById(
      input.database.pool,
      input.userId,
      input.orderId,
    )
  } catch (error) {
    if (isMissingTable(error)) {
      throw new CommercialStateError('credit_payment_schema_not_ready')
    }
    throw error
  }
}

export type PaymentSettlementResult =
  | {
      status: 'processed'
      duplicate: boolean
      orderId: string
      grantedCredits: number
    }
  | {
      status: 'rejected'
      reason: string
    }

async function rejectNotification(
  connection: mysql.PoolConnection,
  notificationId: string,
  notification: VerifiedWechatPayNotification,
  reason: string,
): Promise<PaymentSettlementResult> {
  await connection.query(
    `UPDATE payment_notifications
     SET status = 'rejected',
         out_trade_no = ?,
         provider_transaction_id = ?,
         processed_at = CURRENT_TIMESTAMP
     WHERE notification_id = ?`,
    [
      notification.outTradeNo,
      notification.providerTransactionId,
      notificationId,
    ],
  )
  return { status: 'rejected', reason }
}

export async function settleVerifiedPaymentNotification(input: {
  database: ConfiguredDatabase
  notification: VerifiedWechatPayNotification
}): Promise<PaymentSettlementResult> {
  const connection = await input.database.pool.getConnection()
  let committed = false

  try {
    await connection.beginTransaction()

    let duplicateNotification = false
    try {
      await connection.query(
        `INSERT INTO payment_notifications
          (id, provider, notification_id, payload_hash, status)
         VALUES (?, 'wechat_pay', ?, ?, 'received')`,
        [
          randomUUID(),
          input.notification.notificationId,
          input.notification.payloadHash,
        ],
      )
    } catch (error) {
      if (!isDuplicateKey(error)) throw error
      duplicateNotification = true
    }

    if (duplicateNotification) {
      const [notificationRows] =
        await connection.query<mysql.RowDataPacket[]>(
          `SELECT
            status,
            payload_hash AS payloadHash,
            out_trade_no AS outTradeNo,
            provider_transaction_id AS providerTransactionId
           FROM payment_notifications
           WHERE notification_id = ?
           LIMIT 1
           FOR UPDATE`,
          [input.notification.notificationId],
        )
      const existing = notificationRows[0]
      if (!existing) {
        throw new CommercialStateError(
          'payment_notification_duplicate_missing',
        )
      }
      if (existing.payloadHash !== input.notification.payloadHash) {
        throw new CommercialStateError(
          'payment_notification_payload_conflict',
        )
      }
      if (existing.status === 'processed') {
        const [orderRows] = await connection.query<mysql.RowDataPacket[]>(
          `SELECT id, credit_amount AS creditAmount
           FROM payment_orders
           WHERE out_trade_no = ?
           LIMIT 1`,
          [input.notification.outTradeNo],
        )
        await connection.commit()
        committed = true
        return {
          status: 'processed',
          duplicate: true,
          orderId: orderRows[0] ? String(orderRows[0].id) : '',
          grantedCredits: orderRows[0]
            ? Number(orderRows[0].creditAmount)
            : 0,
        }
      }
      if (existing.status === 'rejected') {
        await connection.commit()
        committed = true
        return {
          status: 'rejected',
          reason: 'payment_notification_previously_rejected',
        }
      }
    }

    const [orderRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT
        id,
        user_id AS userId,
        status,
        amount_fen AS amountFen,
        credit_amount AS creditAmount,
        provider_transaction_id AS providerTransactionId
       FROM payment_orders
       WHERE out_trade_no = ?
       LIMIT 1
       FOR UPDATE`,
      [input.notification.outTradeNo],
    )
    const order = orderRows[0]
    if (!order) {
      const result = await rejectNotification(
        connection,
        input.notification.notificationId,
        input.notification,
        'payment_order_not_found',
      )
      await connection.commit()
      committed = true
      return result
    }

    if (Number(order.amountFen) !== input.notification.amountFen) {
      const result = await rejectNotification(
        connection,
        input.notification.notificationId,
        input.notification,
        'payment_amount_mismatch',
      )
      await connection.commit()
      committed = true
      return result
    }

    if (order.status === 'paid') {
      if (
        order.providerTransactionId ===
        input.notification.providerTransactionId
      ) {
        await connection.query(
          `UPDATE payment_notifications
           SET status = 'processed',
               out_trade_no = ?,
               provider_transaction_id = ?,
               processed_at = CURRENT_TIMESTAMP
           WHERE notification_id = ?`,
          [
            input.notification.outTradeNo,
            input.notification.providerTransactionId,
            input.notification.notificationId,
          ],
        )
        await connection.commit()
        committed = true
        return {
          status: 'processed',
          duplicate: true,
          orderId: String(order.id),
          grantedCredits: Number(order.creditAmount),
        }
      }

      const result = await rejectNotification(
        connection,
        input.notification.notificationId,
        input.notification,
        'payment_transaction_conflict',
      )
      await connection.commit()
      committed = true
      return result
    }

    if (order.status !== 'pending') {
      if(order.status==='closed' && input.notification.outTradeNo.startsWith('JCV'))
        await recordVirtualPaymentCase(connection,{eventKey:'late:'+String(order.id),
          orderId:String(order.id),kind:'late_payment',state:'open',
          reasonCode:'closed_order_payment_evidence'})
      const result = await rejectNotification(
        connection,
        input.notification.notificationId,
        input.notification,
        'payment_order_not_settleable',
      )
      await connection.commit()
      committed = true
      return result
    }

    const [transactionRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT id
       FROM payment_orders
       WHERE provider_transaction_id = ?
       LIMIT 1
       FOR UPDATE`,
      [input.notification.providerTransactionId],
    )
    if (
      transactionRows.length &&
      String(transactionRows[0].id) !== String(order.id)
    ) {
      const result = await rejectNotification(
        connection,
        input.notification.notificationId,
        input.notification,
        'payment_transaction_already_used',
      )
      await connection.commit()
      committed = true
      return result
    }

    const [userRows] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE',
      [order.userId],
    )
    if (!userRows.length) {
      throw new CommercialStateError('commercial_user_not_found')
    }

    const grantKey = paymentGrantIdempotencyKey(
      input.notification.outTradeNo,
    )
    const [grantRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT
        id,
        user_id AS userId,
        delta,
        payment_order_id AS paymentOrderId
       FROM credit_ledger_entries
       WHERE idempotency_key = ?
       LIMIT 1
       FOR UPDATE`,
      [grantKey],
    )
    const grant = grantRows[0]

    if (grant) {
      if (
        grant.userId !== order.userId ||
        String(grant.paymentOrderId) !== String(order.id) ||
        Number(grant.delta) !== Number(order.creditAmount)
      ) {
        throw new CommercialStateError(
          'payment_grant_idempotency_conflict',
        )
      }
    } else {
      await connection.query(
        `INSERT INTO credit_ledger_entries
          (id, user_id, type, delta, payment_order_id, idempotency_key, note)
         VALUES (?, ?, 'payment_grant', ?, ?, ?, ?)`,
        [
          randomUUID(),
          order.userId,
          Number(order.creditAmount),
          order.id,
          grantKey,
          'verified WeChat Pay settlement',
        ],
      )
    }

    await connection.query(
      `UPDATE payment_orders
       SET status = 'paid',
           provider_transaction_id = ?,
           paid_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [input.notification.providerTransactionId, order.id],
    )
    await connection.query(
      `UPDATE payment_notifications
       SET status = 'processed',
           out_trade_no = ?,
           provider_transaction_id = ?,
           processed_at = CURRENT_TIMESTAMP
       WHERE notification_id = ?`,
      [
        input.notification.outTradeNo,
        input.notification.providerTransactionId,
        input.notification.notificationId,
      ],
    )

    await connection.commit()
    committed = true
    return {
      status: 'processed',
      duplicate: Boolean(grant),
      orderId: String(order.id),
      grantedCredits: Number(order.creditAmount),
    }
  } catch (error) {
    if (!committed) await connection.rollback()
    if (isMissingTable(error)) {
      throw new CommercialStateError('credit_payment_schema_not_ready')
    }
    throw error
  } finally {
    connection.release()
  }
}
