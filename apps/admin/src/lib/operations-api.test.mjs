import test from 'node:test'
import assert from 'node:assert/strict'
import { OperationsError, operationsClient } from './operations-api.ts'

function response(status, payload) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload } }
}

test('admin reads use only their bearer session; no mutation or persisted credentials', async () => {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('/auth/me')) return response(200, { ok: true, user: { role: 'admin', displayName: null } })
    return response(200, { ok: true, internalIds: [] })
  }
  const client = operationsClient('private-session', fetcher)
  await client.verifyAdmin()
  assert.deepEqual(await client.identities(), [])
  assert.deepEqual(calls.map(call => call.url), ['/api/auth/me', '/api/me/admin/internal-ids'])
  for (const { options } of calls) {
    assert.equal(options.method, 'GET')
    assert.equal(options.credentials, 'omit')
    assert.equal(options.headers.authorization, 'Bearer private-session')
  }
})

test('non-admin, failed payment source, HTTP failure and malformed result stay distinct', async () => {
  const nonAdmin = operationsClient('session', async () => response(200, { ok: true, user: { role: 'teacher' } }))
  await assert.rejects(nonAdmin.verifyAdmin(), error => error instanceof OperationsError && error.status === 403)
  const result = { ok: true, analytics: { sources: Object.fromEntries(['assessments', 'payments', 'ledger', 'reservations'].map(source => [source, { status: source === 'payments' ? 'error' : 'ok', error: source === 'payments' ? 'ER_NO_SUCH_TABLE' : null }])), range: { from: '2026-10-01', before: '2026-11-01', timezone: 'Asia/Shanghai' }, summary: { assessmentCount: 9, rechargeAmountFen: null }, buckets: [], payers: [], ledger: {}, gaps: {}, supplier: {} } }
  const analytics = await operationsClient('session', async () => response(200, result)).analytics('month')
  assert.equal(analytics.summary.assessmentCount, 9)
  assert.equal(analytics.summary.rechargeAmountFen, null)
  await assert.rejects(operationsClient('session', async () => response(503, { ok: false, error: 'database_error' })).news(), error => error instanceof OperationsError && error.status === 503)
  await assert.rejects(operationsClient('session', async () => response(200, { ok: true })).identities(), /版本不匹配/)
  await assert.rejects(operationsClient('session', async () => response(200, { ok: true, analytics: { sources: {}, range: {}, summary: { assessmentCount: 0 } } })).analytics('week'), /版本不匹配/)
})
