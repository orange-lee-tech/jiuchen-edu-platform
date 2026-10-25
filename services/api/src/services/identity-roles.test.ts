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
