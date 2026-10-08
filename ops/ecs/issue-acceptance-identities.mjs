#!/usr/bin/env node
/**
 * One-off Jiuchen production acceptance IDs.
 * Explicit --create is required: creates at most one new available student ID
 * and one new available admin ID for the batch (safe to rerun).
 * Does not bind users or grant admin access.
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'

const api = '/opt/jiuchen-api/current/services/api'
const envFile = '/etc/jiuchen-api/production.env'
const batch = 'acceptance-20261008'

if (process.argv.length !== 3 || process.argv[2] !== '--create') {
  console.error('Refusing DB writes. Usage: node issue-acceptance-identities.mjs --create')
  process.exit(2)
}
if (!existsSync(join(api, 'dist/services/internal-identities.js'))) {
  console.error('Expected deployed internal-identities runtime is missing.')
  process.exit(2)
}
const require = createRequire(join(api, 'package.json'))
const dotenv = require('dotenv')
const loaded = dotenv.config({ path: envFile, override: true })
if (loaded.error) throw new Error('Cannot read root-only production env')
const { eq } = require('drizzle-orm')
const imp = async path => import(pathToFileURL(join(api, path)).href)
const [{ loadEnv }, { createDatabaseContext }, { createInternalIdentity }, { internalIds }] = await Promise.all([
  imp('dist/config/env.js'),
  imp('dist/db/client.js'),
  imp('dist/services/internal-identities.js'),
  imp('dist/db/schema.js'),
])
const database = createDatabaseContext(loadEnv(process.env))
if (!database.configured) throw new Error('Database configuration missing')
try {
  const existing = await database.db.select({
    type: internalIds.type,
    businessId: internalIds.businessId,
    status: internalIds.status,
  }).from(internalIds).where(eq(internalIds.batch, batch))
  const output = {}
  for (const type of ['student', 'admin']) {
    const previous = existing.find(row => row.type === type && row.status === 'available')
    if (previous) {
      output[type] = previous.businessId
      continue
    }
    const created = await createInternalIdentity(database, {
      type,
      batch,
      ...(type === 'student' ? { name: '测试学员-交付验收' } : {}),
    })
    output[type] = created.businessId
  }
  console.log('BATCH=' + batch)
  console.log('STUDENT_ID=' + output.student)
  console.log('ADMIN_ID=' + output.admin)
  console.log('ADMIN_SELF_CLAIM=false (bind through authenticated admin workspace)')
} finally {
  await database.pool.end()
}
