import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import mysql from '../../services/api/node_modules/mysql2/promise.js'

const root = path.resolve(import.meta.dirname, '../..')
const state = JSON.parse(fs.readFileSync(path.join(root, 'runtime/status.json'), 'utf8'))
const token = process.env.ACCEPTANCE_TOKEN
const dbUrl = new URL(process.env.DATABASE_URL || '')
if (process.env.NODE_ENV !== 'test' || !token || dbUrl.hostname !== '127.0.0.1' ||
    dbUrl.port !== '33306' || dbUrl.pathname !== '/jiuchen_device_acceptance' ||
    !state.httpsServerReachable) throw new Error('Isolated acceptance state required')

const modelLog = path.join(root, 'runtime/logs/proxy.out.log')
const betaCalls = () => (fs.readFileSync(modelLog, 'utf8').match(/"mock_model_called","model":"beta"/g) || []).length
async function call(pathname, method='GET', session, body) {
  const response = await fetch('http://127.0.0.1:3312' + pathname, {
    method,
    headers: {
      'X-Acceptance-Token': token,
      'X-Acceptance-Identity': 'student',
      ...(session ? { Authorization: 'Bearer ' + session } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const value = await response.json()
  assert.ok(response.ok, pathname + ': ' + (value.error || response.status))
  return value
}
const login = await call('/auth/wechat/bootstrap', 'POST', undefined,
  { agreementAccepted: true, agreementVersion: 'placeholder-v0' })
const session = login.session.token
const before = await call('/me/credits', 'GET', session)
const beforeBalance = Number(before.account.settledBalance)
const beforeCalls = betaCalls()
const created = await call('/me/assessments', 'POST', session, {
  input: {
    profile: { university:'示例大学', major:'示例专业', currentGrade:'大三' },
    english: [], research: [], competitions: [],
    targets: [{ schoolName:'目标大学' }],
  },
})
const id = created.assessment.id
await call('/me/assessments/' + id + '/run', 'POST', session)
let row
for (let i=0; i<90; i++) {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  row = (await call('/me/assessments/' + id, 'GET', session)).assessment
  if (row.status === 'succeeded' || row.status === 'failed') break
}
const db = await mysql.createConnection(process.env.DATABASE_URL)
try {
  const [[record]] = await db.query(
    'SELECT status,credit_consumed,failure_code,output_json FROM assessments WHERE id=?',[id])
  const after = await call('/me/credits', 'GET', session)
  assert.equal(record.status, 'succeeded', 'assessment failure: ' + record.failure_code)
  assert.equal(Number(record.credit_consumed),1)
  assert.equal(Number(after.account.settledBalance),beforeBalance-1)
  assert.ok(betaCalls() > beforeCalls, 'new beta model was not called')
  const output = typeof record.output_json === 'string' ? JSON.parse(record.output_json) : record.output_json
  assert.equal(output.targetAssessments[0].tier,'insufficient_data')
  console.log('NEW_ACTIVE_MODEL_BETA_ASSESSMENT_SUCCEEDED_ONE_CREDIT_CONSUMED_PASS')
} finally { await db.end() }
