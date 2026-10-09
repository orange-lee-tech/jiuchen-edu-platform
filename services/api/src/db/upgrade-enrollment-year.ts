/** Only execute after manual backup/schema gate; never at API startup. */
import mysql from 'mysql2/promise'
import 'dotenv/config'
const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')
const db = await mysql.createConnection(url)
try {
  const [rows] = await db.query<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'user_profiles'
         AND column_name = 'enrollment_year' LIMIT 1`,
  )
  if (rows.length === 0) {
    await db.query('ALTER TABLE user_profiles ADD COLUMN enrollment_year INT NULL AFTER current_grade')
    console.log('user_profiles.enrollment_year created')
  } else console.log('user_profiles.enrollment_year present')
} finally { await db.end() }
