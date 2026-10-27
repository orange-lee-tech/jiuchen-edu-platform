import assert from 'node:assert/strict'
import test from 'node:test'
import type { DatabaseContext } from '../db/client.js'
import { coachingRecords, planItems, planRevisions, studentPlans, studentTeacherAssignments, teachers } from '../db/schema.js'
import { applyApprovedPlan, loadClassroom, teacherCanAccessStudent } from './classroom-workspace.js'

type SavedItem = { planId: string; name: string; target: string | null; status: 'pending' | 'in_progress' | 'done'; sortOrder: number }

function memoryDatabase() {
  const state = {
    plans: [] as Array<{ id: string; studentId: string; stageCode: string; type: 'gpa'; title: string }>,
    items: [] as SavedItem[],
    revisions: [{ id: 'historic-pending', status: 'pending', title: '旧待审稿' }],
  }
  const inserted: unknown[] = []
  const query = (table: unknown) => {
    const rows = table === studentPlans ? state.plans
      : table === planItems ? state.items
      : table === planRevisions ? state.revisions
      : table === studentTeacherAssignments || table === coachingRecords ? []
      : []
    const chain = {
      where: () => chain,
      orderBy: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      limit: (count: number) => Promise.resolve(rows.slice(0, count)),
      then: (resolve: (value: typeof rows) => unknown) => Promise.resolve(rows).then(resolve),
    }
    return chain
  }
  const tx = {
    execute: async () => [],
    select: () => ({ from: query }),
    update: (table: unknown) => ({ set: (values: Record<string, unknown>) => ({
      where: async () => {
        if (table === studentPlans) state.plans[0]!.title = String(values.title)
        if (table === planRevisions) Object.assign(state.revisions[0]!, values)
      },
    }) }),
    delete: (table: unknown) => ({ where: async () => {
      if (table === planItems) state.items = []
    } }),
    insert: (table: unknown) => ({ values: async (values: unknown) => {
      inserted.push(table)
      const list = Array.isArray(values) ? values : [values]
      if (table === studentPlans) state.plans.push(...list as typeof state.plans)
      if (table === planItems) state.items.push(...list as SavedItem[])
    } }),
  }
  const db = {
    configured: true,
    db: {
      transaction: async <T>(work: (transaction: typeof tx) => Promise<T>) => work(tx),
      select: () => ({ from: query }),
    },
  } as unknown as Extract<DatabaseContext, { configured: true }>
  return { db, state, inserted }
}

test('direct save persists a formal plan, supersedes old pending history, and reloads the saved content', async () => {
  const { db, state, inserted } = memoryDatabase()
  const id = await applyApprovedPlan(db, 'student-1', 'junior-fall', 'gpa', '新规划',
    [{ name: '高数', target: '完成课程', status: 'in_progress' }], 'student-user')
  assert.equal(state.plans[0]?.id, id)
  assert.equal(state.items[0]?.name, '高数')
  assert.equal(state.revisions[0]?.status, 'rejected')
  assert.equal(state.revisions[0]?.title, '旧待审稿')
  assert.equal(inserted.includes(planRevisions), false, 'new saves do not create approval revisions')

  const view = await loadClassroom(db, {
    id: 'student-1', name: '测试学员', university: null, major: null, currentStage: 'junior-fall',
  }, 'junior-fall')
  assert.equal(view.plans.find((plan) => plan.type === 'gpa')?.title, '新规划')
  assert.equal(view.plans.find((plan) => plan.type === 'gpa')?.revisionStatus, 'approved')
  assert.equal(view.plans.find((plan) => plan.type === 'gpa')?.items[0]?.name, '高数')

  await applyApprovedPlan(db, 'student-1', 'junior-fall', 'gpa', '老师更新',
    [{ name: '英语', status: 'done' }], 'teacher-user')
  assert.equal(state.plans.length, 1)
  assert.equal(state.plans[0]?.title, '老师更新')
  assert.deepEqual(state.items.map((item) => item.name), ['英语'])
  assert.equal(inserted.includes(planRevisions), false)
})

test('teacher access still requires an assigned student; student role cannot edit through teacher routes', async () => {
  const database = (assigned: boolean) => ({ configured: true, db: {
    select: () => ({ from: (table: unknown) => ({
      where: () => ({ limit: async () => table === teachers ? [{ id: 'teacher-1' }]
        : table === studentTeacherAssignments && assigned ? [{ id: 'assignment-1' }] : [] }),
    }) }),
  } }) as unknown as Extract<DatabaseContext, { configured: true }>
  assert.equal(await teacherCanAccessStudent(database(false), 'teacher-user', 'teacher', 'student-1'), false)
  assert.equal(await teacherCanAccessStudent(database(true), 'teacher-user', 'teacher', 'student-1'), true)
  assert.equal(await teacherCanAccessStudent(database(true), 'student-user', 'student', 'student-1'), false)
})
