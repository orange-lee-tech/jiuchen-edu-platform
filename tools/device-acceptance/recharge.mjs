import { createHash, randomUUID } from 'node:crypto'
import { loadEnv } from '../../services/api/dist/config/env.js'
import { createDatabaseContext } from '../../services/api/dist/db/client.js'
import { FIXED_ASSESSMENT_SKUS } from '../../services/api/dist/services/commercial-config.js'
import { readActiveCreditPlan } from '../../services/api/dist/services/credit-plans.js'
import { settleVerifiedPaymentNotification } from '../../services/api/dist/services/payment-orders.js'

const skuAlias = {
  'assessment-1': 'JC001',
  'assessment-10': 'JC003',
  JC000: 'JC000', JC001: 'JC001', JC002: 'JC002', JC003: 'JC003',
}
const skuKey = skuAlias[process.argv[2] || 'assessment-1']
if (!skuKey) throw new Error('Only the fixed assessment SKU catalog is accepted')
const env = loadEnv()
const url = new URL(env.DATABASE_URL || '')
if (env.NODE_ENV !== 'test' || url.hostname !== '127.0.0.1' ||
    url.port !== '33306' || url.pathname !== '/jiuchen_device_acceptance' ||
    env.WECHAT_VIRTUAL_PAY_ENABLED === true) {
  throw new Error('Refusing non-acceptance or live-payment environment')
}
const database = createDatabaseContext(env)
if (!database.configured) throw new Error('Acceptance database unavailable')
const pool = database.pool
const studentId = '00000000-0000-4000-8000-000000000103'
try {
  const plan = await readActiveCreditPlan(pool, env)
  if (!plan.initialized || !plan.costVerified) {
    throw new Error('Activate and cost-verify an assessment plan before simulated recharge')
  }
  const selected = plan.skus.find((item) => item.key === skuKey)
  const fixed = FIXED_ASSESSMENT_SKUS.find((item) => item.key === skuKey)
  if (!selected || !fixed || !selected.planId || !selected.planVersion) {
    throw new Error('Fixed SKU or active plan snapshot missing')
  }
  const orderId = randomUUID()
  const orderNo = 'JCVSIM' + Date.now() + randomUUID().replaceAll('-', '').slice(0, 10)
  const transactionId = 'SIM-' + randomUUID()
  const notificationId = 'device-' + orderNo
  const payloadHash = createHash('sha256')
    .update(JSON.stringify({ orderNo, amountFen: fixed.amountFen, transactionId }))
    .digest('hex')
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [headRows] = await connection.query(
      'SELECT active_plan_id,version FROM credit_plan_head WHERE id=1 FOR UPDATE')
    if (headRows[0]?.active_plan_id !== selected.planId ||
        Number(headRows[0]?.version) !== selected.planVersion) {
      throw new Error('Active plan changed; retry simulated checkout')
    }
    await connection.query(
      `INSERT INTO payment_orders
       (id,user_id,out_trade_no,provider,status,sku_key,plan_id,plan_version,
        amount_fen,credit_amount,pay_environment,wechat_product_id,expires_at)
       VALUES (?,?,?,'wechat_pay','pending',?,?,?,?,?,'sandbox',?,DATE_ADD(CURRENT_TIMESTAMP(),INTERVAL 30 MINUTE))`,
      [orderId, studentId, orderNo, skuKey, selected.planId, selected.planVersion,
        fixed.amountFen, selected.creditAmount, 'SIMULATED-' + skuKey])
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
  const notification = {
    notificationId, outTradeNo: orderNo, providerTransactionId: transactionId,
    amountFen: fixed.amountFen, currency: 'CNY',
    merchantId: 'device-acceptance-only', appId: 'device-acceptance-only',
    success: true, payloadHash,
  }
  const settled = await settleVerifiedPaymentNotification({ database, notification })
  const replay = await settleVerifiedPaymentNotification({ database, notification })
  if (settled.status !== 'processed' || settled.duplicate ||
      replay.status !== 'processed' || !replay.duplicate ||
      settled.grantedCredits !== selected.creditAmount) {
    throw new Error('Simulated payment settlement or idempotency failed')
  }
  console.log(JSON.stringify({
    simulation: true, orderId, skuKey, amountFen: fixed.amountFen,
    grantedCredits: settled.grantedCredits, planId: selected.planId,
    planVersion: selected.planVersion, replayDuplicate: replay.duplicate,
  }))
} finally { await pool.end() }
