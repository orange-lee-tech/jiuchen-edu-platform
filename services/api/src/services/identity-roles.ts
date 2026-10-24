import { randomUUID } from 'node:crypto'
import type mysql from 'mysql2/promise'
import type { DatabaseContext } from '../db/client.js'
import { normalizeInternalBusinessId } from '../domain/internal-id.js'

type Db = Extract<DatabaseContext, { configured: true }>
type Role = 'admin' | 'teacher' | 'student' | 'user'
type Identity = mysql.RowDataPacket & {
  id: string; business_id: string; type: Role; status: string;
  user_id: string | null; entity_id: string | null; claim_mode: string
}
export class IdentityRoleError extends Error {
  constructor(public code: string, public status = 409) { super(code) }
}
async function owned(connection: mysql.PoolConnection, userId: string) {
  const [rows] = await connection.query<Identity[]>(
    `SELECT * FROM internal_ids WHERE user_id=? AND status='claimed'
     ORDER BY FIELD(type,'admin','teacher','student') FOR UPDATE`, [userId])
  return rows
}
async function lockedUser(connection: mysql.PoolConnection, userId: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    'SELECT id,role,status FROM users WHERE id=? FOR UPDATE', [userId])
  if (!rows[0] || rows[0].status !== 'active') throw new IdentityRoleError('user_not_found', 404)
  return rows[0] as { id: string; role: Role; status: string }
}
async function audit(connection: mysql.PoolConnection, userId: string, identityId: string | null,
  action: string, oldRole: Role, newRole: Role) {
  await connection.query(
    'INSERT INTO identity_events (id,actor_user_id,identity_id,action,old_role,new_role) VALUES (?,?,?,?,?,?)',
    [randomUUID(), userId, identityId, action, oldRole, newRole])
}
async function transact<T>(pool: mysql.Pool, work: (connection: mysql.PoolConnection) => Promise<T>) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}
export async function listMyIdentities(database: Db, userId: string) {
  const [users] = await database.pool.query<mysql.RowDataPacket[]>(
    'SELECT role FROM users WHERE id=? AND status=\'active\' LIMIT 1', [userId])
  const [rows] = await database.pool.query<Identity[]>(
    `SELECT id,business_id,type,status FROM internal_ids
     WHERE user_id=? AND status='claimed' ORDER BY FIELD(type,'admin','teacher','student')`, [userId])
  return { activeRole: users[0]?.role ?? 'user', identities: rows.map((row) => ({
    id: row.id, businessId: row.business_id, type: row.type, status: row.status,
  })) }
}
export async function bindAdditionalIdentity(database: Db, userId: string, businessId: string) {
  const normalized = normalizeInternalBusinessId(businessId)
  return transact(database.pool, async (connection) => {
    const user = await lockedUser(connection, userId)
    const bindings = await owned(connection, userId)
    if (!bindings.some((row) => row.type === 'admin') || bindings.length !== 1) {
      throw new IdentityRoleError('admin_single_identity_required')
    }
    const [rows] = await connection.query<Identity[]>(
      'SELECT * FROM internal_ids WHERE business_id=? FOR UPDATE', [normalized])
    const target = rows[0]
    if (!target || !['teacher', 'student'].includes(target.type) ||
        target.claim_mode !== 'self' || target.status !== 'available' || target.user_id || !target.entity_id) {
      throw new IdentityRoleError('internal_id_not_available')
    }
    const [result] = await connection.query<mysql.ResultSetHeader>(
      `UPDATE internal_ids SET user_id=?,status='claimed',claimed_at=CURRENT_TIMESTAMP()
       WHERE id=? AND status='available' AND user_id IS NULL`, [userId, target.id])
    if (result.affectedRows !== 1) throw new IdentityRoleError('internal_id_not_available')
    const table = target.type === 'teacher' ? 'teachers' : 'students'
    const [entity] = await connection.query<mysql.ResultSetHeader>(
      `UPDATE ${table} SET user_id=? WHERE id=? AND user_id IS NULL`, [userId, target.entity_id])
    if (entity.affectedRows !== 1) throw new IdentityRoleError('internal_id_entity_not_available')
    await audit(connection, userId, target.id, 'bind_additional', user.role, user.role)
    return { id: target.id, businessId: target.business_id, type: target.type, activeRole: user.role }
  })
}
export async function switchMyIdentity(database: Db, userId: string, role: Role) {
  return transact(database.pool, async (connection) => {
    const user = await lockedUser(connection, userId)
    if (role === 'user') throw new IdentityRoleError('identity_not_bound')
    const bindings = await owned(connection, userId)
    const target = bindings.find((row) => row.type === role)
    if (!target) throw new IdentityRoleError('identity_not_bound')
    await connection.query('UPDATE users SET role=? WHERE id=?', [role, userId])
    await audit(connection, userId, target.id, 'switch', user.role, role)
    return { activeRole: role }
  })
}
export async function unbindMyIdentity(database: Db, userId: string, identityId: string) {
  return transact(database.pool, async (connection) => {
    await connection.query('SELECT id FROM identity_admin_guard WHERE id=1 FOR UPDATE')
    const user = await lockedUser(connection, userId)
    const bindings = await owned(connection, userId)
    const target = bindings.find((row) => row.id === identityId)
    if (!target) throw new IdentityRoleError('identity_not_bound', 404)
    if (target.type === 'admin') {
      const [admins] = await connection.query<Identity[]>(
        `SELECT id FROM internal_ids WHERE type='admin' AND status='claimed'
         AND user_id IS NOT NULL`)
      if (admins.length <= 1) throw new IdentityRoleError('last_admin_identity', 409)
    }
    const remaining = bindings.filter((row) => row.id !== target.id)
    const nextRole: Role = user.role === target.type ? (remaining[0]?.type ?? 'user') : user.role
    if (target.type === 'teacher' || target.type === 'student') {
      const table = target.type === 'teacher' ? 'teachers' : 'students'
      await connection.query(`UPDATE ${table} SET user_id=NULL WHERE id=? AND user_id=?`, [target.entity_id, userId])
    }
    await connection.query(
      `UPDATE internal_ids SET user_id=NULL,status='disabled' WHERE id=? AND user_id=?`,
      [target.id, userId])
    if (nextRole !== user.role) await connection.query('UPDATE users SET role=? WHERE id=?', [nextRole, userId])
    await audit(connection, userId, target.id, 'unbind', user.role, nextRole)
    return { activeRole: nextRole }
  })
}
