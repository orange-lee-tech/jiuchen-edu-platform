import mysql from 'mysql2/promise'
import 'dotenv/config'

if (!process.env.DATABASE_URL) throw new Error('database_configuration_missing')
const db = await mysql.createConnection(process.env.DATABASE_URL)
try {
  await db.query(`CREATE TABLE IF NOT EXISTS teacher_todos (
    id varchar(36) NOT NULL PRIMARY KEY, teacher_id varchar(36) NOT NULL,
    title varchar(160) NOT NULL, description varchar(1000) NULL, due_date date NULL,
    status enum('pending','done') NOT NULL DEFAULT 'pending',
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY teacher_todos_owner (teacher_id,status,due_date)
  ) ENGINE=InnoDB`)
  console.info('teacher_todos_schema_ready')
} finally { await db.end() }
