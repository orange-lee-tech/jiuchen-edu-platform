import mysql from 'mysql2/promise'
import 'dotenv/config'
if(!process.env.DATABASE_URL)throw new Error('database_configuration_missing')
const connection=await mysql.createConnection(process.env.DATABASE_URL)
try{
  await connection.query(`CREATE TABLE IF NOT EXISTS admin_credit_adjustments (
    ledger_entry_id varchar(36) NOT NULL PRIMARY KEY, actor_user_id varchar(36) NOT NULL,
    target_user_id varchar(36) NOT NULL, amount int NOT NULL, reason varchar(300) NOT NULL,
    balance_before int NOT NULL, balance_after int NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY admin_credit_adjustments_target(target_user_id,created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  console.info('ADMIN_CREDIT_ADJUSTMENTS_SCHEMA_READY')
}finally{await connection.end()}
