import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type mysql from 'mysql2/promise'
import { z } from 'zod'
import type { DatabaseContext } from '../db/client.js'
import {
  students,
  studentTeacherAssignments,
  teachers,
} from '../db/schema.js'
import {
  canAccessTeacherWorkspace,
  type UserRole,
} from '../domain/auth-policy.js'
import { resolveSessionUser } from '../services/session.js'

export function registerTeacherRoutes(
  app: FastifyInstance,
  database: DatabaseContext,
) {
  const todoSchema = z.object({ title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).nullable().optional(),
    dueDate: z.iso.date().nullable().optional(), status: z.enum(['pending', 'done']) }).strict()
  async function todoOwner(request: FastifyRequest, reply: FastifyReply, write: boolean) {
    if (!database.configured) { reply.code(503).send({ ok: false, error: 'database_not_configured' }); return null }
    const user = await resolveSessionUser(request, database)
    if (!user) { reply.code(401).send({ ok: false, error: 'unauthorized' }); return null }
    if (user.role !== 'teacher' || ('readOnly' in user && user.readOnly)) {
      reply.code(403).send({ ok: false, error: 'teacher_forbidden' }); return null
    }
    const [rows] = await database.pool.query<mysql.RowDataPacket[]>(
      "SELECT id FROM teachers WHERE user_id=? AND status='active' LIMIT 1", [user.userId])
    if (!rows[0]) { reply.code(403).send({ ok: false, error: 'teacher_profile_not_bound' }); return null }
    return String(rows[0].id)
  }
  app.get('/me/teacher/todos', async (request, reply) => {
    const owner = await todoOwner(request, reply, false)
    if (!owner || !database.configured) return
    const [rows] = await database.pool.query<mysql.RowDataPacket[]>(
      'SELECT id,title,description,DATE_FORMAT(due_date,\'%Y-%m-%d\') AS dueDate,status,created_at AS createdAt,updated_at AS updatedAt FROM teacher_todos WHERE teacher_id=? ORDER BY status,due_date IS NULL,due_date,created_at DESC LIMIT 200', [owner])
    return { ok: true, todos: rows }
  })
  app.post<{ Body: unknown }>('/me/teacher/todos', async (request, reply) => {
    const owner = await todoOwner(request, reply, true)
    if (!owner || !database.configured) return
    const data = todoSchema.safeParse(request.body)
    if (!data.success) return reply.code(400).send({ ok: false, error: 'invalid_teacher_todo' })
    const id = randomUUID()
    await database.pool.query('INSERT INTO teacher_todos (id,teacher_id,title,description,due_date,status) VALUES (?,?,?,?,?,?)',
      [id, owner, data.data.title, data.data.description || null, data.data.dueDate ?? null, data.data.status])
    return reply.code(201).send({ ok: true, id })
  })
  app.put<{ Params: { id: string }; Body: unknown }>('/me/teacher/todos/:id', async (request, reply) => {
    const owner = await todoOwner(request, reply, true)
    if (!owner || !database.configured) return
    const data = todoSchema.safeParse(request.body)
    if (!data.success || !z.string().uuid().safeParse(request.params.id).success)
      return reply.code(400).send({ ok: false, error: 'invalid_teacher_todo' })
    const [result] = await database.pool.execute<mysql.ResultSetHeader>(
      'UPDATE teacher_todos SET title=?,description=?,due_date=?,status=? WHERE id=? AND teacher_id=?',
      [data.data.title, data.data.description || null, data.data.dueDate ?? null, data.data.status, request.params.id, owner])
    if (!result.affectedRows) return reply.code(404).send({ ok: false, error: 'teacher_todo_not_found' })
    return { ok: true }
  })
  app.delete<{ Params: { id: string } }>('/me/teacher/todos/:id', async (request, reply) => {
    const owner = await todoOwner(request, reply, true)
    if (!owner || !database.configured) return
    if (!z.string().uuid().safeParse(request.params.id).success) return reply.code(400).send({ ok: false, error: 'invalid_teacher_todo' })
    const [result] = await database.pool.execute<mysql.ResultSetHeader>('DELETE FROM teacher_todos WHERE id=? AND teacher_id=?', [request.params.id, owner])
    if (!result.affectedRows) return reply.code(404).send({ ok: false, error: 'teacher_todo_not_found' })
    return { ok: true }
  })
  app.get<{ Params: { id: string } }>('/me/teacher/students/:id/summary', async (request, reply) => {
    const owner = await todoOwner(request, reply, false)
    if (!owner || !database.configured) return
    const studentId = request.params.id
    if (!z.string().uuid().safeParse(studentId).success) return reply.code(400).send({ ok: false, error: 'invalid_student_id' })
    const [assigned] = await database.pool.query<mysql.RowDataPacket[]>(
      'SELECT s.id,s.user_id AS userId FROM students s INNER JOIN student_teacher_assignments a ON a.student_id=s.id WHERE s.id=? AND a.teacher_id=? LIMIT 1', [studentId, owner])
    if (!assigned.length) return reply.code(403).send({ ok: false, error: 'student_not_assigned' })
    const scope = 's.id=? AND EXISTS (SELECT 1 FROM student_teacher_assignments a WHERE a.student_id=s.id AND a.teacher_id=?)'
    // Each query independently enforces the live teacher/student assignment.
    const [assessmentRows] = await database.pool.query<mysql.RowDataPacket[]>(`SELECT COUNT(a.id) AS total,
      SUM(a.status='succeeded') AS succeeded, SUM(a.status='failed') AS failed, MAX(a.started_at) AS lastUsed
      FROM students s LEFT JOIN assessments a ON a.user_id=s.user_id WHERE ${scope}`, [studentId, owner])
    const [orderRows] = await database.pool.query<mysql.RowDataPacket[]>(`SELECT COUNT(p.id) AS orders,
      SUM(p.status='paid') AS paidOrders, SUM(p.status='refunded') AS refundedOrders,
      COALESCE(SUM(CASE WHEN p.status='paid' THEN p.amount_fen ELSE 0 END),0) AS paidFen
      FROM students s LEFT JOIN payment_orders p ON p.user_id=s.user_id WHERE ${scope}`, [studentId, owner])
    const [creditRows] = await database.pool.query<mysql.RowDataPacket[]>(`SELECT COALESCE(SUM(CASE WHEN l.type='payment_grant' THEN l.delta ELSE 0 END),0) AS purchasedCredits,
      COALESCE(SUM(l.delta),0) AS balance FROM students s LEFT JOIN credit_ledger_entries l ON l.user_id=s.user_id WHERE ${scope}`, [studentId, owner])
    const [refundRows] = await database.pool.query<mysql.RowDataPacket[]>(`SELECT
      SUM(c.state IN ('open','processing')) AS pending, SUM(c.state='succeeded') AS succeeded, SUM(c.state='failed') AS failed
      FROM students s LEFT JOIN payment_orders o ON o.user_id=s.user_id
      LEFT JOIN virtual_payment_cases c ON c.order_id=o.id AND c.kind='refund' WHERE ${scope}`, [studentId, owner])
    const [planRows] = await database.pool.query<mysql.RowDataPacket[]>(`SELECT COUNT(i.id) AS tasks,
      SUM(i.status='done') AS done, SUM(i.status!='done' AND i.due_date<DATE(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+08:00'))) AS overdue,
      SUM(i.status!='done' AND i.due_date BETWEEN DATE(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+08:00')) AND DATE_ADD(DATE(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+08:00')),INTERVAL 2 DAY)) AS upcoming
      FROM students s LEFT JOIN student_plans p ON p.student_id=s.id LEFT JOIN plan_items i ON i.plan_id=p.id WHERE ${scope}`, [studentId, owner])
    const [scheduleRows] = await database.pool.query<mysql.RowDataPacket[]>(`SELECT MAX(si.created_at) AS latestImport
      FROM students s LEFT JOIN schedule_imports si ON (si.student_id=s.id OR (s.user_id IS NOT NULL AND si.user_id=s.user_id)) AND si.status='parsed' WHERE ${scope}`, [studentId, owner])
    const [stillAssigned] = await database.pool.query<mysql.RowDataPacket[]>(
      'SELECT s.id FROM students s INNER JOIN student_teacher_assignments a ON a.student_id=s.id WHERE s.id=? AND a.teacher_id=? LIMIT 1', [studentId, owner])
    if (!stillAssigned.length) return reply.code(403).send({ ok: false, error: 'student_not_assigned' })
    const a=assessmentRows[0], o=orderRows[0], c=creditRows[0], p=planRows[0]
    const bound = Boolean(assigned[0]?.userId)
    return { ok: true, summary: { assessments: bound ? { total: Number(a.total || 0), succeeded: Number(a.succeeded || 0), failed: Number(a.failed || 0), lastUsed: a.lastUsed } : null,
      orders: bound ? { total: Number(o.orders || 0), paid: Number(o.paidOrders || 0), refunded: Number(o.refundedOrders || 0), paidFen: Number(o.paidFen || 0) } : null,
      credits: bound ? { purchased: Number(c.purchasedCredits || 0), balance: Number(c.balance || 0) } : null,
      refunds: bound ? { pending: Number(refundRows[0]?.pending || 0), succeeded: Number(refundRows[0]?.succeeded || 0), failed: Number(refundRows[0]?.failed || 0) } : null,
      plans: { total: Number(p.tasks || 0), done: Number(p.done || 0), overdue: Number(p.overdue || 0), upcoming: Number(p.upcoming || 0) },
      schedule: { latestImport: scheduleRows[0]?.latestImport ?? null } } }
  })
  app.get('/me/teacher/students', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const sessionUser = await resolveSessionUser(request, database)
    if (!sessionUser) {
      return reply.code(401).send({
        ok: false,
        error: 'unauthorized',
      })
    }

    if (!canAccessTeacherWorkspace(sessionUser.role as UserRole)) {
      return reply.code(403).send({
        ok: false,
        error: 'teacher_workspace_forbidden',
      })
    }

    const [teacher] = await database.db
      .select({
        id: teachers.id,
        name: teachers.name,
        title: teachers.title,
        bio: teachers.bio,
      })
      .from(teachers)
      .where(eq(teachers.userId, sessionUser.userId))
      .limit(1)

    if (!teacher) {
      return reply.code(404).send({
        ok: false,
        error: 'teacher_profile_not_bound',
      })
    }

    const assignedStudents = await database.db
      .select({
        assignmentId: studentTeacherAssignments.id,
        relationship: studentTeacherAssignments.relationship,
        assignedStageCode: studentTeacherAssignments.stageCode,
        studentId: students.id,
        name: students.name,
        university: students.university,
        major: students.major,
        currentStage: students.currentStage,
      })
      .from(studentTeacherAssignments)
      .innerJoin(
        students,
        eq(studentTeacherAssignments.studentId, students.id),
      )
      .where(eq(studentTeacherAssignments.teacherId, teacher.id))

    return {
      ok: true,
      teacher,
      students: assignedStudents,
    }
  })
}
