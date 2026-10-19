/** Only execute after manual backup/schema gate; never at API startup. */
import mysql from 'mysql2/promise'
import 'dotenv/config'
import { inspectProfileSchema, ENROLLMENT_YEAR_DDL, type ProfileColumn } from './profile-schema-contract.js'
async function upgrade() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('database_configuration_missing')
  const db = await mysql.createConnection(url)
  try {
    const [rows] = await db.query<mysql.RowDataPacket[]>(
      `SELECT column_name AS name, data_type AS dataType, is_nullable AS nullable
       FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='user_profiles'`)
    const state=inspectProfileSchema(rows as ProfileColumn[])
    if(state.ready){ console.log('user_profiles.enrollment_year present and compatible');return }
    if(!state.migrationNeeded)throw new Error('unexpected_profile_schema')
    await db.query(ENROLLMENT_YEAR_DDL)
    console.log('user_profiles.enrollment_year created; run db:check:profile and authenticated API acceptance')
  } finally { await db.end() }
}
upgrade().catch(()=>{console.error('Enrollment migration stopped. Inspect schema locally without exposing credentials.');process.exitCode=1})
