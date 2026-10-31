import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type mysql from 'mysql2/promise'
import { z } from 'zod'
import type { DatabaseContext } from '../db/client.js'
import { resolveSessionUser } from '../services/session.js'

export const staffProfileInput = z.object({
  realName: z.string().trim().min(1).max(80),
  phone: z.string().trim().regex(/^[+0-9][0-9 ()-]{5,24}$/).nullable(),
  department: z.string().trim().min(1).max(120).nullable(),
  supervisor: z.string().trim().min(1).max(80).nullable(),
}).strict()

export function staffProfileView(row: Record<string, unknown> | undefined) {
  const realName = typeof row?.realName === 'string' ? row.realName : null
  const phone = typeof row?.phone === 'string' ? row.phone : null
  const department = typeof row?.department === 'string' ? row.department : null
  const supervisor = typeof row?.supervisor === 'string' ? row.supervisor : null
  const completedFields = [realName, phone, department, supervisor].filter(Boolean).length
  return { realName, phone, department, supervisor, completedFields, complete: completedFields === 4 }
}

export function registerStaffProfileRoutes(app: FastifyInstance, database: DatabaseContext) {
  async function employee(request: FastifyRequest, reply: FastifyReply, adminOnly = false) {
    if (!database.configured) { reply.code(503).send({ ok: false, error: 'database_not_configured' }); return null }
    const user = await resolveSessionUser(request, database)
    if (!user) { reply.code(401).send({ ok: false, error: 'unauthorized' }); return null }
    if ((user.role !== 'teacher' && user.role !== 'admin') || ('readOnly' in user && user.readOnly) ||
      (adminOnly && user.role !== 'admin')) {
      reply.code(403).send({ ok: false, error: 'staff_profile_forbidden' }); return null
    }
    if (user.role === 'teacher') {
      const [rows] = await database.pool.query<mysql.RowDataPacket[]>(
        "SELECT id FROM teachers WHERE user_id=? AND status='active' LIMIT 1", [user.userId])
      if (!rows.length) { reply.code(403).send({ ok: false, error: 'teacher_profile_not_bound' }); return null }
    }
    return user
  }
  function failure(reply: FastifyReply, error: unknown) {
    if (['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(String((error as {code?: string}).code)))
      return reply.code(503).send({ ok: false, error: 'staff_profile_schema_not_ready' })
    throw error
  }
  app.get('/me/staff-profile', async (request, reply) => {
    const user = await employee(request, reply)
    if (!user || !database.configured) return
    try {
      const [rows] = await database.pool.query<mysql.RowDataPacket[]>(
        'SELECT real_name AS realName,phone,department,supervisor,updated_at AS updatedAt FROM staff_profiles WHERE user_id=?', [user.userId])
      return { ok: true, profile: staffProfileView(rows[0]), updatedAt: rows[0]?.updatedAt ?? null }
    } catch (error) { return failure(reply, error) }
  })
  app.put<{Body: unknown}>('/me/staff-profile', async (request, reply) => {
    const user = await employee(request, reply)
    if (!user || !database.configured) return
    const parsed = staffProfileInput.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_staff_profile' })
    const connection = await database.pool.getConnection()
    try {
      await connection.beginTransaction()
      if (user.role === 'teacher') {
        const [active] = await connection.query<mysql.RowDataPacket[]>(
          "SELECT id FROM teachers WHERE user_id=? AND status='active' FOR UPDATE",[user.userId])
        if (!active.length) { await connection.rollback(); return reply.code(403).send({ok:false,error:'teacher_profile_not_bound'}) }
      }
      // Staff profile is the explicit formal-name authority. Keep the existing
      // teacher business name synchronized, without ever changing account nickname.
      const p = parsed.data
      await connection.query(`INSERT INTO staff_profiles (user_id,real_name,phone,department,supervisor)
        VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE real_name=VALUES(real_name),phone=VALUES(phone),
        department=VALUES(department),supervisor=VALUES(supervisor)`, [user.userId,p.realName,p.phone,p.department,p.supervisor])
      // A dual-identity administrator may also own a teacher record. Synchronize
      // that same account regardless of which allowed staff role is active.
      await connection.query('UPDATE teachers SET name=? WHERE user_id=?', [p.realName,user.userId])
      await connection.commit()
      return { ok: true, profile: staffProfileView(p) }
    } catch (error) { await connection.rollback(); return failure(reply,error) }
    finally { connection.release() }
  })
  app.get('/me/admin/staff-profiles', async (request, reply) => {
    if (!await employee(request,reply,true) || !database.configured) return
    try {
      const [rows] = await database.pool.query<mysql.RowDataPacket[]>(`SELECT t.id AS teacherId,t.user_id AS userId,
        t.name AS businessName,t.status,p.real_name AS realName,p.phone,p.department,p.supervisor
        FROM teachers t LEFT JOIN staff_profiles p ON p.user_id=t.user_id ORDER BY t.name,t.id`)
      return { ok: true, teachers: rows.map(row => ({teacherId:row.teacherId,userId:row.userId,
        businessName:row.businessName,status:row.status,...staffProfileView(row)})) }
    } catch (error) { return failure(reply,error) }
  })
}
