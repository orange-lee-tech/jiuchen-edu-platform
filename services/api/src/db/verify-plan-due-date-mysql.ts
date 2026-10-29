/** Synthetic, disposable MySQL 8 gate; never accepts a production database name/host. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import mysql from 'mysql2/promise'
import Fastify from 'fastify'
import { createDatabaseContext } from './client.js'
import { upgradePlanItemDueDate } from './upgrade-plan-item-due-date.js'
import { loadUpcomingTasks, registerClassroomWorkspaceRoutes } from '../routes/classroom-workspace.js'
import { registerReadOnlyWriteGuard } from '../services/read-only-context.js'
import { upcomingTaskWindow } from '../domain/plan-dates.js'
import type { AppEnv } from '../config/env.js'

const source = new URL(process.env.DATABASE_URL || '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(source.hostname), 'isolated_loopback_required')
assert.equal(source.pathname, '/jiuchen_plan_due_date_ci', 'isolated_database_required')
const bootstrap = new URL(source); bootstrap.pathname = '/'
const admin = await mysql.createConnection(bootstrap.toString())
try { await admin.query('CREATE DATABASE IF NOT EXISTS jiuchen_plan_due_date_ci CHARACTER SET utf8mb4') }
finally { await admin.end() }
const db = await mysql.createConnection(source.toString())
let database: ReturnType<typeof createDatabaseContext> | undefined
const app = Fastify()
try {
  const [version] = await db.query<mysql.RowDataPacket[]>('SELECT VERSION() AS version')
  assert.match(String(version[0]?.version), /^8\./)
  const [tables] = await db.query<mysql.RowDataPacket[]>('SHOW TABLES')
  assert.equal(tables.length, 0, 'fixture_database_must_be_empty')
  for (const ddl of [
    "CREATE TABLE users (id VARCHAR(36) PRIMARY KEY, role VARCHAR(16), status VARCHAR(16) DEFAULT 'active', display_name VARCHAR(80))",
    'CREATE TABLE user_sessions (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36), token_hash VARCHAR(64), expires_at TIMESTAMP, revoked_at TIMESTAMP NULL)',
    'CREATE TABLE internal_ids (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36), type VARCHAR(16), status VARCHAR(16))',
    'CREATE TABLE students (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36), name VARCHAR(80), university VARCHAR(160), major VARCHAR(160), current_stage VARCHAR(32))',
    "CREATE TABLE teachers (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36), name VARCHAR(80) NOT NULL, title VARCHAR(120), bio VARCHAR(500), status ENUM('active','inactive') NOT NULL DEFAULT 'active')",
    'CREATE TABLE student_teacher_assignments (id VARCHAR(36) PRIMARY KEY, teacher_id VARCHAR(36), student_id VARCHAR(36), relationship VARCHAR(16), stage_code VARCHAR(32), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE coaching_records (id VARCHAR(36) PRIMARY KEY, student_id VARCHAR(36), teacher_id VARCHAR(36), stage_code VARCHAR(32), title VARCHAR(160), content TEXT, occurred_at TIMESTAMP)',
    "CREATE TABLE student_plans (id VARCHAR(36) PRIMARY KEY, student_id VARCHAR(36), stage_code VARCHAR(32), type ENUM('gpa','english','competition','research','internship'), title VARCHAR(160), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, FOREIGN KEY (student_id) REFERENCES students(id))",
    "CREATE TABLE plan_items (id VARCHAR(36) PRIMARY KEY, plan_id VARCHAR(36), sort_order INT DEFAULT 0, name VARCHAR(160), target VARCHAR(255), status ENUM('pending','in_progress','done') NOT NULL DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, FOREIGN KEY (plan_id) REFERENCES student_plans(id))",
    "CREATE TABLE plan_revisions (id VARCHAR(36) PRIMARY KEY, student_id VARCHAR(36), stage_code VARCHAR(32), type VARCHAR(32), title VARCHAR(160), status VARCHAR(16), review_note VARCHAR(500), reviewed_by_user_id VARCHAR(36), reviewed_at TIMESTAMP NULL)",
  ]) await db.query(ddl)
  for (const [userId, role] of [['u1', 'student'], ['u2', 'student'], ['t1', 'teacher'], ['t2', 'teacher']]) {
    await db.query('INSERT INTO users(id,role,display_name) VALUES (?,?,?)', [userId, role, '合成测试账号'])
    await db.query('INSERT INTO user_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,?)',
      [userId, userId, createHash('sha256').update(`synthetic-${userId}`).digest('hex'), new Date(Date.now() + 3600000)])
  }
  await db.query("INSERT INTO students VALUES ('s1','u1','合成甲',NULL,NULL,'freshman-fall'),('s2','u2','合成乙',NULL,NULL,'senior-fall')")
  await db.query("INSERT INTO teachers(id,user_id,name) VALUES ('t1','t1','合成导师'),('t2','t2','合成导师乙')")
  await db.query("INSERT INTO student_teacher_assignments(id,teacher_id,student_id) VALUES ('a1','t1','s1')")
  await db.query("INSERT INTO student_plans(id,student_id,stage_code,type,title) VALUES ('legacy','s1','freshman-fall','gpa','历史计划')")
  await db.query("INSERT INTO plan_items(id,plan_id,name,target) VALUES ('legacy','legacy','历史任务','2026-10-29 仅为自由文本')")
  const [before] = await db.query('SELECT * FROM plan_items ORDER BY id')
  await upgradePlanItemDueDate(db)
  console.log('PASS=upgrade-plan-item-due-date run=1')
  const [initial] = await db.query<mysql.RowDataPacket[]>('SELECT * FROM plan_items ORDER BY id')
  assert.equal(initial[0]?.due_date, null, 'old_target_text_is_not_a_deadline')
  assert.deepEqual(initial.map(({ due_date: _date, ...row }) => row), before)
  await db.query("UPDATE plan_items SET due_date='2028-02-29', updated_at=updated_at WHERE id='legacy'")
  await upgradePlanItemDueDate(db)
  console.log('PASS=upgrade-plan-item-due-date run=2')
  const [after] = await db.query<mysql.RowDataPacket[]>('SELECT * FROM plan_items ORDER BY id')
  assert.deepEqual(after.map(({ due_date: _date, ...row }) => row), before, 'legacy_fields_unchanged')
  const [columns] = await db.query<mysql.RowDataPacket[]>("SELECT DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='plan_items' AND COLUMN_NAME='due_date'")
  assert.deepEqual({ ...columns[0] }, { DATA_TYPE: 'date', IS_NULLABLE: 'YES', COLUMN_DEFAULT: null })
  const [dates] = await db.query<mysql.RowDataPacket[]>("SELECT CAST(due_date AS CHAR) AS date FROM plan_items WHERE id='legacy'")
  assert.equal(dates[0]?.date, '2028-02-29', 'repeat_migration_keeps_new_dates')
  await db.query("UPDATE plan_items SET due_date=NULL, updated_at=updated_at WHERE id='legacy'")
  // These are the real API routes, session checks and SQL transactions.
  database = createDatabaseContext({ DATABASE_URL: source.toString() } as AppEnv)
  assert.ok(database.configured)
  registerReadOnlyWriteGuard(app)
  registerClassroomWorkspaceRoutes(app, database, {} as AppEnv)
  const headers = (user: string) => ({ authorization: `Bearer synthetic-${user}` })
  const put = (user: string, url: string, items: unknown[]) => app.inject({ method: 'PUT', url, headers: headers(user), payload: { title: '合成规划', items } })
  const url = '/me/classroom/plans/sophomore-fall/english'
  const window = upcomingTaskWindow()
  const tomorrow = new Date(Date.parse(`${window.from}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
  const outside = new Date(Date.parse(`${window.from}T00:00:00Z`) + 3 * 86400000).toISOString().slice(0, 10)
  const yesterday = new Date(Date.parse(`${window.from}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
  const items = [
    { name: '后天', dueDate: window.to, status: 'pending' },
    { name: '今天', target: '自由文本保持不变', dueDate: window.from, status: 'pending' },
    { name: '明天', dueDate: tomorrow, status: 'in_progress' },
    { name: '已完成', dueDate: window.from, status: 'done' },
    { name: '未设日期', target: window.from }, { name: '超出范围', dueDate: outside }, { name: '已过期', dueDate: yesterday },
  ]
  assert.equal((await put('u1', url, items)).statusCode, 200)
  assert.equal((await put('u2', url, [{ name: '他人任务', dueDate: window.from }])).statusCode, 200)
  const read = await app.inject({ url: '/me/classroom?stage=sophomore-fall', headers: headers('u1') })
  assert.equal(read.statusCode, 200)
  const stored = read.json().plans.find((p: { type: string }) => p.type === 'english')
  assert.equal(stored.items[1].dueDate, window.from)
  assert.equal(stored.items[1].target, '自由文本保持不变')
  assert.equal(stored.items[4].dueDate, null)
  const recent = await app.inject({ url: '/me/classroom/upcoming-tasks?studentId=s2', headers: headers('u1') })
  assert.equal(recent.statusCode, 200)
  assert.deepEqual(recent.json().tasks.map((t: { name: string }) => t.name), ['今天', '明天', '后天'])
  assert.ok(recent.json().tasks.every((t: { stageCode: string; type: string }) => t.stageCode === 'sophomore-fall' && t.type === 'english'))
  assert.equal((await app.inject({ url: '/me/classroom/upcoming-tasks' })).statusCode, 401)
  assert.equal((await app.inject({ url: '/me/classroom/upcoming-tasks', headers: headers('t1') })).statusCode, 403)
  assert.equal((await put('u1', url, [{ name: '坏日期', dueDate: '2026-02-29' }])).statusCode, 400)
  assert.equal((await put('t2', '/me/teacher/students/s1/plans/sophomore-fall/english', [])).statusCode, 403)
  assert.equal((await put('u2', '/me/teacher/students/s1/plans/sophomore-fall/english', [])).statusCode, 403)
  assert.equal((await app.inject({ method: 'PUT', url, headers: { ...headers('u1'), 'x-jiuchen-read-only-target': 'student:s1' }, payload: { title: '禁止', items: [] } })).statusCode, 403)
  assert.equal((await put('t1', '/me/teacher/students/s1/plans/sophomore-fall/english', [{ name: '老师更新', dueDate: null }])).statusCode, 200)
  assert.equal((await app.inject({ url: '/me/classroom/upcoming-tasks', headers: headers('u1') })).json().tasks.length, 0)
  assert.equal((await put('u1', url, [{ name: '日期清除', target: '保留说明', dueDate: window.from }])).statusCode, 200)
  assert.equal((await put('u1', url, [{ name: '日期清除', target: '保留说明', dueDate: null }])).statusCode, 200)
  const clearedClassroom = await app.inject({ url: '/me/classroom?stage=sophomore-fall', headers: headers('u1') })
  const clearedPlan = clearedClassroom.json().plans.find((p: { type: string }) => p.type === 'english')
  assert.equal(clearedPlan.items[0].dueDate, null, 'date_can_be_cleared_through_api')
  assert.equal(clearedPlan.items[0].target, '保留说明', 'clearing_date_preserves_target')
  for (const stage of ['senior-fall', 'senior-winter', 'senior-spring']) {
    assert.equal((await put('u1', `/me/classroom/plans/${stage}/gpa`, [{ name: '不应保存', dueDate: window.from }])).statusCode, 400)
    assert.equal((await put('u1', `/me/classroom/plans/${stage}/internship`, [{ name: '实习', dueDate: window.from }])).statusCode, 200)
    const senior = (await app.inject({ url: `/me/classroom?stage=${stage}`, headers: headers('u1') })).json()
    assert.equal(senior.showGuidance, false)
    assert.deepEqual(senior.plans.map((p: { type: string }) => p.type), ['internship'])
    assert.deepEqual(senior.mentors, []); assert.deepEqual(senior.records, [])
  }
  // Fixed cross-year boundary verifies SQL DATE comparison independently of host timezone.
  assert.equal((await put('u1', url, [{ name: '跨年一', dueDate: '2026-12-31' }, { name: '跨年二', dueDate: '2027-01-02' }, { name: '越界', dueDate: '2027-01-03' }])).statusCode, 200)
  const boundary = await loadUpcomingTasks(database, 's1', new Date('2026-12-30T16:00:00Z'))
  assert.deepEqual(boundary.tasks.map(t => t.name), ['跨年一', '跨年二'])
  const [legacy] = await db.query<mysql.RowDataPacket[]>("SELECT target, due_date FROM plan_items WHERE id='legacy'")
  assert.equal(legacy[0]?.target, '2026-10-29 仅为自由文本'); assert.equal(legacy[0]?.due_date, null)
  console.log('PLAN_DUE_DATE_MYSQL_PASS dates=true ownership=true direct_save=true historical_data=true internship=true')
} finally { await app.close(); if (database?.configured) await database.pool.end(); await db.end() }
