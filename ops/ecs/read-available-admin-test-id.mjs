#!/usr/bin/env node
// Read-only one-time acceptance admin ID lookup. This prints a HIGH-PRIVILEGE
// enrollment credential only to the authorized local root terminal.
// Do not paste its output into chat, CI, logs or tickets.
import { createRequire } from 'node:module'
import { readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
if (process.getuid?.() !== 0) throw new Error('root_only')
if (process.argv.length !== 3 || process.argv[2] !== '--show-private') {
  throw new Error('Usage: node read-available-admin-test-id.mjs --show-private')
}
const api='/opt/jiuchen-api/current/services/api'
const require=createRequire(join(api,'package.json'))
const mysql=require('mysql2/promise')
const dotenv=require('dotenv')
const env=dotenv.parse(readFileSync('/etc/jiuchen-api/production.env'))
const dbOpts=env.DATABASE_URL
  ? {uri:env.DATABASE_URL}
  : {host:env.DB_HOST,port:Number(env.DB_PORT||3306),database:env.DB_NAME,user:env.DB_USER,password:env.DB_PASSWORD}
if(!env.DATABASE_URL && !(env.DB_HOST&&env.DB_USER&&env.DB_PASSWORD&&env.DB_NAME)){
 throw new Error('database_config_missing')
}
const connection=await mysql.createConnection(dbOpts)
try {
 const [rows]=await connection.execute(
  "SELECT business_id AS businessId FROM internal_ids "+
  "WHERE batch = ? AND type = 'admin' AND status = 'available' "+
  "AND user_id IS NULL LIMIT 1",
  ['acceptance-20261008'],
 )
 if (rows.length !== 1) {
  console.log('NO_AVAILABLE_ACCEPTANCE_ADMIN_ID')
  process.exitCode=2
 } else {
  console.log('PRIVATE_ADMIN_ENROLLMENT_CODE=' + rows[0].businessId)
  console.log('Use this code only with a logged-in unbound account after API rollout.')
  console.log('Do not share this output: it grants the first administrator role.')
 }
} finally {
 await connection.end()
}
