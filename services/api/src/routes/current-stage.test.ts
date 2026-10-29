import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { registerClassroomWorkspaceRoutes } from './classroom-workspace.js'
import { students, userProfiles, userSessions } from '../db/schema.js'
import type { DatabaseContext } from '../db/client.js'
import type { AppEnv } from '../config/env.js'

function fixture(role = 'student') {
  const state: { stage: string | null; mode: 'auto' | 'manual' | null; writes: number } = { stage: 'freshman-fall', mode: null, writes: 0 }
  const china = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const enrollmentYear = china.getUTCFullYear() - (china.getUTCMonth() + 1 >= 9 ? 1 : 2)
  const session = { userId: 'student-user', role, status: 'active', internalIdStatus: 'claimed', expiresAt: new Date('2099-01-01') }
  const db = {
    select: (fields: Record<string, unknown>) => { let table: unknown; const q = { from(t: unknown) { table = t; return q }, innerJoin() { return q }, leftJoin() { return q }, where() { return q },
      async limit() { return table === userSessions ? [session] : table === userProfiles ? [{ enrollmentYear, currentGrade: null }] : table === students ? [('mode' in fields) ? { mode: state.mode, currentStage: state.stage } : { id: 's1', currentStage: state.stage }] : [] } }; return q },
    transaction: async <T>(work: (tx: unknown) => Promise<T>) => { let calls = 0; return work({
      execute: async () => ++calls === 1 ? [[{ id: 's1', currentStage: state.stage, mode: state.mode }]] : [[{ enrollmentYear, currentGrade: null }]],
      update: (table: unknown) => ({ set: (values: { currentStage: string; currentStageMode: 'auto' | 'manual' }) => ({ where: async () => {
        assert.equal(table, students); state.stage = values.currentStage; state.mode = values.currentStageMode; state.writes += 1
      } }) }),
    }) },
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
    assert.equal(state.mode, 'manual')
    const stale = await app.inject({ method: 'PUT', url: '/me/classroom/current-stage', headers, payload: { stageCode: 'senior-fall', expectedCurrentStage: 'freshman-fall' } })
    assert.equal(stale.statusCode, 409); assert.equal(state.stage, 'junior-fall'); assert.equal(state.writes, 1)
    assert.equal((await app.inject({ method: 'PUT', url: '/me/classroom/current-stage', headers, payload: { stageCode: 'invalid', expectedCurrentStage: 'junior-fall' } })).statusCode, 400)
  } finally { await app.close() }
})

test('automatic mode requires a server suggestion and explicit consent for an existing stage', async () => {
  const { app, state, headers } = fixture()
  try {
    const suggestion = (await app.inject({ url: '/me/classroom/stage-suggestion', headers })).json().suggestedStage
    assert.ok(suggestion)
    const body = { stageCode: suggestion, expectedCurrentStage: 'freshman-fall', mode: 'auto', expectedMode: null }
    assert.equal((await app.inject({ method: 'PUT', url: '/me/classroom/current-stage', headers, payload: body })).statusCode, 409)
    assert.equal(state.writes, 0)
    const approved = await app.inject({ method: 'PUT', url: '/me/classroom/current-stage', headers, payload: { ...body, confirmAuto: true } })
    assert.equal(approved.statusCode, 200); assert.equal(state.mode, 'auto'); assert.equal(state.stage, suggestion)
    assert.equal((await app.inject({ method: 'PUT', url: '/me/classroom/current-stage', headers, payload: { stageCode: 'freshman-fall', expectedCurrentStage: suggestion, mode: 'auto', expectedMode: null } })).statusCode, 409)
  } finally { await app.close() }
})

test('an unset new stage may initialize automatically without altering historical records', async () => {
  const { app, state, headers } = fixture(); state.stage = null
  try {
    const suggestion = (await app.inject({ url: '/me/classroom/stage-suggestion', headers })).json().suggestedStage
    const result = await app.inject({ method: 'PUT', url: '/me/classroom/current-stage', headers, payload: { stageCode: suggestion, expectedCurrentStage: null, mode: 'auto', expectedMode: null } })
    assert.equal(result.statusCode, 200); assert.equal(state.mode, 'auto'); assert.equal(state.stage, suggestion)
  } finally { await app.close() }
})

test('teacher cannot change a student current stage through the self-service route', async () => {
  const { app, state, headers } = fixture('teacher')
  try {
    assert.equal((await app.inject({ method: 'PUT', url: '/me/classroom/current-stage', headers, payload: { stageCode: 'junior-fall', expectedCurrentStage: 'freshman-fall' } })).statusCode, 403)
    assert.equal(state.writes, 0)
  } finally { await app.close() }
})

test('administrator and read-only contexts cannot use student stage writes', async () => {
  const admin = fixture('admin'), student = fixture()
  try {
    const payload = { stageCode: 'junior-fall', expectedCurrentStage: 'freshman-fall' }
    assert.equal((await admin.app.inject({ method: 'PUT', url: '/me/classroom/current-stage', headers: admin.headers, payload })).statusCode, 403)
    assert.equal((await student.app.inject({ method: 'PUT', url: '/me/classroom/current-stage', headers: { ...student.headers, 'x-jiuchen-read-only-target': 'student:00000000-0000-4000-8000-000000000001' }, payload })).statusCode, 403)
    assert.equal(admin.state.writes, 0); assert.equal(student.state.writes, 0)
  } finally { await admin.app.close(); await student.app.close() }
})
