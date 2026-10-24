import assert from 'node:assert/strict'
import mysql from 'mysql2/promise'
import { randomUUID } from 'node:crypto'
import type { AppEnv } from '../config/env.js'
import { pinDigest, sealKey } from '../services/admin-control-boxes.js'
import { listAssessmentKeys, readActiveAssessmentKey, switchAssessmentKey,
  disableAssessmentKey } from '../services/assessment-key-objects.js'
import { activateCreditPlan, createCreditPlan, disableCreditPlan, listCreditPlans,
  validatePlanCost } from '../services/credit-plans.js'
import { bindAdditionalIdentity, listMyIdentities, switchMyIdentity,
  unbindMyIdentity } from '../services/identity-roles.js'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')
const parsed = new URL(url)
if (!['localhost','127.0.0.1'].includes(parsed.hostname) ||
    !decodeURIComponent(parsed.pathname).endsWith('_ci')) {
  throw new Error('Refusing closed-loop verification outside local *_ci database')
}
const pool = mysql.createPool(url)
const adminA = '00000000-0000-4000-8000-000000000001'
const adminB = '00000000-0000-4000-8000-000000000002'
const masterKey = Buffer.alloc(32, 7).toString('base64')
try {
  const [indexes] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='internal_ids'")
  assert.ok(indexes.some(row => row.INDEX_NAME === 'internal_ids_user_type_unique'))
  assert.ok(!indexes.some(row => row.INDEX_NAME === 'internal_ids_user_id_unique'))
  const keyState = await listAssessmentKeys(pool)
  assert.equal(keyState.head.initialized, true)
  assert.equal(keyState.objects.length, 1)
  assert.ok(!JSON.stringify(keyState).includes('old-model-key'))
  const migrated = await readActiveAssessmentKey(pool, {
    ADMIN_AI_KEY_ENCRYPTION_KEY: masterKey,
    ASSESSMENT_AI_PROVIDER: 'openai-compatible',
    ASSESSMENT_AI_BASE_URL: 'https://api.example.com',
    ASSESSMENT_AI_MODEL: 'test-model',
  } as AppEnv)
  assert.equal(migrated.config?.apiKey, 'new-model-key')

  // The preceding legacy lockout gate intentionally leaves this disposable
  // control locked. Reset only that test lock before exercising the new model.
  await pool.query('UPDATE assessment_key_head SET failed_attempts=0,locked_until=NULL WHERE id=1')
  const keyId = randomUUID()
  const objectSalt = '22222222222222222222222222222222'
  await pool.query(
    `INSERT INTO assessment_key_objects
      (id,label,provider,api_base_url,model,encrypted_secret,creator_user_id,pin_salt,pin_hash,status)
     VALUES (?,?,?,?,?,?,?,?,?,'candidate')`,
    [keyId,'候选模型','openai-compatible','https://api.example.com','model-v2',
      sealKey('candidate-secret',masterKey),adminB,objectSalt,pinDigest('222222',objectSalt)],
  )
  await assert.rejects(() => switchAssessmentKey({ pool,actorId:adminA,id:keyId,
    expectedVersion:keyState.head.version,currentPin:'654321',targetPin:'000000' }))
  assert.equal((await listAssessmentKeys(pool)).head.activeObjectId,keyState.head.activeObjectId)
  const keySwitch = await switchAssessmentKey({ pool,actorId:adminA,id:keyId,
    expectedVersion:keyState.head.version,currentPin:'654321',targetPin:'222222' })
  assert.equal(keySwitch.activeObjectId,keyId)
  assert.equal((await readActiveAssessmentKey(pool,{ ADMIN_AI_KEY_ENCRYPTION_KEY:masterKey } as AppEnv))
    .config?.apiKey,'candidate-secret')
  await disableAssessmentKey({ pool,actorId:adminA,expectedVersion:keySwitch.version,currentPin:'222222' })
  assert.equal((await readActiveAssessmentKey(pool,{ ADMIN_AI_KEY_ENCRYPTION_KEY:masterKey } as AppEnv))
    .config,null)

  const plans = await listCreditPlans(pool)
  assert.equal(plans.head.initialized,true)
  const oldOrder = randomUUID()
  await pool.query('INSERT INTO payment_orders (id,user_id,out_trade_no,amount_fen,credit_amount) VALUES (?,?,?,?,?)',
    [oldOrder,adminA,'JCV-old-order',199,7])
  assert.throws(() => validatePlanCost({ JC000:2,JC001:1,JC002:5,JC003:10 },null,null))
  assert.throws(() => validatePlanCost({ JC000:100,JC001:1,JC002:5,JC003:10 },1,new Date()))
  const candidate = await createCreditPlan({ pool,actorId:adminB,data: {
    name:'固定价四档',note:'隔离验证',counts:{ JC000:2,JC001:1,JC002:5,JC003:10 },
    estimatedCostFen:1,costConfirmed:true,pin:'444444',
  } })
  assert.equal(candidate.active,false)
  const activated = await activateCreditPlan({ pool,actorId:adminA,id:candidate.id,
    expectedVersion:plans.head.version,currentPin:'333333',targetPin:'444444' })
  assert.equal(activated.activePlanId,candidate.id)
  const [oldRows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT amount_fen,credit_amount,sku_key,plan_id FROM payment_orders WHERE id=?',[oldOrder])
  assert.equal(Number(oldRows[0]!.amount_fen),199)
  assert.equal(Number(oldRows[0]!.credit_amount),7)
  assert.equal(oldRows[0]!.sku_key,null)
  assert.equal(oldRows[0]!.plan_id,null)
  await disableCreditPlan({ pool,actorId:adminA,expectedVersion:activated.version,currentPin:'444444' })
  assert.equal((await listCreditPlans(pool)).head.activePlanId,null)

  const identities = await listMyIdentities({ configured:true,pool } as any,adminA)
  assert.equal(identities.identities.filter(row=>row.type==='admin').length,1)
  const teacherId = randomUUID()
  await pool.query('INSERT INTO teachers (id) VALUES (?)',[teacherId])
  const identityId = randomUUID()
  await pool.query(`INSERT INTO internal_ids
    (id,business_id,type,claim_mode,status,entity_id) VALUES (?,?,'teacher','self','available',?)`,
    [identityId,'JCT-TEST-0001',teacherId])
  await bindAdditionalIdentity({configured:true,pool} as any,adminA,'JCT-TEST-0001')
  assert.equal((await listMyIdentities({configured:true,pool} as any,adminA)).identities.length,2)
  await switchMyIdentity({configured:true,pool} as any,adminA,'teacher')
  const [roles] = await pool.query<mysql.RowDataPacket[]>('SELECT role FROM users WHERE id=?',[adminA])
  assert.equal(roles[0]!.role,'teacher')
  await unbindMyIdentity({configured:true,pool} as any,adminA,identityId)
  const [afterUnbind] = await pool.query<mysql.RowDataPacket[]>('SELECT role FROM users WHERE id=?',[adminA])
  assert.equal(afterUnbind[0]!.role,'admin')
  const adminIdentity = identities.identities.find(row=>row.type==='admin')!
  await unbindMyIdentity({configured:true,pool} as any,adminA,adminIdentity.id)
  const last = await listMyIdentities({configured:true,pool} as any,adminB)
  await assert.rejects(() => unbindMyIdentity({configured:true,pool} as any,adminB,
    last.identities.find(row=>row.type==='admin')!.id))
  console.log('CLOSED_LOOP_MYSQL_GATE_PASS: repeatable migrations, key/plan switches, old order, dual identity, last admin')
} finally { await pool.end() }
