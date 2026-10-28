import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { registerClassroomWorkspaceRoutes } from './classroom-workspace.js'
import { students, userProfiles, userSessions } from '../db/schema.js'
import type { DatabaseContext } from '../db/client.js'
import type { AppEnv } from '../config/env.js'

function fixture(role = 'student') {
  const state = { stage: 'freshman-fall', writes: 0 }
  const session = { userId: 'student-user', role, status: 'active', internalIdStatus: 'claimed', expiresAt: new Date('2099-01-01') }
  const db = {
    select: () => { let table: unknown; const q = { from(t: unknown) { table = t; return q }, innerJoin() { return q }, leftJoin() { return q }, where() { return q },
      async limit() { return table === userSessions ? [session] : table === userProfiles ? [{ enrollmentYear: 2024 }] : table === students ? [{ id: 's1', currentStage: state.stage }] : [] } }; return q },
    transaction: async <T>(work: (tx: unknown) => Promise<T>) => work({
      execute: async () => [[{ id: 's1', currentStage: state.stage }]],
      update: (table: unknown) => ({ set: (values: { currentStage: string }) => ({ where: async () => {
        assert.equal(table, students); state.stage = values.currentStage; state.writes += 1
      } }) }),
    }),
  }
  const app = Fastify()
  registerClassroomWorkspaceRoutes(app, { configured: true, db, pool: null } as unknown as DatabaseContext, {} as AppEnv)
  return { app, state, headers: { authorization: 'Bearer synthetic-token' } }
}

test('student confirms a current stage; stale changes fail without touching historical records', async () => {
  const { app, state, headers } = fixture()
  try {
    assert.equal((await app.inject({ url: '/me/classroom/stage-suggestion' })).statusCode, 401)
    const suggested = await app.inject({ url: '/me/classroom/stage-suggestion', headers })
    assert.equal(suggested.statusCode, 200)
    assert.equal(suggested.json().currentStage, 'freshman-fall')
    const changed = await app.inject({ method: 'PUT', url: '/me/classroom/current-stage', headers, payload: { stageCode: 'junior-fall', expectedCurrentStage: 'freshman-fall' } })
    assert.equal(changed.statusCode, 200); assert.equal(changed.json().currentStage, 'junior-fall')
    const stale = await app.inject({ method: 'PUT', url: '/me/classroom/current-stage', headers, payload: { stageCode: 'senior-fall', expectedCurrentStage: 'freshman-fall' } })
    assert.equal(stale.statusCode, 409); assert.equal(state.stage, 'junior-fall'); assert.equal(state.writes, 1)
    assert.equal((await app.inject({ method: 'PUT', url: '/me/classroom/current-stage', headers, payload: { stageCode: 'invalid', expectedCurrentStage: 'junior-fall' } })).statusCode, 400)
  } finally { await app.close() }
})

test('teacher cannot change a student current stage through the self-service route', async () => {
  const { app, state, headers } = fixture('teacher')
  try {
    assert.equal((await app.inject({ method: 'PUT', url: '/me/classroom/current-stage', headers, payload: { stageCode: 'junior-fall', expectedCurrentStage: 'freshman-fall' } })).statusCode, 403)
    assert.equal(state.writes, 0)
  } finally { await app.close() }
})
