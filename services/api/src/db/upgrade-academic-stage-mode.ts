/** Run only against an explicitly selected database after backup and review. */
import mysql from 'mysql2/promise'
import 'dotenv/config'

async function upgrade() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('database_configuration_missing')
  const db = await mysql.createConnection(url)
  try {
    const [rows] = await db.query<mysql.RowDataPacket[]>(
      "SELECT DATA_TYPE AS dataType, COLUMN_TYPE AS columnType, IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='students' AND COLUMN_NAME='current_stage_mode'",
    )
    if (rows.length) {
      if (rows.length !== 1 || rows[0]?.dataType !== 'enum' || rows[0]?.columnType !== "enum('auto','manual')" || rows[0]?.nullable !== 'YES') throw new Error('unexpected_stage_mode_schema')
      console.log('current_stage_mode already present')
      return
    }
    await db.query("ALTER TABLE students ADD COLUMN current_stage_mode ENUM('auto','manual') NULL DEFAULT NULL AFTER current_stage")
    console.log('current_stage_mode added; legacy records remain unclassified')
  } finally { await db.end() }
}
upgrade().catch(() => { console.error('Academic stage mode migration stopped; inspect the schema without exposing credentials.'); process.exitCode = 1 })
