/** Explicit additive upgrade; never runs at API startup or against production automatically. */
import mysql from 'mysql2/promise'
import 'dotenv/config'

export async function upgradePersonalWorkspace(db: mysql.Connection) {
  const columns = async (table: string) => {
    const [rows] = await db.query<mysql.RowDataPacket[]>(
      'SELECT COLUMN_NAME AS name, IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [table])
    return rows
  }
  const profile = await columns('user_profiles')
  const plans = await columns('student_plans')
  const imports = await columns('schedule_imports')
  if (!profile.length || !plans.length || !imports.length) throw new Error('personal_workspace_base_tables_missing')
  if (!profile.some(row => row.name === 'current_stage'))
    await db.query('ALTER TABLE user_profiles ADD COLUMN current_stage VARCHAR(32) NULL')
  if (!profile.some(row => row.name === 'current_stage_mode'))
    await db.query("ALTER TABLE user_profiles ADD COLUMN current_stage_mode ENUM('auto','manual') NULL")
  if (!plans.some(row => row.name === 'owner_user_id'))
    await db.query('ALTER TABLE student_plans ADD COLUMN owner_user_id VARCHAR(36) NULL')
  const [ownerIndexes] = await db.query<mysql.RowDataPacket[]>(
    "SELECT INDEX_NAME AS name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student_plans' AND INDEX_NAME='student_plans_owner_stage_type_idx' LIMIT 1",
  )
  if (!ownerIndexes.length)
    await db.query('ALTER TABLE student_plans ADD INDEX student_plans_owner_stage_type_idx (owner_user_id,stage_code,type)')
  const [ownerKeys] = await db.query<mysql.RowDataPacket[]>(
    "SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student_plans' AND COLUMN_NAME='owner_user_id' AND REFERENCED_TABLE_NAME='users' LIMIT 1",
  )
  if (!ownerKeys.length)
    await db.query('ALTER TABLE student_plans ADD CONSTRAINT student_plans_owner_user_id_fk FOREIGN KEY (owner_user_id) REFERENCES users(id)')
  const studentId = plans.find(row => row.name === 'student_id')
  if (!studentId) throw new Error('student_plans_student_id_missing')
  if (studentId.nullable === 'NO') await db.query('ALTER TABLE student_plans MODIFY COLUMN student_id VARCHAR(36) NULL')
  const [sourceColumns] = await db.query<mysql.RowDataPacket[]>(
    "SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='schedule_imports' AND COLUMN_NAME='source_type'",
  )
  if (!String(sourceColumns[0]?.type ?? '').includes("'manual'"))
    await db.query("ALTER TABLE schedule_imports MODIFY COLUMN source_type ENUM('spreadsheet','image','manual') NOT NULL")
  await db.query(`INSERT INTO user_profiles (id,user_id,current_stage,current_stage_mode)
    SELECT UUID(),s.user_id,s.current_stage,s.current_stage_mode FROM students s
    WHERE s.user_id IS NOT NULL
    ON DUPLICATE KEY UPDATE current_stage=COALESCE(user_profiles.current_stage,VALUES(current_stage)),
      current_stage_mode=COALESCE(user_profiles.current_stage_mode,VALUES(current_stage_mode))`)
}

if (process.argv[1]?.replace(/\\/g, '/').match(/\/upgrade-personal-workspace\.(ts|js)$/)) {
  const run = async () => {
    if (!process.env.DATABASE_URL) throw new Error('database_configuration_missing')
    const db = await mysql.createConnection(process.env.DATABASE_URL)
    try { await upgradePersonalWorkspace(db); console.log('PERSONAL_WORKSPACE_UPGRADE_PASS') }
    finally { await db.end() }
  }
  run().catch(() => { console.error('Personal workspace upgrade stopped; inspect schema without exposing credentials.'); process.exitCode = 1 })
}
