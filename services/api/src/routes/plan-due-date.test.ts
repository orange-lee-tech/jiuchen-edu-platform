import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { registerClassroomWorkspaceRoutes } from './classroom-workspace.js'
import { students, userSessions } from '../db/schema.js'
import type { DatabaseContext } from '../db/client.js'
import type { AppEnv } from '../config/env.js'

test('plan API rejects impossible dates before saving, and upcoming reads require student authentication', async () => {
  let writes = 0
  let role = 'student'
  const db = { select: () => { let table: unknown; const q = {
    from(t: unknown) { table = t; return q }, innerJoin() { return q }, leftJoin() { return q }, where() { return q },
    async limit() { return table === userSessions ? [{ userId: 'u1', role, status: 'active', internalIdStatus: 'claimed', expiresAt: new Date('2099-01-01') }]
      : table === students ? [{ id: 's1', currentStage: 'freshman-fall' }] : [] },
  }; return q }, transaction: async () => { writes++; throw new Error('must_not_write') } }
  const app = Fastify()
  registerClassroomWorkspaceRoutes(app, { configured: true, db } as unknown as DatabaseContext, {} as AppEnv)
  const headers = { authorization: 'Bearer synthetic' }
  try {
    for (const dueDate of ['2026-02-29', '2026-11-31', '2026-10-29T00:00:00Z', '', 20261029]) {
      const result = await app.inject({ method: 'PUT', url: '/me/classroom/plans/freshman-fall/gpa', headers,
        payload: { title: '测试', items: [{ name: '任务', dueDate }] } })
      assert.equal(result.statusCode, 400)
    }
    assert.equal(writes, 0)
    assert.equal((await app.inject({ url: '/me/classroom/upcoming-tasks' })).statusCode, 401)
    role = 'teacher'
    assert.equal((await app.inject({ url: '/me/classroom/upcoming-tasks', headers })).statusCode, 403)
    assert.equal((await app.inject({ method: 'PUT', url: '/me/classroom/plans/freshman-fall/gpa', headers, payload: { title: '测试', items: [] } })).statusCode, 403)
  } finally { await app.close() }
})
