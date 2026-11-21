import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import { planItems, scheduleImports, studentPlans, students, userSessions } from '../db/schema.js'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import { applyPersonalPlan, loadClassroom, registerClassroomWorkspaceRoutes } from './classroom-workspace.js'
import type { AppEnv } from '../config/env.js'

test('binding keeps personal and formal titles and tasks in one stage card', async () => {
  const stored = [
    { id: 'personal-plan', studentId: null, type: 'internship', title: '账号目标' },
    { id: 'formal-plan', studentId: 'student-1', type: 'internship', title: '预置学员目标' },
  ]
  const taskRows = [
    [{ id: 'personal-task', name: '账号任务', sortOrder: 0, target: '目标 A', dueDate: '2026-12-01', status: 'pending' }],
    [{ id: 'formal-task', name: '预置任务', sortOrder: 0, target: '目标 B', dueDate: '2026-12-02', status: 'done' }],
  ]
  let itemQuery = 0
  let ownerWhere: unknown
  const db = { configured: true, db: {
    select() { return { from(table: unknown) {
      const rows = table === studentPlans ? stored : table === planItems ? taskRows[itemQuery++] : []
      const chain = { where(condition: unknown) { if (table === studentPlans) ownerWhere = condition; return chain }, orderBy() { return Promise.resolve(rows) },
        then(resolve: (value: typeof rows) => unknown) { return Promise.resolve(rows).then(resolve) } }
      return chain
    } } },
  } } as unknown as Extract<DatabaseContext, { configured: true }>
  const view = await loadClassroom(db, {
    id: 'student-1', name: '测试学员', university: null, major: null, currentStage: 'senior-fall',
  }, 'senior-fall', 'owner-1', 'senior-fall')
  const card = view.plans.find(plan => plan.type === 'internship')
  assert.equal(view.currentStage, 'senior-fall')
  assert.equal(view.plans.filter(plan => plan.type === 'internship').length, 1)
  assert.deepEqual(card?.sources.map(source => [source.source, source.title, source.items[0]?.name]), [
    ['personal', '账号目标', '账号任务'], ['formal', '预置学员目标', '预置任务'],
  ])
  assert.equal(view.showGuidance, false)
  const query = new MySqlDialect().sqlToQuery(ownerWhere as any)
  assert.match(query.sql, /owner_user_id/)
  assert.match(query.sql, /student_id/)
  assert.ok(query.params.includes('owner-1'))
  assert.ok(query.params.includes('student-1'))
})

test('ordinary active role cannot resolve a linked formal student or guidance', async () => {
  const session = { userId: 'owner-1', role: 'user', status: 'active', internalIdStatus: null,
    expiresAt: new Date('2099-01-01') }
  const db = { configured: true, db: {
    select() { return { from(table: unknown) {
      if (table === students) throw new Error('ordinary role must not read the formal student')
      const rows = table === userSessions ? [session] : []
      const chain = { innerJoin() { return chain }, leftJoin() { return chain }, where() { return chain },
        async limit() { return rows }, then(resolve: (value: typeof rows) => unknown) { return Promise.resolve(rows).then(resolve) } }
      return chain
    } } },
  } } as unknown as DatabaseContext
  const app = Fastify()
  registerClassroomWorkspaceRoutes(app, db, {} as AppEnv)
  try {
    const result = await app.inject({ url: '/me/classroom?stage=senior-fall',
      headers: { authorization: 'Bearer synthetic-session' } })
    assert.equal(result.statusCode, 200)
    assert.equal(result.json().student, null)
    assert.equal(result.json().showGuidance, false)
  } finally { await app.close() }
})

test('account plan creation has a user owner and no synthetic student', async () => {
  const inserted: Array<{ table: unknown; values: any }> = []
  const tx = {
    execute: async () => [[{ id: 'owner-1' }]],
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    insert: (table: unknown) => ({ values: async (values: unknown) => { inserted.push({ table, values }) } }),
  }
  const db = { configured: true, db: { transaction: async (work: (transaction: any) => Promise<unknown>) => work(tx) } } as unknown as Extract<DatabaseContext, { configured: true }>
  const id = await applyPersonalPlan(db, 'owner-1', 'junior-fall', 'gpa', '我的成绩', [
    { name: '完成课程', target: '90 分', dueDate: '2026-12-01', status: 'pending' },
  ])
  assert.deepEqual(inserted.find(row => row.table === studentPlans)?.values, {
    id, studentId: null, ownerUserId: 'owner-1', stageCode: 'junior-fall', type: 'gpa', title: '我的成绩',
  })
  assert.equal(inserted.find(row => row.table === planItems)?.values[0].planId, id)
})

test('a foreign source plan ID cannot create or overwrite an account plan', async () => {
  let mutations = 0
  const tx = {
    execute: async () => [[{ id: 'owner-1' }]],
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    insert: () => ({ values: async () => { mutations += 1 } }),
    update: () => ({ set: () => ({ where: async () => { mutations += 1 } }) }),
  }
  const db = { configured: true, db: { transaction: async (work: (transaction: any) => Promise<unknown>) => work(tx) } } as unknown as Extract<DatabaseContext, { configured: true }>
  await assert.rejects(applyPersonalPlan(db, 'owner-1', 'junior-fall', 'gpa', '误改', [],
    '00000000-0000-4000-8000-000000000001'), /personal_plan_not_owned/)
  assert.equal(mutations, 0)
})

test('manual timetable creates only an authenticated account-owned import without a file upload', async () => {
  const writes: unknown[] = []
  let role = 'user'
  const session = { userId: 'owner-1', role, status: 'active', internalIdStatus: null,
    expiresAt: new Date('2099-01-01') }
  const db = { configured: true, db: {
    select() { return { from(table: unknown) {
      const chain = { innerJoin() { return chain }, leftJoin() { return chain }, where() { return chain },
        async limit() { return table === userSessions ? [{ ...session, role }] : table === students ? [] : [] } }
      return chain
    } } },
    insert(table: unknown) { return { async values(values: unknown) {
      assert.equal(table, scheduleImports)
      writes.push(values)
    } } },
  } } as unknown as DatabaseContext
  const app = Fastify()
  registerClassroomWorkspaceRoutes(app, db, {} as AppEnv)
  const payload = { stageCode: 'junior-fall', schedule: { sourceType: 'manual', warnings: [], courses: [
    { name: '数学', day: '周一', dayIndex: 1, slot: '第1-2节', startSection: 1, endSection: 2,
      time: null, location: null, teacher: null, weeks: null, raw: '数学' },
  ] } }
  try {
    assert.equal((await app.inject({ method: 'POST', url: '/me/classroom/schedule-imports/manual', payload })).statusCode, 401)
    const headers = { authorization: 'Bearer synthetic-session' }
    role = 'teacher'
    assert.equal((await app.inject({ method: 'POST', url: '/me/classroom/schedule-imports/manual', headers, payload })).statusCode, 403)
    role = 'user'
    const result = await app.inject({ method: 'POST', url: '/me/classroom/schedule-imports/manual', headers, payload })
    assert.equal(result.statusCode, 200)
    assert.equal(result.json().schedule.courses[0].name, '数学')
    assert.equal(writes.length, 1)
    assert.deepEqual({ userId: (writes[0] as any).userId, studentId: (writes[0] as any).studentId,
      sourceType: (writes[0] as any).sourceType, fileId: (writes[0] as any).fileId },
    { userId: 'owner-1', studentId: null, sourceType: 'manual', fileId: '' })
  } finally { await app.close() }
})

test('plan deletion removes only an owned personal source and its tasks', async () => {
  const planId = '00000000-0000-4000-8000-000000000001'
  let role = 'user', owned = false, ownerWhere: unknown
  const deleted: unknown[] = []
  const tx = {
    async execute() { return [[{ id: 'owner-1' }]] },
    select() { return { from(table: unknown) { return { where(condition: unknown) {
      if (table === studentPlans) ownerWhere = condition
      return { limit: async () => owned ? [{ id: planId }] : [] }
    } } } } },
    delete(table: unknown) { return { where: async () => { deleted.push(table) } } },
  }
  const db = { configured: true, db: {
    select() { return { from(table: unknown) { const chain = { innerJoin() { return chain }, leftJoin() { return chain },
      where() { return chain }, async limit() { return table === userSessions ? [{ userId: 'owner-1', role,
        status: 'active', internalIdStatus: null, expiresAt: new Date('2099-01-01') }] : [] } }; return chain } } },
    transaction: async (work: (transaction: any) => Promise<unknown>) => work(tx),
  } } as unknown as DatabaseContext
  const app = Fastify()
  registerClassroomWorkspaceRoutes(app, db, {} as AppEnv)
  const url = `/me/classroom/plans/junior-fall/gpa/${planId}`
  const headers = { authorization: 'Bearer synthetic-session' }
  try {
    assert.equal((await app.inject({ method: 'DELETE', url })).statusCode, 401)
    role = 'teacher'
    assert.equal((await app.inject({ method: 'DELETE', url, headers })).statusCode, 403)
    role = 'user'
    assert.equal((await app.inject({ method: 'DELETE', url, headers })).statusCode, 404)
    assert.deepEqual(deleted, [])
    owned = true
    assert.equal((await app.inject({ method: 'DELETE', url, headers })).statusCode, 200)
    assert.deepEqual(deleted, [planItems, studentPlans])
    const query = new MySqlDialect().sqlToQuery(ownerWhere as any)
    assert.match(query.sql, /owner_user_id/)
    assert.match(query.sql, /student_id` is null/)
    assert.ok(query.params.includes('owner-1'))
    assert.ok(query.params.includes(planId))
  } finally { await app.close() }
})
