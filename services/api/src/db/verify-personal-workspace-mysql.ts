/** Disposable MySQL 8 rehearsal. Requires an empty loopback-only fixture database. */
import assert from 'node:assert/strict'
import mysql from 'mysql2/promise'
import { createDatabaseContext } from './client.js'
import { upgradePersonalWorkspace } from './upgrade-personal-workspace.js'
import { loadClassroom } from '../routes/classroom-workspace.js'
import { unbindMyIdentity } from '../services/identity-roles.js'
import type { AppEnv } from '../config/env.js'

if (!process.env.DATABASE_URL) throw new Error('isolated_database_configuration_required')
const source = new URL(process.env.DATABASE_URL)
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(source.hostname), 'isolated_loopback_required')
assert.equal(source.pathname, '/jiuchen_personal_workspace_ci', 'isolated_database_name_required')
const root = new URL(source)
root.pathname = '/'
const admin = await mysql.createConnection(root.toString())
try { await admin.query('CREATE DATABASE IF NOT EXISTS jiuchen_personal_workspace_ci CHARACTER SET utf8mb4') }
finally { await admin.end() }
const connection = await mysql.createConnection(source.toString())
let database: ReturnType<typeof createDatabaseContext> | undefined
try {
  const [version] = await connection.query<mysql.RowDataPacket[]>('SELECT VERSION() AS version')
  assert.match(String(version[0]?.version), /^8\./)
  const [before] = await connection.query<mysql.RowDataPacket[]>('SHOW TABLES')
  assert.equal(before.length, 0, 'fixture_database_must_be_empty')
  for (const ddl of [
    "CREATE TABLE users (id VARCHAR(36) PRIMARY KEY, role VARCHAR(16) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'active')",
    "CREATE TABLE user_profiles (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL UNIQUE, enrollment_year INT NULL, current_grade VARCHAR(40) NULL, FOREIGN KEY (user_id) REFERENCES users(id))",
    "CREATE TABLE students (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NULL UNIQUE, name VARCHAR(80) NOT NULL, university VARCHAR(160), major VARCHAR(160), current_stage VARCHAR(32), current_stage_mode ENUM('auto','manual') NULL, FOREIGN KEY (user_id) REFERENCES users(id))",
    "CREATE TABLE student_plans (id VARCHAR(36) PRIMARY KEY, student_id VARCHAR(36) NOT NULL, stage_code VARCHAR(32) NOT NULL, type ENUM('gpa','english','competition','research','internship','custom') NOT NULL, title VARCHAR(160) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, FOREIGN KEY (student_id) REFERENCES students(id))",
    "CREATE TABLE plan_items (id VARCHAR(36) PRIMARY KEY, plan_id VARCHAR(36) NOT NULL, sort_order INT NOT NULL DEFAULT 0, name VARCHAR(160) NOT NULL, target VARCHAR(255), due_date DATE NULL, status ENUM('pending','in_progress','done') NOT NULL DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, FOREIGN KEY (plan_id) REFERENCES student_plans(id))",
    "CREATE TABLE schedule_imports (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL, student_id VARCHAR(36) NULL, source_type ENUM('spreadsheet','image') NOT NULL, file_id VARCHAR(1000) NOT NULL, file_name VARCHAR(255) NOT NULL, status ENUM('uploaded','parsing','parsed','failed') NOT NULL DEFAULT 'uploaded', parsed_json JSON NULL, error_code VARCHAR(120), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)",
    "CREATE TABLE identity_admin_guard (id INT PRIMARY KEY)",
    "CREATE TABLE internal_ids (id VARCHAR(36) PRIMARY KEY, business_id VARCHAR(40), type VARCHAR(20), status VARCHAR(20), user_id VARCHAR(36), entity_id VARCHAR(36), claim_mode VARCHAR(20))",
    "CREATE TABLE identity_events (id VARCHAR(36) PRIMARY KEY, actor_user_id VARCHAR(36), identity_id VARCHAR(36), action VARCHAR(40), old_role VARCHAR(20), new_role VARCHAR(20))",
  ]) await connection.query(ddl)
  await connection.query("INSERT INTO users(id,role) VALUES ('owner-1','student'),('other-1','user')")
  await connection.query("INSERT INTO user_profiles(id,user_id) VALUES ('profile-1','owner-1')")
  await connection.query("INSERT INTO students(id,user_id,name,current_stage,current_stage_mode) VALUES ('student-1','owner-1','合成学员','senior-fall','auto')")
  await connection.query("INSERT INTO student_plans(id,student_id,stage_code,type,title) VALUES ('formal-plan','student-1','senior-fall','internship','正式计划')")
  await connection.query("INSERT INTO plan_items(id,plan_id,name,target,due_date,status) VALUES ('formal-task','formal-plan','正式任务','正式目标','2026-12-02','done')")
  await connection.query("INSERT INTO internal_ids(id,business_id,type,status,user_id,entity_id,claim_mode) VALUES ('identity-1','JC001','student','claimed','owner-1','student-1','self')")
  await connection.query('INSERT INTO identity_admin_guard(id) VALUES (1)')
  const [formalBefore] = await connection.query<mysql.RowDataPacket[]>(
    'SELECT id,student_id,stage_code,type,title FROM student_plans WHERE id=?', ['formal-plan'])

  await upgradePersonalWorkspace(connection)
  await upgradePersonalWorkspace(connection)
  const [formalAfter] = await connection.query<mysql.RowDataPacket[]>(
    'SELECT id,student_id,stage_code,type,title FROM student_plans WHERE id=?', ['formal-plan'])
  assert.deepEqual(formalAfter, formalBefore, 'legacy formal plan stays byte-for-byte at its business columns')
  const [backfill] = await connection.query<mysql.RowDataPacket[]>(
    'SELECT current_stage AS stage,current_stage_mode AS mode FROM user_profiles WHERE user_id=?', ['owner-1'])
  assert.deepEqual({ stage: backfill[0]?.stage, mode: backfill[0]?.mode }, { stage: 'senior-fall', mode: 'auto' })
  await assert.rejects(connection.query(
    "INSERT INTO student_plans(id,student_id,owner_user_id,stage_code,type,title) VALUES ('bad-owner',NULL,'missing','senior-fall','internship','非法归属')"),
  )
  await connection.query("INSERT INTO student_plans(id,student_id,owner_user_id,stage_code,type,title) VALUES ('personal-plan',NULL,'owner-1','senior-fall','internship','账号计划')")
  await connection.query("INSERT INTO plan_items(id,plan_id,name,target,due_date,status) VALUES ('personal-task','personal-plan','账号任务','账号目标','2026-12-01','pending')")
  await connection.query("UPDATE user_profiles SET current_stage='senior-spring', current_stage_mode='manual' WHERE user_id='owner-1'")
  await connection.query("INSERT INTO schedule_imports(id,user_id,source_type,file_id,file_name,status) VALUES ('manual-import','owner-1','manual','','手动课表','parsed')")
  database = createDatabaseContext({ DATABASE_URL: source.toString() } as AppEnv)
  assert.ok(database.configured)
  const student = { id: 'student-1', name: '合成学员', university: null, major: null, currentStage: 'senior-fall' }
  const bound = await loadClassroom(database, student, 'senior-fall', 'owner-1', 'senior-spring')
  assert.equal(bound.currentStage, 'senior-spring', 'account stage remains primary')
  assert.deepEqual(bound.plans.find(plan => plan.type === 'internship')?.sources.map(source => source.title),
    ['账号计划', '正式计划'])
  await unbindMyIdentity(database, 'owner-1', 'identity-1')
  const unbound = await loadClassroom(database, null, 'senior-fall', 'owner-1', 'senior-spring')
  assert.deepEqual(unbound.plans.find(plan => plan.type === 'internship')?.sources.map(source => source.title).sort(),
    ['正式计划', '账号计划'].sort())
  const [retained] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT name,target,CAST(due_date AS CHAR) AS dueDate,status FROM plan_items WHERE plan_id='formal-plan'")
  assert.deepEqual({ name: retained[0]?.name, target: retained[0]?.target,
    dueDate: retained[0]?.dueDate, status: retained[0]?.status },
  { name: '正式任务', target: '正式目标', dueDate: '2026-12-02', status: 'done' })
  const [snapshot] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT pi.name,pi.target,CAST(pi.due_date AS CHAR) AS dueDate,pi.status FROM plan_items pi JOIN student_plans p ON p.id=pi.plan_id WHERE p.owner_user_id='owner-1' AND p.title='正式计划'")
  assert.deepEqual({ name: snapshot[0]?.name, target: snapshot[0]?.target,
    dueDate: snapshot[0]?.dueDate, status: snapshot[0]?.status },
  { name: '正式任务', target: '正式目标', dueDate: '2026-12-02', status: 'done' })
  await connection.query("INSERT INTO students(id,user_id,name,current_stage,current_stage_mode) VALUES ('foreign-student','other-1','他人学员','freshman-fall','manual')")
  await connection.query("INSERT INTO student_plans(id,student_id,stage_code,type,title) VALUES ('foreign-plan','foreign-student','freshman-fall','gpa','他人正式规划')")
  await connection.query("INSERT INTO plan_items(id,plan_id,name,target,due_date,status) VALUES ('foreign-task','foreign-plan','他人任务','不可复制','2026-12-03','pending')")
  await connection.query("INSERT INTO internal_ids(id,business_id,type,status,user_id,entity_id,claim_mode) VALUES ('identity-foreign','JC002','student','claimed','owner-1','foreign-student','self')")
  await assert.rejects(unbindMyIdentity(database, 'owner-1', 'identity-foreign'), /identity_entity_not_owned/)
  const [foreignStudent] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT user_id FROM students WHERE id='foreign-student'")
  assert.equal(foreignStudent[0]?.user_id, 'other-1', 'foreign student remains linked to its real owner')
  const [foreignIdentity] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT user_id,status FROM internal_ids WHERE id='identity-foreign'")
  assert.deepEqual({ userId: foreignIdentity[0]?.user_id, status: foreignIdentity[0]?.status },
    { userId: 'owner-1', status: 'claimed' }, 'failed unbind rolls back the inconsistent identity unchanged')
  const [foreignCopies] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT id FROM student_plans WHERE owner_user_id='owner-1' AND title='他人正式规划'")
  assert.equal(foreignCopies.length, 0, 'foreign formal plan is never copied into the account')
  console.log('PERSONAL_WORKSPACE_MYSQL_PASS')
} finally {
  if (database?.configured) await database.pool.end()
  await connection.end()
}
