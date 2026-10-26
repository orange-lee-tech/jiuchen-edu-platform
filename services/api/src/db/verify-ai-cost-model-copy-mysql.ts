import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import type { AppEnv } from '../config/env.js'
import { pinDigest, sealKey } from '../services/admin-control-boxes.js'
import { copyAssessmentKeyForModel, listAssessmentKeys, readActiveAssessmentKey } from '../services/assessment-key-objects.js'
import { DEEPSEEK_PRICE_SOURCE, recordAssessmentModelCall, reviewDeepseekPrice,
  reviewExchangeRate } from '../services/assessment-ai-cost.js'
import { readAdminAssessmentAiCosts } from '../services/assessment-ai-cost-summary.js'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')
const target = new URL(url)
if (!['localhost', '127.0.0.1'].includes(target.hostname) ||
    !decodeURIComponent(target.pathname).endsWith('_ci')) {
  throw new Error('Refusing migration verification outside local *_ci database')
}
const pool = mysql.createPool(url)
const admin = '00000000-0000-4000-8000-000000000002'
const masterKey = Buffer.alloc(32, 7).toString('base64')
const stableRows = async (sql: string) => {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(sql)
  return JSON.parse(JSON.stringify(rows)) as unknown
}
const migrate = (file: string) => {
  const migration = fileURLToPath(new URL(`./${file}.js`, import.meta.url))
  execFileSync(process.execPath, [migration], { env: process.env, timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'] })
}
const tables = ['assessment_ai_calls', 'assessment_ai_price_versions',
  'assessment_ai_fx_versions', 'assessment_ai_price_heads',
  'assessment_ai_price_source_checks', 'assessment_ai_cost_audit']

try {
  const [foundation] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='assessments'")
  assert.equal(foundation.length, 1, 'run the existing assessment foundation migration first')
  const [headRows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT initialized,version FROM assessment_key_head WHERE id=1')
  assert.equal(Number(headRows[0]?.initialized), 1)

  // Only synthetic CI rows. A known control PIN lets the real copy service run
  // without depending on another gate's final PIN value.
  const headSalt = '11111111111111111111111111111111'
  await pool.query(`UPDATE assessment_key_head SET pin_salt=?,pin_hash=?,
    failed_attempts=0,locked_until=NULL WHERE id=1`,
  [headSalt, pinDigest('111111', headSalt)])
  const sourceId = randomUUID()
  const sourceSalt = '22222222222222222222222222222222'
  await pool.query(`INSERT INTO assessment_key_objects
    (id,label,provider,api_base_url,model,encrypted_secret,creator_user_id,
     pin_salt,pin_hash,status,version)
    VALUES (?,'CI source','deepseek','https://api.deepseek.com','fixture-model-v1',
      ?,?, ?,?,'candidate',4)`,
  [sourceId, sealKey('ci-fixture-key', masterKey), admin,
    sourceSalt, pinDigest('222222', sourceSalt)])
  const keysBefore = await stableRows(`SELECT id,encrypted_secret,pin_salt,pin_hash,
    version,status,failed_attempts,locked_until,updated_at
    FROM assessment_key_objects ORDER BY id`)
  const headBefore = await stableRows(`SELECT active_object_id,version,pin_salt,pin_hash,
    failed_attempts,locked_until,initialized FROM assessment_key_head WHERE id=1`)
  const historicalBefore = await stableRows(`SELECT id,user_id,status FROM assessments ORDER BY id`)

  for (const file of ['upgrade-assessment-ai-cost', 'upgrade-assessment-key-model-copy']) {
    for (let run = 1; run <= 2; run++) {
      migrate(file)
      console.info(`PASS=${file} run=${run}`)
    }
  }
  assert.deepEqual(await stableRows(`SELECT id,encrypted_secret,pin_salt,pin_hash,
    version,status,failed_attempts,locked_until,updated_at
    FROM assessment_key_objects ORDER BY id`), keysBefore)
  assert.deepEqual(await stableRows(`SELECT active_object_id,version,pin_salt,pin_hash,
    failed_attempts,locked_until,initialized FROM assessment_key_head WHERE id=1`), headBefore)
  assert.deepEqual(await stableRows(`SELECT id,user_id,status FROM assessments ORDER BY id`), historicalBefore)

  const [columns] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME,IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='assessment_key_objects'
       AND COLUMN_NAME='source_object_id'`)
  assert.equal(columns.length, 1)
  assert.equal(columns[0]?.IS_NULLABLE, 'YES')
  const [createdTables] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?)`, [tables])
  assert.deepEqual(createdTables.map(row => row.TABLE_NAME).sort(), [...tables].sort())
  const [indexes] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?)`,
    [[...tables, 'assessment_key_objects']])
  for (const [table, name] of [
    ['assessment_key_objects', 'assessment_key_objects_source'],
    ['assessment_ai_calls', 'assessment_ai_calls_assessment'],
    ['assessment_ai_calls', 'assessment_ai_calls_model'],
    ['assessment_ai_price_versions', 'assessment_ai_price_lookup'],
    ['assessment_ai_fx_versions', 'assessment_ai_fx_lookup'],
    ['assessment_ai_price_source_checks', 'assessment_ai_price_source_recent'],
    ['assessment_ai_cost_audit', 'assessment_ai_cost_audit_version'],
  ]) assert.ok(indexes.some(row => row.TABLE_NAME === table && row.INDEX_NAME === name), name)
  for (const table of tables) {
    assert.ok(indexes.some(row => row.TABLE_NAME === table && row.INDEX_NAME === 'PRIMARY' &&
      Number(row.NON_UNIQUE) === 0), `${table} primary key`)
  }
  const [foreignKeys] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('assessment_key_objects','assessment_ai_calls')
       AND REFERENCED_TABLE_NAME IS NOT NULL`)
  assert.ok(foreignKeys.some(row => row.TABLE_NAME === 'assessment_key_objects' &&
    row.COLUMN_NAME === 'source_object_id' && row.REFERENCED_TABLE_NAME === 'assessment_key_objects'))
  assert.ok(foreignKeys.some(row => row.TABLE_NAME === 'assessment_ai_calls' &&
    row.COLUMN_NAME === 'assessment_id' && row.REFERENCED_TABLE_NAME === 'assessments'))

  const beforeCopy = await listAssessmentKeys(pool)
  assert.equal(beforeCopy.head.version, Number(headRows[0]?.version))
  const copied = await copyAssessmentKeyForModel({ pool, actorId: admin, sourceId,
    expectedVersion: beforeCopy.head.version, currentPin: '111111', sourcePin: '222222',
    newPin: '333333', label: 'CI candidate', model: 'fixture-model-v2', note: 'CI only',
    validateUrl: async value => value })
  const [objects] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT id,provider,api_base_url,model,encrypted_secret,pin_hash,status,version,
       source_object_id,last_test_result,last_test_at FROM assessment_key_objects
     WHERE id IN (?,?) ORDER BY id`, [sourceId, copied.id])
  const source = objects.find(row => row.id === sourceId)
  const candidate = objects.find(row => row.id === copied.id)
  assert.ok(source && candidate)
  assert.equal(candidate.encrypted_secret, source.encrypted_secret)
  assert.equal(candidate.provider, source.provider)
  assert.equal(candidate.api_base_url, source.api_base_url)
  assert.equal(candidate.model, 'fixture-model-v2')
  assert.notEqual(candidate.pin_hash, source.pin_hash)
  assert.equal(candidate.status, 'candidate')
  assert.equal(Number(candidate.version), 1)
  assert.equal(candidate.source_object_id, sourceId)
  assert.equal(candidate.last_test_result, null)
  assert.equal(candidate.last_test_at, null)
  assert.equal(Number(source.version), 4)
  assert.equal((await listAssessmentKeys(pool)).head.version, beforeCopy.head.version)
  assert.equal((await readActiveAssessmentKey(pool,
    { ADMIN_AI_KEY_ENCRYPTION_KEY: masterKey } as AppEnv)).objectId,
  beforeCopy.head.activeObjectId)
  await assert.rejects(pool.query(`UPDATE assessment_key_objects
    SET source_object_id='00000000-0000-4000-8000-00000000ffff' WHERE id=?`, [copied.id]),
  { code: 'ER_NO_REFERENCED_ROW_2' })

  const assessmentId = randomUUID()
  await pool.query(`INSERT INTO assessments
    (id,user_id,status,input_schema_version,output_schema_version,agent_version,input_json)
    VALUES (?,?,'running','ci-input','ci-output','ci-agent','{}')`, [assessmentId, admin])
  const callId = randomUUID()
  const identity = { provider: 'deepseek', model: 'fixture-model-v2',
    objectId: copied.id, version: 1 }
  await recordAssessmentModelCall(pool, assessmentId,
    { callId, phase: 'initial', requestCount: 1, outcome: 'started' }, identity)
  await recordAssessmentModelCall(pool, assessmentId,
    { callId, phase: 'initial', requestCount: 1, outcome: 'completed', promptChars: 900,
      outputBudget: 1200, usage: { promptTokens: 300, completionTokens: 100,
        cacheHitTokens: 20, cacheMissTokens: 280, reasoningTokens: 40 } }, identity)
  await recordAssessmentModelCall(pool, assessmentId,
    { callId, phase: 'initial', requestCount: 1, outcome: 'started' }, identity)
  const [calls] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT * FROM assessment_ai_calls WHERE assessment_id=?', [assessmentId])
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.outcome, 'completed')
  assert.equal(calls[0]?.usage_state, 'returned')
  assert.equal(Number(calls[0]?.prompt_tokens), 300)
  assert.equal(Number(calls[0]?.cache_hit_tokens), 20)
  await assert.rejects(pool.query(`INSERT INTO assessment_ai_calls
    (id,assessment_id,phase,request_index,provider,model)
    VALUES (?,'00000000-0000-4000-8000-00000000ffff','initial',1,'deepseek','fixture')`,
  [randomUUID()]), { code: 'ER_NO_REFERENCED_ROW_2' })

  await pool.query(`INSERT INTO assessment_ai_price_source_checks
    (id,source_url,source_sha256) VALUES (?,?,?)`,
  [randomUUID(), DEEPSEEK_PRICE_SOURCE, 'a'.repeat(64)])
  const price = await reviewDeepseekPrice({ pool, actorId: admin,
    model: 'fixture-model-v2', expectedLatestVersion: null,
    inputCacheHitPerMillion: 0.1, inputCacheMissPerMillion: 1,
    outputPerMillion: 2, peakInputCacheMissPerMillion: 2,
    peakOutputPerMillion: 4, peakWindowUtc: '00:00-01:00',
    effectiveAt: new Date('2020-01-01T00:00:00.000Z'), reviewNote: 'synthetic CI price' })
  const fx = await reviewExchangeRate({ pool, actorId: admin, rate: 7,
    sourceUrl: 'https://example.test/ci-fx', observedAt: new Date(),
    reviewNote: 'synthetic CI exchange rate' })
  const [priceRows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT latest_version FROM assessment_ai_price_heads WHERE provider=? AND model=?',
    ['deepseek', 'fixture-model-v2'])
  assert.equal(priceRows[0]?.latest_version, price.version)
  const [fxRows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT rate FROM assessment_ai_fx_versions WHERE id=?', [fx.version])
  assert.equal(Number(fxRows[0]?.rate), 7)
  const [audits] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT action FROM assessment_ai_cost_audit WHERE version_id IN (?,?) ORDER BY action`,
    [price.version, fx.version])
  assert.deepEqual(audits.map(row => row.action), ['review_fx', 'review_price'])
  const adminCosts = await readAdminAssessmentAiCosts(pool)
  assert.equal(adminCosts.usage.calls, 1)
  assert.equal(adminCosts.usage.usageReturned, 1)
  assert.equal(adminCosts.actualSupplierCharge, 'not_connected')
  assert.ok(adminCosts.reviewedPrices.some(row => row.id === price.version))
  assert.equal(adminCosts.exchangeRate?.version, fx.version)
  console.info('AI_COST_MODEL_COPY_MYSQL_PASS historical_keys_preserved=true synthetic_data_only=true')
} finally {
  await pool.end()
}
