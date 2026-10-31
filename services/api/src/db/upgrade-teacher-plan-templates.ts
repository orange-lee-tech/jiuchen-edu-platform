import mysql from 'mysql2/promise'
import 'dotenv/config'

if (!process.env.DATABASE_URL) throw new Error('database_configuration_missing')
const db = await mysql.createConnection(process.env.DATABASE_URL)
try {
  for (const table of ['student_plans', 'plan_revisions']) {
    const [columns] = await db.query<mysql.RowDataPacket[]>('SELECT COLUMN_TYPE AS columnType FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=\'type\'', [table])
    if (!columns[0]) throw new Error('existing_plan_schema_missing')
    const previousType = String(columns[0].columnType)
    if (!previousType.includes("'custom'")) {
      // Extend the existing enum instead of reconstructing it and silently
      // dropping a value introduced by an earlier installation.
      if (!/^enum\((?:'[^']*',)*'[^']*'\)$/i.test(previousType)) throw new Error('existing_plan_type_not_enum')
      const nextType = previousType.slice(0,-1) + ",'custom')"
      await db.query(`ALTER TABLE ${table} MODIFY COLUMN type ${nextType} NOT NULL`)
    }
  }
  await db.query(`CREATE TABLE IF NOT EXISTS teacher_plan_templates (
    id varchar(36) NOT NULL PRIMARY KEY, teacher_id varchar(36) NOT NULL,
    name varchar(160) NOT NULL, stage_code varchar(32) NOT NULL,
    type enum('gpa','english','competition','research','internship','custom') NOT NULL,
    title varchar(160) NOT NULL, items_json json NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY teacher_plan_templates_owner (teacher_id,updated_at)
  ) ENGINE=InnoDB`)
  console.info('teacher_plan_templates_schema_ready')
} finally { await db.end() }
