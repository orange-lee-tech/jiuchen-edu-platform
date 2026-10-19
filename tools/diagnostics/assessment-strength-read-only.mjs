// Run from /opt/jiuchen-api/current/services/api with the existing production env.
// Read-only aggregate of persisted assessments. Never prints input/output text or IDs.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const require = createRequire(resolve('package.json'))
const mysql = require('mysql2/promise')
const fingerprint = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 12)
const parseJson = value => {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return value
  try { return JSON.parse(String(value)) } catch { return null }
}
const count = value => Array.isArray(value) ? value.length : null
const nonempty = value => typeof value === 'string' && value.trim().length > 0
const env = process.env
const sampleLimit = 100
let connection
const report = {
  mode: 'READ_ONLY', checkedAt: new Date().toISOString(), sampleLimit,
  note: 'Only persisted output is available; raw provider output before validation or evidence sanitization is not stored here.',
}

try {
  connection = await mysql.createConnection(env.DATABASE_URL
    ? { uri: env.DATABASE_URL, dateStrings: true, connectTimeout: 10000 }
    : { host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER,
        password: env.DB_PASSWORD, database: env.DB_NAME, dateStrings: true, connectTimeout: 10000 })
  await connection.query('START TRANSACTION READ ONLY')
  const [rows] = await connection.query(`SELECT id, completed_at AS completedAt,
      input_json AS inputJson, output_json AS outputJson, evidence_json AS evidenceJson
    FROM assessments WHERE status='succeeded'
    ORDER BY completed_at DESC LIMIT ?`, [sampleLimit])
  const inspected = rows.map(row => {
    const input = parseJson(row.inputJson)
    const output = parseJson(row.outputJson)
    const evidence = parseJson(row.evidenceJson)
    return {
      sampleKey: fingerprint(row.id), completedAt: row.completedAt,
      strengths: count(output?.strengths), risks: count(output?.risks),
      targets: count(output?.targetAssessments), evidence: count(evidence),
      inputSignals: {
        gpa: nonempty(input?.profile?.gpaText), rank: nonempty(input?.profile?.rankText),
        english: Boolean(count(input?.english)), research: Boolean(count(input?.research)),
        competitions: Boolean(count(input?.competitions)),
      },
    }
  })
  report.summary = {
    succeededInspected: inspected.length,
    emptyStrengths: inspected.filter(row => row.strengths === 0).length,
    malformedStrengths: inspected.filter(row => row.strengths === null).length,
    emptyWithInputSignals: inspected.filter(row => row.strengths === 0 &&
      Object.values(row.inputSignals).some(Boolean)).length,
  }
  report.emptyStrengthSamples = inspected.filter(row => row.strengths === 0).slice(0, 20)
  await connection.query('COMMIT')
} catch (error) {
  report.failure = /^[A-Z0-9_]+$/.test(String(error?.code || ''))
    ? error.code : 'ASSESSMENT_STRENGTH_READ_ONLY_FAILED'
  process.exitCode = 1
} finally {
  if (connection) await connection.end()
}
console.log(JSON.stringify(report, null, 2))
