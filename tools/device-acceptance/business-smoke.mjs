import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import mysql from '../../services/api/node_modules/mysql2/promise.js'

const root = path.resolve(import.meta.dirname, '../..')
const state = JSON.parse(fs.readFileSync(path.join(root, 'runtime/status.json'), 'utf8'))
const token = process.env.ACCEPTANCE_TOKEN
const url = new URL(process.env.DATABASE_URL || '')
if (process.env.NODE_ENV !== 'test' || !token || token.length < 40 ||
    url.hostname !== '127.0.0.1' || url.port !== '33306' ||
    url.pathname !== '/jiuchen_device_acceptance' ||
    !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(state.url)) {
  throw new Error('Business smoke requires live isolated acceptance state')
}
const base = 'http://127.0.0.1:3312'
const db = await mysql.createConnection(process.env.DATABASE_URL)
const proxyLog = path.join(root, 'runtime/logs/proxy.out.log')
const modelCalls = () => (fs.readFileSync(proxyLog, 'utf8').match(/mock_model_called/g) || []).length
async function call(pathname, { method='GET', session, role, body }={}) {
  const response = await fetch(base + pathname, {
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
function expect(result, status, label) {
  assert.equal(result.status, status, label + ': ' + String(result.value?.error || 'unexpected status'))
  return result.value
}
async function login(role) {
  const response = await call('/auth/wechat/bootstrap', {
    method:'POST', role,
    body:{ agreementAccepted:true, agreementVersion:'placeholder-v0' },
  })
  return expect(response, 200, role + ' login').session.token
}

try {
  const admin = await login('admin')
  const student = await login('student')
  const keyInput = (model, pin) => ({
    label: '隔离模型 ' + model, provider: 'openai-compatible',
    apiBaseUrl: state.url + '/mock-ai/v1', model, temperature: 0,
    apiKey: 'acceptance-model-' + model, note: '仅用于隔离验收', pin,
  })
  const initialKeys = expect(await call('/me/admin/assessment-keys', { session:admin }), 200, 'initial key list')
  const savedFirst = initialKeys.objects.find((item) => item.label === '隔离模型 alpha')
  const first = savedFirst
    ? { ...savedFirst, active: initialKeys.head.activeObjectId === savedFirst.id }
    : expect(await call('/me/admin/assessment-keys', {
      method:'POST', session:admin, body:keyInput('alpha','111111'),
    }), 201, 'first key')
  assert.equal(first.active, true)
  const keysAfterFirst = expect(await call('/me/admin/assessment-keys', { session:admin }), 200, 'list keys')
  assert.equal(keysAfterFirst.head.activeObjectId, first.id)
  assert.ok(!JSON.stringify(keysAfterFirst).includes('acceptance-model-alpha'))
  const [[beforeBadPin]] = await db.query(
    'SELECT failed_attempts FROM assessment_key_objects WHERE id=?',[first.id])
  const callsBeforeBadPin = modelCalls()
  expect(await call('/me/admin/assessment-keys/' + first.id + '/test', {
    method:'POST', session:admin, body:{ pin:'000000' },
  }), 403, 'bad object PIN')
  assert.equal(modelCalls(), callsBeforeBadPin)
  const [[afterBadPin]] = await db.query(
    'SELECT failed_attempts,last_test_result FROM assessment_key_objects WHERE id=?',[first.id])
  assert.equal(Number(afterBadPin.failed_attempts),Number(beforeBadPin.failed_attempts)+1)
  assert.equal(afterBadPin.last_test_result,savedFirst?.lastTestResult ?? null)
  const test = expect(await call('/me/admin/assessment-keys/' + first.id + '/test', {
    method:'POST', session:admin, body:{ pin:'111111' },
  }), 200, 'correct object PIN')
  assert.equal(test.reachable,true)
  assert.ok(modelCalls() > callsBeforeBadPin)
  const [[afterGoodPin]] = await db.query(
    'SELECT failed_attempts,last_test_result FROM assessment_key_objects WHERE id=?',[first.id])
  assert.equal(Number(afterGoodPin.failed_attempts),0)
  assert.equal(afterGoodPin.last_test_result,'passed')
  console.log('KEY_AUTO_ACTIVATE_ENCRYPTED_READ_BAD_PIN_BLOCK_GOOD_PIN_TEST_PASS')

  const second = expect(await call('/me/admin/assessment-keys', {
    method:'POST', session:admin, body:keyInput('beta','222222'),
  }), 201, 'candidate key')
  assert.equal(second.active,false)
  expect(await call('/me/admin/assessment-keys/' + second.id + '/activate', {
    method:'POST', session:admin,
    body:{ expectedVersion:first.version,currentPin:'000000',targetPin:'222222' },
  }), 403, 'wrong control PIN')
  const afterRejected = expect(await call('/me/admin/assessment-keys', { session:admin }), 200, 'key pointer after rejection')
  assert.equal(afterRejected.head.activeObjectId,first.id)
  const switched = expect(await call('/me/admin/assessment-keys/' + second.id + '/activate', {
    method:'POST', session:admin,
    body:{ expectedVersion:first.version,currentPin:'111111',targetPin:'222222' },
  }), 200, 'key switch')
  assert.equal(switched.activeObjectId,second.id)
  console.log('KEY_WRONG_CONTROL_PIN_PRESERVES_OLD_SWITCH_TO_NEW_PASS')

  const plans = expect(await call('/me/admin/credit-plans', { session:admin }), 200, 'plan list')
  assert.match(plans.currentCostConfigFingerprint || '', /^[a-f0-9]{64}$/)
  const planInput = (name, pin, counts) => ({
    name, note:'隔离成本估算；非真实账单', counts,
    estimatedCostFen:1, costConfirmed:true,
    expectedCostConfigFingerprint:plans.currentCostConfigFingerprint, pin,
  })
  const planA = expect(await call('/me/admin/credit-plans', {
    method:'POST', session:admin,
    body:planInput('隔离初始次数方案','333333',
      {JC000:2,JC001:1,JC002:5,JC003:10}),
  }), 201, 'first plan')
  assert.equal(planA.active,true)
  const planB = expect(await call('/me/admin/credit-plans', {
    method:'POST', session:admin,
    body:planInput('隔离调整次数方案','444444',
      {JC000:2,JC001:2,JC002:6,JC003:20}),
  }), 201, 'candidate plan')
  assert.equal(planB.active,false)
  expect(await call('/me/admin/credit-plans/' + planB.id + '/activate', {
    method:'POST', session:admin,
    body:{ expectedVersion:planA.version,currentPin:'000000',targetPin:'444444' },
  }), 403, 'wrong plan control PIN')
  const planRejected = expect(await call('/me/admin/credit-plans', { session:admin }), 200, 'plan pointer after rejection')
  assert.equal(planRejected.head.activePlanId,planA.id)
  const planSwitched = expect(await call('/me/admin/credit-plans/' + planB.id + '/activate', {
    method:'POST', session:admin,
    body:{ expectedVersion:planA.version,currentPin:'333333',targetPin:'444444' },
  }), 200, 'plan switch')
  assert.equal(planSwitched.activePlanId,planB.id)
  console.log('PLAN_COST_FINGERPRINT_PIN_SWITCH_AND_FIXED_PRICE_PASS')

  const grant = expect(await call('/me/credits/free-grant', {
    method:'POST', session:student, body:{},
  }), 200, 'student free grant')
  assert.ok(grant.account)
  const account = expect(await call('/me/credits', { session:student }), 200, 'student credits')
  assert.equal(Number(account.account.settledBalance),5)
  console.log('STUDENT_FREE_CREDITS_PASS')
} finally { await db.end() }
