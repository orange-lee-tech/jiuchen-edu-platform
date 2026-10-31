import mysql from 'mysql2/promise'
import 'dotenv/config'
if (!process.env.DATABASE_URL) throw new Error('database_configuration_missing')
const connection = await mysql.createConnection(process.env.DATABASE_URL)
try {
  await connection.query(`CREATE TABLE IF NOT EXISTS staff_profiles (
    user_id varchar(36) NOT NULL PRIMARY KEY, real_name varchar(80) NOT NULL,
    phone varchar(26) NULL, department varchar(120) NULL, supervisor varchar(80) NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  console.info('STAFF_PROFILES_SCHEMA_READY')
} finally { await connection.end() }
