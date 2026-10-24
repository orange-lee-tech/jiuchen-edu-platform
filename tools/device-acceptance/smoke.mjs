import assert from 'node:assert/strict'

const token = process.env.ACCEPTANCE_TOKEN
if (process.env.NODE_ENV !== 'test' || !token || token.length < 40) {
  throw new Error('Acceptance token and test environment required')
}
const base = process.env.ACCEPTANCE_HTTPS_URL || 'http://127.0.0.1:3312'
const agreement = { agreementAccepted: true, agreementVersion: 'placeholder-v0' }

async function call(path, { method = 'GET', role, session, body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'X-Acceptance-Token': token,
      ...(role ? { 'X-Acceptance-Identity': role } : {}),
      ...(session ? { Authorization: 'Bearer ' + session } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const value = await response.json()
  return { status: response.status, value }
}

const sessions = {}
for (const role of ['admin', 'student', 'teacher']) {
  const login = await call('/auth/wechat/bootstrap', {
    method: 'POST', role, body: agreement,
  })
  assert.equal(login.status, 200, role + ': bootstrap failed')
  assert.equal(login.value.user.role, role)
  assert.ok(login.value.session?.token)
  sessions[role] = login.value.session.token
  const me = await call('/auth/me', { session: sessions[role] })
  assert.equal(me.status, 200, role + ': session read failed')
  console.log(role.toUpperCase() + '_BOOTSTRAP_PASS')
}

for (const path of ['/me/admin/assessment-keys', '/me/admin/credit-plans']) {
  const result = await call(path, { session: sessions.admin })
  assert.equal(result.status, 200, path + ': admin read failed')
  for (const role of ['student', 'teacher']) {
    const forbidden = await call(path, { session: sessions[role] })
    assert.equal(forbidden.status, 403, path + ': role access leaked')
  }
}
console.log('ADMIN_COMMERCIAL_READ_AND_ROLE_BOUNDARY_PASS')

const students = await call('/me/teacher/students', { session: sessions.teacher })
assert.equal(students.status, 200)
const history = await call('/me/assessments', { session: sessions.student })
assert.equal(history.status, 200)
const firstGrant = await call('/me/credits/free-grant', {
  method: 'POST', session: sessions.student, body: {},
})
const secondGrant = await call('/me/credits/free-grant', {
  method: 'POST', session: sessions.student, body: {},
})
assert.equal(firstGrant.status, 200)
assert.equal(secondGrant.status, 200)
const account = await call('/me/credits', { session: sessions.student })
assert.equal(account.status, 200)
assert.equal(Number(account.value.account?.settledBalance), 5)
console.log('TEACHER_ASSIGNMENT_STUDENT_HISTORY_FREE_GRANT_IDEMPOTENCY_PASS')

const payment = await call('/me/virtual-payment-orders', {
  method: 'POST', session: sessions.student,
  body: { skuKey: 'JC001', wechatCode: 'synthetic-only' },
})
assert.equal(payment.status, 503)
assert.equal(payment.value.error, 'wechat_virtual_payment_not_ready')
console.log('LIVE_PAYMENT_DISABLED_PASS')
