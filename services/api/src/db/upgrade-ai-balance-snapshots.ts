import mysql from 'mysql2/promise'
import 'dotenv/config'

if (!process.env.DATABASE_URL) throw new Error('database_configuration_missing')
const db = await mysql.createConnection(process.env.DATABASE_URL)
try {
  await db.query(`CREATE TABLE IF NOT EXISTS ai_balance_snapshots (
    id varchar(36) NOT NULL PRIMARY KEY, object_id varchar(36) NOT NULL,
    provider varchar(120) NOT NULL, currency varchar(3) NOT NULL,
    balance decimal(18,6) NOT NULL, warning_threshold decimal(18,6) NOT NULL,
    verified_at timestamp NOT NULL, actor_user_id varchar(36) NOT NULL,
    note varchar(500) NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY ai_balance_snapshots_account (object_id,verified_at)
  ) ENGINE=InnoDB`)
  console.info('ai_balance_snapshots_schema_ready')
} finally { await db.end() }
