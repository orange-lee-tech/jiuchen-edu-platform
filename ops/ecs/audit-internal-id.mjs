#!/usr/bin/env node
// READ-ONLY production identity gate. Never prints credentials, user identifiers or the input ID.
// Usage: AUDIT_ID=<private input> /opt/jiuchen-api/runtime/node/bin/node audit-internal-id.mjs
import { createRequire } from 'node:module'
import { readFileSync, realpathSync } from 'node:fs'
import { basename, join } from 'node:path'

const api = '/opt/jiuchen-api/current/services/api'
const require = createRequire(join(api, 'package.json'))
const mysql = require('mysql2/promise')
const dotenv = require('dotenv')

function normalize(value) {
  const normalized = value.normalize('NFKC').trim().toUpperCase()
  const compact = normalized.replace(/[^A-Z0-9]/g, '')
  const match = compact.match(/^(JC[STA])([A-Z0-9]{4})([A-Z0-9]{4})$/)
  return match ? match.slice(1).join('-') : normalized
}

const release = basename(realpathSync('/opt/jiuchen-api/current'))
const compiled = readFileSync(join(api, 'dist/routes/identity.js'), 'utf8')
console.log('ACTIVE_RELEASE=' + release)
console.log('API_ADMIN_CLAIM=' + (
  compiled.includes("identity.claimMode !== 'self' || identity.type === 'admin'")
    ? 'OLD_BLOCKS_ALL_JCA'
    : compiled.includes("identity.type !== 'admin' && identity.claimMode !== 'self'") ||
      compiled.includes('classifyInternalIdClaim')
      ? 'NEW_SUPPORTS_AVAILABLE_JCA'
      : 'UNKNOWN_CHECK_SOURCE'
))

const env = dotenv.parse(readFileSync('/etc/jiuchen-api/production.env'))
if (!env.DATABASE_URL && !(env.DB_HOST && env.DB_USER && env.DB_PASSWORD && env.DB_NAME)) {
  throw new Error('DATABASE_CONFIGURATION_NOT_FOUND')
}
const options = env.DATABASE_URL
  ? { uri: env.DATABASE_URL }
  : { host: env.DB_HOST, port: Number(env.DB_PORT || 3306), database: env.DB_NAME,
      user: env.DB_USER, password: env.DB_PASSWORD }

const conn = await mysql.createConnection(options)
try {
  const [counts] = await conn.execute(
    "SELECT COALESCE(batch, '(unbatched)') AS batch, type, status, COUNT(*) AS count " +
    "FROM internal_ids WHERE batch IN ('dev-seed-v1','acceptance-20261008') " +
    "GROUP BY batch, type, status ORDER BY batch, type, status",
  )
  console.log('TEST_BATCH_COUNTS=' + JSON.stringify(counts))

  if (!process.env.AUDIT_ID) {
    console.log('LOOKUP=SKIPPED_SET_AUDIT_ID')
  } else {
    const key = normalize(process.env.AUDIT_ID)
    const [rows] = await conn.execute(
      "SELECT type, claim_mode AS claimMode, status, batch, " +
      "IF(user_id IS NULL, 0, 1) AS bound, " +
      "IF(entity_id IS NULL, 0, 1) AS hasEntity " +
      "FROM internal_ids WHERE business_id = ? LIMIT 1",
      [key],
    )
    if (rows.length === 0) {
      console.log('LOOKUP=NOT_FOUND_IN_CURRENT_PRODUCTION_DB')
    } else {
      const row = rows[0]
      console.log('LOOKUP=FOUND')
      console.log('TYPE=' + row.type)
      console.log('STATUS=' + row.status)
      console.log('CLAIM_MODE=' + row.claimMode)
      console.log('BOUND=' + Boolean(row.bound))
      console.log('HAS_ENTITY=' + Boolean(row.hasEntity))
      console.log('BATCH=' + (row.batch || '(none)'))
    }
  }
} finally {
  await conn.end()
}
