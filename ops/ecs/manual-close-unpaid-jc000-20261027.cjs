// One-off, operator-authorized recovery of the first JC000 order.
// Run only through the companion ECS wrapper; never print credentials or row IDs.
'use strict'
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const mysql = require(path.join(process.cwd(), 'node_modules/mysql2/promise'))

const mode = process.argv[2]
const expectedFingerprint = process.argv[3]
if (!['--preflight', '--apply'].includes(mode) ||
    (mode === '--apply' && !/^[a-f0-9]{16}$/.test(expectedFingerprint || ''))) {
  console.error('BLOCKED=usage')
  process.exit(2)
}
const dbConfig = process.env.DATABASE_URL || {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
}
const auditPath = '/opt/jiuchen-api/shared/manual-jc000-closures.jsonl'
const fingerprint = row => crypto.createHash('sha256')
  .update(`${row.id}\0${row.out_trade_no}\0${row.user_id}`)
  .digest('hex').slice(0, 16)
const baseWhere = `p.sku_key='JC000' AND p.amount_fen=10 AND p.credit_amount=2
  AND p.pay_environment='production' AND p.out_trade_no LIKE 'JCV%'
  AND p.status='pending'`

async function findUniqueOrder(db) {
  const [rows] = await db.query(`SELECT p.id,p.user_id,p.out_trade_no,p.status,
      p.amount_fen,p.credit_amount,p.wechat_product_id,p.pay_environment,
      p.provider_transaction_id,p.paid_at,p.virtual_delivery_confirmed_at,
      p.created_at,p.expires_at,u.wechat_open_id
    FROM payment_orders p INNER JOIN users u ON u.id=p.user_id
    WHERE ${baseWhere} ORDER BY p.created_at ASC LIMIT 2`)
  if (rows.length !== 1) throw new Error(`candidate_count_${rows.length}`)
  const row = rows[0]
  if (!row.wechat_open_id || !row.wechat_product_id ||
      row.wechat_product_id !== process.env.WECHAT_VIRTUAL_PAY_PRODUCT_TEST ||
      row.provider_transaction_id !== null || row.paid_at !== null ||
      row.virtual_delivery_confirmed_at !== null) throw new Error('order_evidence_conflict')
  const [ledger] = await db.query(
    'SELECT COUNT(*) AS n FROM credit_ledger_entries WHERE payment_order_id=?', [row.id])
  const [notifications] = await db.query(
    'SELECT COUNT(*) AS n FROM payment_notifications WHERE out_trade_no=?', [row.out_trade_no])
  if (Number(ledger[0].n) !== 0 || Number(notifications[0].n) !== 0)
    throw new Error('payment_or_credit_evidence_present')
  return row
}

async function confirmOfficialMissing(row) {
  if (process.env.WECHAT_VIRTUAL_PAY_ENV !== 'production' ||
      !process.env.WECHAT_VIRTUAL_PAY_APP_KEY ||
      !process.env.WECHAT_APP_ID || !process.env.WECHAT_APP_SECRET)
    throw new Error('production_wechat_config_missing')
  const tokenResponse = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
    method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({grant_type: 'client_credential',
      appid: process.env.WECHAT_APP_ID, secret: process.env.WECHAT_APP_SECRET,
      force_refresh: false}), signal: AbortSignal.timeout(10000),
  })
  if (!tokenResponse.ok) throw new Error('wechat_token_http_failure')
  const token = await tokenResponse.json()
  if (!token.access_token || token.errcode) throw new Error('wechat_token_unavailable')
  const body = JSON.stringify({openid: row.wechat_open_id, env: 0,
    order_id: row.out_trade_no})
  const paySig = crypto.createHmac('sha256', process.env.WECHAT_VIRTUAL_PAY_APP_KEY)
    .update('/xpay/query_order&' + body, 'utf8').digest('hex')
  const url = new URL('https://api.weixin.qq.com/xpay/query_order')
  url.searchParams.set('access_token', token.access_token)
  url.searchParams.set('pay_sig', paySig)
  const response = await fetch(url, {method: 'POST',
    headers: {'content-type': 'application/json'}, body,
    signal: AbortSignal.timeout(10000)})
  if (!response.ok) throw new Error('wechat_query_http_failure')
  const result = await response.json()
  if (result.errcode !== 268490002 ||
      !String(result.errmsg || '').includes('数据不存在'))
    throw new Error('official_order_state_not_confirmed_missing')
  return 268490002
}

function appendAudit(action, row) {
  const record = {time: new Date().toISOString(), action,
    orderId: row.id, outTradeNo: row.out_trade_no,
    fingerprint: fingerprint(row), reason: 'operator_confirmed_no_payment;official_query_268490002',
    actor: 'authorized_2026-10-27_recovery'}
  fs.appendFileSync(auditPath, JSON.stringify(record) + '\n', {mode: 0o600, flag: 'a'})
}

async function main() {
  const db = await mysql.createConnection(dbConfig)
  try {
    const row = await findUniqueOrder(db)
    const code = await confirmOfficialMissing(row)
    const fp = fingerprint(row)
    console.log(`ORDER_PREFLIGHT_PASS fingerprint=${fp} status=pending sku=JC000 amount_fen=10 credits=2 ledger=0 notifications=0 transaction=false paid_at=false delivery=false official_code=${code}`)
    if (mode === '--preflight') return
    if (fp !== expectedFingerprint) throw new Error('fingerprint_changed')

    await db.beginTransaction()
    try {
      const [locked] = await db.query(
        `SELECT p.id,p.user_id,p.out_trade_no,p.status,p.sku_key,p.amount_fen,
          p.credit_amount,p.pay_environment,p.wechat_product_id,
          p.provider_transaction_id,p.paid_at,p.virtual_delivery_confirmed_at
         FROM payment_orders p WHERE p.id=? FOR UPDATE`, [row.id])
      const current = locked[0]
      if (!current || fingerprint(current) !== fp || current.status !== 'pending' ||
          current.sku_key !== 'JC000' || Number(current.amount_fen) !== 10 ||
          Number(current.credit_amount) !== 2 || current.pay_environment !== 'production' ||
          current.wechat_product_id !== process.env.WECHAT_VIRTUAL_PAY_PRODUCT_TEST ||
          current.provider_transaction_id !== null || current.paid_at !== null ||
          current.virtual_delivery_confirmed_at !== null)
        throw new Error('locked_order_state_changed')
      const [ledger] = await db.query(
        'SELECT id FROM credit_ledger_entries WHERE payment_order_id=? FOR UPDATE', [row.id])
      const [notifications] = await db.query(
        'SELECT id FROM payment_notifications WHERE out_trade_no=? FOR UPDATE', [row.out_trade_no])
      if (ledger.length || notifications.length) throw new Error('locked_payment_evidence_present')
      appendAudit('authorized_close_started', row)
      const [updated] = await db.query(`UPDATE payment_orders p SET p.status='closed'
        WHERE p.id=? AND ${baseWhere}
          AND p.provider_transaction_id IS NULL AND p.paid_at IS NULL
          AND p.virtual_delivery_confirmed_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM credit_ledger_entries l WHERE l.payment_order_id=p.id)
          AND NOT EXISTS (SELECT 1 FROM payment_notifications n WHERE n.out_trade_no=p.out_trade_no)`, [row.id])
      if (updated.affectedRows !== 1) throw new Error('conditional_update_not_applied')
      await db.commit()
    } catch (error) {
      await db.rollback()
      throw error
    }
    appendAudit('authorized_close_committed', row)
    const [after] = await db.query(
      'SELECT status,provider_transaction_id,paid_at,virtual_delivery_confirmed_at FROM payment_orders WHERE id=?', [row.id])
    const [afterLedger] = await db.query(
      'SELECT COUNT(*) AS n FROM credit_ledger_entries WHERE payment_order_id=?', [row.id])
    const [afterNotifications] = await db.query(
      'SELECT COUNT(*) AS n FROM payment_notifications WHERE out_trade_no=?', [row.out_trade_no])
    if (after[0]?.status !== 'closed' || after[0].provider_transaction_id !== null ||
        after[0].paid_at !== null || after[0].virtual_delivery_confirmed_at !== null ||
        Number(afterLedger[0].n) !== 0 || Number(afterNotifications[0].n) !== 0)
      throw new Error('post_close_invariant_failed')
    console.log(`ORDER_CLOSE_PASS fingerprint=${fp} status=closed record_retained=true audit_written=true credited=false`)
  } finally { await db.end() }
}
main().catch(error => {
  const code = String(error?.message || 'unknown').replace(/[^A-Za-z0-9_]/g, '').slice(0, 80)
  console.error('BLOCKED=' + code)
  process.exitCode = 1
})
