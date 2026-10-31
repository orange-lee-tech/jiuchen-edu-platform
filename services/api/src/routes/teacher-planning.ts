import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type mysql from 'mysql2/promise'
import { z } from 'zod'
import type { DatabaseContext } from '../db/client.js'
import { PLAN_TYPES, isPlanTypeAllowed } from '../domain/classroom.js'
import { planDueDateSchema } from '../domain/plan-dates.js'
import { resolveSessionUser } from '../services/session.js'
import { applyApprovedPlan } from './classroom-workspace.js'
import { isTeacherSchemaError, teacherRouteError } from './teacher-errors.js'

export const teacherPlanSchema = z.object({
  stageCode: z.string().max(32),
  type: z.enum(PLAN_TYPES),
  title: z.string().trim().min(1).max(160),
  items: z.array(z.object({
    name: z.string().trim().min(1).max(160),
    target: z.string().trim().max(255).nullable().optional(),
    dueDate: planDueDateSchema.nullable().optional(),
    status: z.enum(['pending', 'in_progress', 'done']).default('pending'),
  }).strict()).max(50),
}).strict().refine(value => isPlanTypeAllowed(value.stageCode, value.type), { message: 'invalid_plan_type_for_stage' })
const templateSchema = z.object({ name: z.string().trim().min(1).max(160), plan: teacherPlanSchema }).strict()
const targetsSchema = z.object({ studentIds: z.array(z.uuid()).min(1).max(100) }).strict()
const batchSchema = z.object({ studentIds: z.array(z.uuid()).min(1).max(100), plan: teacherPlanSchema }).strict()
type TeacherPlan = z.infer<typeof teacherPlanSchema>
type TemplateRow = mysql.RowDataPacket & { id: string; name: string; stageCode: string; type: string; title: string; itemsJson: unknown; updatedAt: unknown }

function templateView(row: TemplateRow) {
  const items = typeof row.itemsJson === 'string' ? JSON.parse(row.itemsJson) : row.itemsJson
  return { id: row.id, name: row.name, plan: teacherPlanSchema.parse({ stageCode: row.stageCode, type: row.type, title: row.title, items }), updatedAt: row.updatedAt }
}

export function registerTeacherPlanningRoutes(app: FastifyInstance, database: DatabaseContext) {
  async function owner(request: FastifyRequest, reply: FastifyReply) {
    if (!database.configured) { reply.code(503).send({ ok: false, error: 'database_not_configured' }); return null }
    const user = await resolveSessionUser(request, database)
    if (!user) { reply.code(401).send({ ok: false, error: 'unauthorized' }); return null }
    if (user.role !== 'teacher' || ('readOnly' in user && user.readOnly)) {
      reply.code(403).send({ ok: false, error: 'teacher_planning_forbidden' }); return null
    }
    const [rows] = await database.pool.query<mysql.RowDataPacket[]>("SELECT id FROM teachers WHERE user_id=? AND status='active' LIMIT 1", [user.userId])
    if (!rows[0]) { reply.code(403).send({ ok: false, error: 'teacher_profile_not_bound' }); return null }
    return { teacherId: String(rows[0].id), userId: user.userId }
  }
  async function readTemplate(id: string, teacherId: string) {
    if (!database.configured) return null
    const [rows] = await database.pool.query<TemplateRow[]>(
      'SELECT id,name,stage_code AS stageCode,type,title,items_json AS itemsJson,updated_at AS updatedAt FROM teacher_plan_templates WHERE id=? AND teacher_id=? LIMIT 1', [id, teacherId])
    return rows[0] ? templateView(rows[0]) : null
  }
  async function apply(plan: TeacherPlan, studentIds: string[], userId: string) {
    if (!database.configured) throw new Error('database_not_configured')
    const results = []
    // Each learner has an independent transaction. A failure never rolls back another learner.
    for (const studentId of new Set(studentIds)) {
      try {
        const planId = await applyApprovedPlan(database, studentId, plan.stageCode, plan.type, plan.title, plan.items, userId, userId)
        results.push({ studentId, ok: true as const, planId })
      } catch (error) {
        const code = error instanceof Error && error.message === 'teacher_student_forbidden' ? 'student_not_assigned'
          : isTeacherSchemaError(error) ? 'teacher_schema_not_ready' : 'plan_save_failed'
        results.push({ studentId, ok: false as const, error: code })
      }
    }
    return { ok: true, results }
  }
  app.get('/me/teacher/plan-templates', { errorHandler: teacherRouteError }, async (request, reply) => {
    const actor = await owner(request, reply); if (!actor || !database.configured) return
    const [rows] = await database.pool.query<TemplateRow[]>(
      'SELECT id,name,stage_code AS stageCode,type,title,items_json AS itemsJson,updated_at AS updatedAt FROM teacher_plan_templates WHERE teacher_id=? ORDER BY updated_at DESC,id LIMIT 200', [actor.teacherId])
    return { ok: true, templates: rows.map(templateView) }
  })
  app.post<{ Body: unknown }>('/me/teacher/plan-templates', { errorHandler: teacherRouteError }, async (request, reply) => {
    const actor = await owner(request, reply); if (!actor || !database.configured) return
    const parsed = templateSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_teacher_template' })
    const { name, plan } = parsed.data, id = randomUUID()
    await database.pool.execute('INSERT INTO teacher_plan_templates (id,teacher_id,name,stage_code,type,title,items_json) VALUES (?,?,?,?,?,?,?)',
      [id, actor.teacherId, name, plan.stageCode, plan.type, plan.title, JSON.stringify(plan.items)])
    return reply.code(201).send({ ok: true, id })
  })
  app.put<{ Params: { id: string }; Body: unknown }>('/me/teacher/plan-templates/:id', { errorHandler: teacherRouteError }, async (request, reply) => {
    const actor = await owner(request, reply); if (!actor || !database.configured) return
    const parsed = templateSchema.safeParse(request.body)
    if (!z.uuid().safeParse(request.params.id).success || !parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_teacher_template' })
    if (!await readTemplate(request.params.id, actor.teacherId)) return reply.code(404).send({ ok: false, error: 'teacher_template_not_found' })
    const { name, plan } = parsed.data
    const [result] = await database.pool.execute<mysql.ResultSetHeader>('UPDATE teacher_plan_templates SET name=?,stage_code=?,type=?,title=?,items_json=? WHERE id=? AND teacher_id=?',
      [name, plan.stageCode, plan.type, plan.title, JSON.stringify(plan.items), request.params.id, actor.teacherId])
    if (!result.affectedRows && !await readTemplate(request.params.id, actor.teacherId)) return reply.code(404).send({ ok: false, error: 'teacher_template_not_found' })
    return { ok: true }
  })
  app.delete<{ Params: { id: string } }>('/me/teacher/plan-templates/:id', { errorHandler: teacherRouteError }, async (request, reply) => {
    const actor = await owner(request, reply); if (!actor || !database.configured) return
    if (!z.uuid().safeParse(request.params.id).success) return reply.code(400).send({ ok: false, error: 'invalid_teacher_template' })
    const [result] = await database.pool.execute<mysql.ResultSetHeader>('DELETE FROM teacher_plan_templates WHERE id=? AND teacher_id=?', [request.params.id, actor.teacherId])
    if (!result.affectedRows) return reply.code(404).send({ ok: false, error: 'teacher_template_not_found' })
    return { ok: true }
  })
  app.post<{ Params: { id: string }; Body: unknown }>('/me/teacher/plan-templates/:id/copy', { errorHandler: teacherRouteError }, async (request, reply) => {
    const actor = await owner(request, reply); if (!actor || !database.configured) return
    if (!z.uuid().safeParse(request.params.id).success) return reply.code(400).send({ ok: false, error: 'invalid_teacher_template' })
    const template = await readTemplate(request.params.id, actor.teacherId)
    if (!template) return reply.code(404).send({ ok: false, error: 'teacher_template_not_found' })
    const parsed = z.object({ name: z.string().trim().min(1).max(160).optional() }).strict().safeParse(request.body ?? {})
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_teacher_template' })
    const id = randomUUID(), plan = template.plan
    await database.pool.execute('INSERT INTO teacher_plan_templates (id,teacher_id,name,stage_code,type,title,items_json) VALUES (?,?,?,?,?,?,?)',
      [id, actor.teacherId, parsed.data.name || (template.name.slice(0, 150) + ' 副本'), plan.stageCode, plan.type, plan.title, JSON.stringify(plan.items)])
    return reply.code(201).send({ ok: true, id })
  })
  app.post<{ Body: unknown }>('/me/teacher/plans/apply', { errorHandler: teacherRouteError }, async (request, reply) => {
    const actor = await owner(request, reply); if (!actor) return
    const parsed = batchSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_teacher_plan_batch' })
    return apply(parsed.data.plan, parsed.data.studentIds, actor.userId)
  })
  app.post<{ Params: { id: string }; Body: unknown }>('/me/teacher/plan-templates/:id/apply', { errorHandler: teacherRouteError }, async (request, reply) => {
    const actor = await owner(request, reply); if (!actor) return
    const parsed = targetsSchema.safeParse(request.body)
    if (!z.uuid().safeParse(request.params.id).success || !parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_teacher_plan_batch' })
    const template = await readTemplate(request.params.id, actor.teacherId)
    if (!template) return reply.code(404).send({ ok: false, error: 'teacher_template_not_found' })
    return apply(template.plan, parsed.data.studentIds, actor.userId)
  })
}
