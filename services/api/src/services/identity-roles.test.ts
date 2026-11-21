import assert from 'node:assert/strict'
import test from 'node:test'
import { IdentityRoleError, switchMyIdentity, unbindMyIdentity } from './identity-roles.js'

function identityDatabase() {
  const state = { role: 'admin', audit: [] as string[], updates: [] as string[] }
  const identities = [
    { id: 'admin-id', type: 'admin', status: 'claimed', user_id: 'user' },
    { id: 'student-id', type: 'student', status: 'claimed', user_id: 'user', entity_id: 'student' },
  ]
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql: string, params: unknown[] = []) {
      if (sql.startsWith('SELECT id,role,status FROM users'))
        return [[{ id: 'user', role: state.role, status: 'active' }]]
      if (sql.startsWith('SELECT * FROM internal_ids')) return [identities]
      if (sql.startsWith('SELECT id FROM identity_admin_guard')) return [[{ id: 1 }]]
      if (sql.includes("WHERE type='admin' AND status='claimed'"))
        return [[{ id: 'admin-id' }]]
      if (sql.startsWith('UPDATE users SET role=')) {
        state.role = String(params[0]); state.updates.push(state.role)
      }
      if (sql.startsWith('INSERT INTO identity_events')) state.audit.push(String(params[3]))
      return [[]]
    },
  }
  return { database: { configured: true,
    pool: { getConnection: async () => connection } } as any, state }
}

test('bound admin can switch to student and back with audited server role', async () => {
  const { database, state } = identityDatabase()
  assert.deepEqual(await switchMyIdentity(database, 'user', 'student'), { activeRole: 'student' })
  assert.equal(state.role, 'student')
  assert.deepEqual(await switchMyIdentity(database, 'user', 'admin'), { activeRole: 'admin' })
  assert.deepEqual(state.audit, ['switch', 'switch'])
  await assert.rejects(switchMyIdentity(database, 'user', 'teacher'),
    (error: unknown) => error instanceof IdentityRoleError && error.code === 'identity_not_bound')
})

test('last administrator identity remains protected after binding a student identity', async () => {
  const { database, state } = identityDatabase()
  await assert.rejects(unbindMyIdentity(database, 'user', 'admin-id'),
    (error: unknown) => error instanceof IdentityRoleError && error.code === 'last_admin_identity')
  assert.equal(state.role, 'admin')
  assert.deepEqual(state.updates, [])
})

test('student unbind snapshots formal plans and tasks before unlinking without deleting originals', async () => {
  const statements: string[] = []
  const connection = {
    async beginTransaction() { statements.push('BEGIN') }, async commit() { statements.push('COMMIT') },
    async rollback() { statements.push('ROLLBACK') }, release() {},
    async query(sql: string) {
      statements.push(sql)
      if (sql.startsWith('SELECT id,role,status FROM users')) return [[{ id: 'owner', role: 'student', status: 'active' }]]
      if (sql.startsWith('SELECT * FROM internal_ids')) return [[{ id: 'student-id', type: 'student', entity_id: 'student-1', user_id: 'owner', status: 'claimed' }]]
      if (sql.startsWith('SELECT id,stage_code AS')) return [[{ id: 'formal-plan', stageCode: 'junior-fall', type: 'gpa', title: '正式规划', createdAt: new Date(), updatedAt: new Date() }]]
      return [[]]
    },
  }
  const db = { configured: true, pool: { getConnection: async () => connection } } as any
  assert.deepEqual(await unbindMyIdentity(db, 'owner', 'student-id'), { activeRole: 'user' })
  const copyPlan = statements.findIndex(sql => sql.includes('INSERT INTO student_plans'))
  const copyItems = statements.findIndex(sql => sql.includes('INSERT INTO plan_items'))
  const unlink = statements.findIndex(sql => sql.startsWith('UPDATE students SET user_id=NULL'))
  assert.ok(copyPlan >= 0 && copyItems > copyPlan && unlink > copyItems)
  assert.equal(statements.at(-1), 'COMMIT')
  assert.equal(statements.some(sql => /DELETE\s+FROM\s+(student_plans|plan_items|plan_revisions)/i.test(sql)), false)
})

test('failed snapshot copy rolls back before student unlink', async () => {
  const statements: string[] = []
  const connection = {
    async beginTransaction() { statements.push('BEGIN') }, async commit() { statements.push('COMMIT') },
    async rollback() { statements.push('ROLLBACK') }, release() {},
    async query(sql: string) {
      statements.push(sql)
      if (sql.startsWith('SELECT id,role,status FROM users')) return [[{ id: 'owner', role: 'student', status: 'active' }]]
      if (sql.startsWith('SELECT * FROM internal_ids')) return [[{ id: 'student-id', type: 'student', entity_id: 'student-1', user_id: 'owner', status: 'claimed' }]]
      if (sql.startsWith('SELECT id,stage_code AS')) return [[{ id: 'formal-plan', stageCode: 'junior-fall', type: 'gpa', title: '正式规划', createdAt: new Date(), updatedAt: new Date() }]]
      if (sql.includes('INSERT INTO plan_items')) throw new Error('synthetic_copy_failure')
      return [[]]
    },
  }
  const db = { configured: true, pool: { getConnection: async () => connection } } as any
  await assert.rejects(unbindMyIdentity(db, 'owner', 'student-id'), /synthetic_copy_failure/)
  assert.equal(statements.at(-1), 'ROLLBACK')
  assert.equal(statements.some(sql => sql.startsWith('UPDATE students SET user_id=NULL')), false)
})
