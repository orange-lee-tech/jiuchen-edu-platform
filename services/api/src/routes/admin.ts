import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, isNull, or } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { AppEnv } from '../config/env.js'
import type { DatabaseContext } from '../db/client.js'
import {
  coachingRecords,
  internalIds,
  planItems,
  productKnowledgeDocuments,
  studentPlans,
  students,
  studentTeacherAssignments,
  teachers,
  users,
} from '../db/schema.js'
import {
  PLAN_TYPES,
  getStageDefinition,
  isGuidanceAllowed,
  isPlanTypeAllowed,
  type PlanType,
} from '../domain/classroom.js'
import { productHandbookV1Schema } from '../domain/product-handbook.js'
import { bindInternalIdentity, unbindInternalIdentity } from '../services/internal-identities.js'

const studentCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  university: z.string().trim().max(160).nullable().optional(),
  major: z.string().trim().max(160).nullable().optional(),
  currentStage: z.string().trim().max(32).nullable().optional(),
})

const studentPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    university: z.string().trim().max(160).nullable().optional(),
    major: z.string().trim().max(160).nullable().optional(),
    currentStage: z.string().trim().max(32).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')

const teacherCreateSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  title: z.string().trim().max(120).nullable().optional(),
  bio: z.string().trim().max(500).nullable().optional(),
})

const studentIdentitySchema = z.object({
  userId: z.string().uuid(),
})

const assignmentSchema = z.object({
  studentId: z.string().uuid(),
  teacherId: z.string().uuid(),
  stageCode: z.string().trim().max(32).nullable().optional(),
  relationship: z.enum(['primary', 'support']).default('primary'),
})

const planItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  target: z.string().trim().max(255).nullable().optional(),
  status: z.enum(['pending', 'in_progress', 'done']).default('pending'),
})

const planPayloadSchema = z.object({
  title: z.string().trim().min(1).max(160),
  items: z.array(planItemSchema).max(100).default([]),
})

const productKnowledgeStatusSchema = z.object({
  status: z.enum(['draft', 'active', 'archived']),
})

const coachingRecordSchema = z
  .object({
    stageCode: z.string().trim().min(1).max(32),
    teacherId: z.string().uuid().nullable().optional(),
    title: z.string().trim().min(1).max(160),
    content: z.string().trim().min(1).max(2000),
    occurredAt: z.coerce.date(),
  })
  .strict()

function ensureLocalAdmin(env: AppEnv, reply: FastifyReply) {
  if (env.NODE_ENV === 'development') {
    return true
  }

  reply.code(403).send({
    ok: false,
    error: 'admin_write_disabled',
  })
  return false
}

export function registerAdminRoutes(
  app: FastifyInstance,
  database: DatabaseContext,
  env: AppEnv,
) {
  app.get('/admin/product-knowledge', async (_request, reply) => {
    if (!ensureLocalAdmin(env, reply)) return

    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    try {
      const rows = await database.db
        .select({
          id: productKnowledgeDocuments.id,
          documentKey: productKnowledgeDocuments.documentKey,
          title: productKnowledgeDocuments.title,
          productName: productKnowledgeDocuments.productName,
          sourceFile: productKnowledgeDocuments.sourceFile,
          sourceDate: productKnowledgeDocuments.sourceDate,
          conversionVersion: productKnowledgeDocuments.conversionVersion,
          status: productKnowledgeDocuments.status,
          createdAt: productKnowledgeDocuments.createdAt,
          updatedAt: productKnowledgeDocuments.updatedAt,
        })
        .from(productKnowledgeDocuments)
        .orderBy(desc(productKnowledgeDocuments.updatedAt))

      return {
        ok: true,
        documents: rows,
      }
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        String((error as { code?: unknown }).code ?? '') === 'ER_NO_SUCH_TABLE'
      ) {
        return reply.code(503).send({
          ok: false,
          error: 'product_knowledge_schema_not_ready',
        })
      }
      throw error
    }
  })

  app.put<{
    Params: { id: string }
    Body: unknown
  }>('/admin/product-knowledge/:id/status', async (request, reply) => {
    if (!ensureLocalAdmin(env, reply)) return

    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const parsed = productKnowledgeStatusSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_product_knowledge_status',
      })
    }

    const [existing] = await database.db
      .select({
        id: productKnowledgeDocuments.id,
        contentJson: productKnowledgeDocuments.contentJson,
      })
      .from(productKnowledgeDocuments)
      .where(eq(productKnowledgeDocuments.id, request.params.id))
      .limit(1)

    if (!existing) {
      return reply.code(404).send({
        ok: false,
        error: 'product_knowledge_not_found',
      })
    }

    if (
      parsed.data.status === 'active' &&
      !productHandbookV1Schema.safeParse(existing.contentJson).success
    ) {
      return reply.code(409).send({
        ok: false,
        error: 'product_knowledge_content_invalid',
      })
    }

    await database.db
      .update(productKnowledgeDocuments)
      .set({ status: parsed.data.status })
      .where(eq(productKnowledgeDocuments.id, request.params.id))

    return {
      ok: true,
      status: parsed.data.status,
    }
  })

  app.get('/admin/students', async (_request, reply) => {
    if (!ensureLocalAdmin(env, reply)) return

    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const rows = await database.db
      .select({
        id: students.id,
        name: students.name,
        university: students.university,
        major: students.major,
        currentStage: students.currentStage,
      })
      .from(students)
      .orderBy(asc(students.createdAt))

    return {
      ok: true,
      students: rows,
    }
  })

  app.post<{ Body: unknown }>('/admin/students', async (request, reply) => {
    if (!ensureLocalAdmin(env, reply)) return

    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const parsed = studentCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_student_payload',
        issues: parsed.error.issues,
      })
    }

    if (
      parsed.data.currentStage &&
      !getStageDefinition(parsed.data.currentStage)
    ) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_stage',
      })
    }

    const id = randomUUID()
    await database.db.insert(students).values({
      id,
      name: parsed.data.name,
      university: parsed.data.university ?? null,
      major: parsed.data.major ?? null,
      currentStage: parsed.data.currentStage ?? null,
    })

    return {
      ok: true,
      student: {
        id,
        name: parsed.data.name,
        university: parsed.data.university ?? null,
        major: parsed.data.major ?? null,
        currentStage: parsed.data.currentStage ?? null,
      },
    }
  })

  app.get('/admin/identities', async (_request, reply) => {
    if (!ensureLocalAdmin(env, reply)) return

    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const rows = await database.db
      .select({
        id: users.id,
        role: users.role,
        displayName: users.displayName,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.createdAt))

    const identities = await Promise.all(
      rows.map(async (user) => {
        const [student] = await database.db
          .select({
            id: students.id,
            name: students.name,
          })
          .from(students)
          .where(eq(students.userId, user.id))
          .limit(1)

        const [teacher] = await database.db
          .select({
            id: teachers.id,
            name: teachers.name,
          })
          .from(teachers)
          .where(eq(teachers.userId, user.id))
          .limit(1)

        return {
          ...user,
          student: student ?? null,
          teacher: teacher ?? null,
        }
      }),
    )

    return {
      ok: true,
      identities,
    }
  })

  app.get('/admin/internal-ids', async (_request, reply) => {
    if (!ensureLocalAdmin(env, reply)) return

    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const rows = await database.db
      .select({
        id: internalIds.id,
        businessId: internalIds.businessId,
        type: internalIds.type,
        claimMode: internalIds.claimMode,
        status: internalIds.status,
        userId: internalIds.userId,
        entityId: internalIds.entityId,
        batch: internalIds.batch,
      })
      .from(internalIds)
      .orderBy(asc(internalIds.createdAt))

    return {
      ok: true,
      internalIds: rows,
    }
  })

  app.post<{
    Params: { id: string }
    Body: unknown
  }>('/admin/internal-ids/:id/bind', async (request, reply) => {
    if (!ensureLocalAdmin(env, reply)) return

    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const parsed = studentIdentitySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_identity_payload',
      })
    }

    try {
      const identity = await bindInternalIdentity(
        database,
        request.params.id,
        parsed.data.userId,
      )
      return {
        ok: true,
        identity,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'bind_failed'
      return reply.code(409).send({
        ok: false,
        error: message,
      })
    }
  })

  app.post<{ Params: { id: string } }>(
    '/admin/internal-ids/:id/unbind',
    async (request, reply) => {
      if (!ensureLocalAdmin(env, reply)) return

      if (!database.configured) {
        return reply.code(503).send({
          ok: false,
          error: 'database_not_configured',
        })
      }

      try {
        await unbindInternalIdentity(database, request.params.id)
        return { ok: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unbind_failed'
        return reply.code(409).send({
          ok: false,
          error: message,
        })
      }
    },
  )

  app.get('/admin/teachers', async (_request, reply) => {
    if (!ensureLocalAdmin(env, reply)) return

    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const rows = await database.db
      .select({
        id: teachers.id,
        userId: teachers.userId,
        name: teachers.name,
        title: teachers.title,
        bio: teachers.bio,
        status: teachers.status,
      })
      .from(teachers)
      .orderBy(asc(teachers.createdAt))

    return {
      ok: true,
      teachers: rows,
    }
  })

  app.post<{ Body: unknown }>('/admin/teachers', async (request, reply) => {
    if (!ensureLocalAdmin(env, reply)) return

    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const parsed = teacherCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_teacher_payload',
        issues: parsed.error.issues,
      })
    }

    const [user] = await database.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, parsed.data.userId))
      .limit(1)

    if (!user) {
      return reply.code(404).send({
        ok: false,
        error: 'user_not_found',
      })
    }

    const [existing] = await database.db
      .select({ id: teachers.id })
      .from(teachers)
      .where(eq(teachers.userId, parsed.data.userId))
      .limit(1)

    if (existing) {
      return reply.code(409).send({
        ok: false,
        error: 'teacher_already_bound',
      })
    }

    const [studentBinding] = await database.db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.userId, parsed.data.userId))
      .limit(1)

    if (studentBinding) {
      return reply.code(409).send({
        ok: false,
        error: 'user_already_bound_to_student',
      })
    }

    const id = randomUUID()
    await database.db.transaction(async (tx) => {
      await tx.insert(teachers).values({
        id,
        userId: parsed.data.userId,
        name: parsed.data.name,
        title: parsed.data.title ?? null,
        bio: parsed.data.bio ?? null,
      })
      await tx
        .update(users)
        .set({ role: 'teacher' })
        .where(eq(users.id, parsed.data.userId))
    })

    return {
      ok: true,
      teacher: {
        id,
        userId: parsed.data.userId,
        name: parsed.data.name,
        title: parsed.data.title ?? null,
        bio: parsed.data.bio ?? null,
        status: 'active',
      },
    }
  })

  app.put<{
    Params: { id: string }
    Body: unknown
  }>('/admin/students/:id/identity', async (request, reply) => {
    if (!ensureLocalAdmin(env, reply)) return

    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const parsed = studentIdentitySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_identity_payload',
      })
    }

    const [user] = await database.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, parsed.data.userId))
      .limit(1)

    if (!user) {
      return reply.code(404).send({
        ok: false,
        error: 'user_not_found',
      })
    }

    const [student] = await database.db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, request.params.id))
      .limit(1)

    if (!student) {
      return reply.code(404).send({
        ok: false,
        error: 'student_not_found',
      })
    }

    const [existingStudentBinding] = await database.db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.userId, parsed.data.userId))
      .limit(1)

    if (existingStudentBinding && existingStudentBinding.id !== request.params.id) {
      return reply.code(409).send({
        ok: false,
        error: 'user_already_bound_to_student',
      })
    }

    const [teacherBinding] = await database.db
      .select({ id: teachers.id })
      .from(teachers)
      .where(eq(teachers.userId, parsed.data.userId))
      .limit(1)

    if (teacherBinding) {
      return reply.code(409).send({
        ok: false,
        error: 'user_already_bound_to_teacher',
      })
    }

    await database.db.transaction(async (tx) => {
      await tx
        .update(students)
        .set({ userId: parsed.data.userId })
        .where(eq(students.id, request.params.id))
      await tx
        .update(users)
        .set({ role: 'student' })
        .where(eq(users.id, parsed.data.userId))
    })

    return {
      ok: true,
    }
  })

  app.get('/admin/student-teacher-assignments', async (_request, reply) => {
    if (!ensureLocalAdmin(env, reply)) return

    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const rows = await database.db
      .select({
        id: studentTeacherAssignments.id,
        studentId: students.id,
        studentName: students.name,
        teacherId: teachers.id,
        teacherName: teachers.name,
        stageCode: studentTeacherAssignments.stageCode,
        relationship: studentTeacherAssignments.relationship,
      })
      .from(studentTeacherAssignments)
      .innerJoin(students, eq(studentTeacherAssignments.studentId, students.id))
      .innerJoin(teachers, eq(studentTeacherAssignments.teacherId, teachers.id))
      .orderBy(asc(studentTeacherAssignments.createdAt))

    return {
      ok: true,
      assignments: rows,
    }
  })

  app.post<{ Body: unknown }>(
    '/admin/student-teacher-assignments',
    async (request, reply) => {
      if (!ensureLocalAdmin(env, reply)) return

      if (!database.configured) {
        return reply.code(503).send({
          ok: false,
          error: 'database_not_configured',
        })
      }

      const parsed = assignmentSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          error: 'invalid_assignment_payload',
          issues: parsed.error.issues,
        })
      }

      const [student] = await database.db
        .select({ id: students.id })
        .from(students)
        .where(eq(students.id, parsed.data.studentId))
        .limit(1)

      const [teacher] = await database.db
        .select({ id: teachers.id })
        .from(teachers)
        .where(eq(teachers.id, parsed.data.teacherId))
        .limit(1)

      if (!student || !teacher) {
        return reply.code(404).send({
          ok: false,
          error: 'student_or_teacher_not_found',
        })
      }

      if (
        parsed.data.stageCode &&
        !getStageDefinition(parsed.data.stageCode)
      ) {
        return reply.code(400).send({
          ok: false,
          error: 'invalid_stage',
        })
      }

      const [duplicate] = await database.db
        .select({ id: studentTeacherAssignments.id })
        .from(studentTeacherAssignments)
        .where(
          and(
            eq(studentTeacherAssignments.studentId, parsed.data.studentId),
            eq(studentTeacherAssignments.teacherId, parsed.data.teacherId),
            parsed.data.stageCode
              ? eq(studentTeacherAssignments.stageCode, parsed.data.stageCode)
              : isNull(studentTeacherAssignments.stageCode),
            eq(studentTeacherAssignments.relationship, parsed.data.relationship),
          ),
        )
        .limit(1)

      if (duplicate) {
        return reply.code(409).send({
          ok: false,
          error: 'assignment_already_exists',
        })
      }

      const id = randomUUID()
      await database.db.insert(studentTeacherAssignments).values({
        id,
        studentId: parsed.data.studentId,
        teacherId: parsed.data.teacherId,
        stageCode: parsed.data.stageCode ?? null,
        relationship: parsed.data.relationship,
      })

      return {
        ok: true,
        assignment: {
          id,
          ...parsed.data,
        },
      }
    },
  )

  app.get<{
    Params: { studentId: string }
    Querystring: { stage?: string }
  }>('/admin/students/:studentId/coaching-records', async (request, reply) => {
    if (!ensureLocalAdmin(env, reply)) return

    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    if (request.query.stage && !getStageDefinition(request.query.stage)) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_stage',
      })
    }

    try {
      const rows = await database.db
        .select({
          id: coachingRecords.id,
          studentId: coachingRecords.studentId,
          teacherId: coachingRecords.teacherId,
          teacherName: teachers.name,
          stageCode: coachingRecords.stageCode,
          title: coachingRecords.title,
          content: coachingRecords.content,
          occurredAt: coachingRecords.occurredAt,
          createdAt: coachingRecords.createdAt,
        })
        .from(coachingRecords)
        .leftJoin(teachers, eq(coachingRecords.teacherId, teachers.id))
        .where(
          request.query.stage
            ? and(
                eq(coachingRecords.studentId, request.params.studentId),
                eq(coachingRecords.stageCode, request.query.stage),
              )
            : eq(coachingRecords.studentId, request.params.studentId),
        )
        .orderBy(desc(coachingRecords.occurredAt), desc(coachingRecords.createdAt))

      return {
        ok: true,
        records: rows.map((row) => ({
          ...row,
          occurredAt: row.occurredAt.toISOString(),
          createdAt: row.createdAt.toISOString(),
        })),
      }
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : ''
      if (code === 'ER_NO_SUCH_TABLE') {
        return reply.code(503).send({
          ok: false,
          error: 'classroom_guidance_schema_not_ready',
        })
      }
      throw error
    }
  })

  app.post<{
    Params: { studentId: string }
    Body: unknown
  }>('/admin/students/:studentId/coaching-records', async (request, reply) => {
    if (!ensureLocalAdmin(env, reply)) return

    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const parsed = coachingRecordSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_coaching_record_payload',
        issues: parsed.error.issues,
      })
    }

    const stage = getStageDefinition(parsed.data.stageCode)
    if (!stage) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_stage',
      })
    }

    if (!isGuidanceAllowed(stage.code)) {
      return reply.code(400).send({
        ok: false,
        error: 'guidance_not_allowed_for_stage',
      })
    }

    const [student] = await database.db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, request.params.studentId))
      .limit(1)

    if (!student) {
      return reply.code(404).send({
        ok: false,
        error: 'student_not_found',
      })
    }

    if (parsed.data.teacherId) {
      const [assignment] = await database.db
        .select({ id: studentTeacherAssignments.id })
        .from(studentTeacherAssignments)
        .where(
          and(
            eq(studentTeacherAssignments.studentId, request.params.studentId),
            eq(studentTeacherAssignments.teacherId, parsed.data.teacherId),
            or(
              isNull(studentTeacherAssignments.stageCode),
              eq(studentTeacherAssignments.stageCode, stage.code),
            ),
          ),
        )
        .limit(1)

      if (!assignment) {
        return reply.code(409).send({
          ok: false,
          error: 'teacher_not_assigned_to_student_stage',
        })
      }
    }

    const id = randomUUID()

    try {
      await database.db.insert(coachingRecords).values({
        id,
        studentId: request.params.studentId,
        teacherId: parsed.data.teacherId ?? null,
        stageCode: stage.code,
        title: parsed.data.title,
        content: parsed.data.content,
        occurredAt: parsed.data.occurredAt,
      })
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : ''
      if (code === 'ER_NO_SUCH_TABLE') {
        return reply.code(503).send({
          ok: false,
          error: 'classroom_guidance_schema_not_ready',
        })
      }
      throw error
    }

    return {
      ok: true,
      record: {
        id,
        studentId: request.params.studentId,
        teacherId: parsed.data.teacherId ?? null,
        stageCode: stage.code,
        title: parsed.data.title,
        content: parsed.data.content,
        occurredAt: parsed.data.occurredAt.toISOString(),
      },
    }
  })

  app.put<{
    Params: { id: string }
    Body: unknown
  }>('/admin/coaching-records/:id', async (request, reply) => {
    if (!ensureLocalAdmin(env, reply)) return

    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const parsed = coachingRecordSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_coaching_record_payload',
        issues: parsed.error.issues,
      })
    }

    const stage = getStageDefinition(parsed.data.stageCode)
    if (!stage) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_stage',
      })
    }

    if (!isGuidanceAllowed(stage.code)) {
      return reply.code(400).send({
        ok: false,
        error: 'guidance_not_allowed_for_stage',
      })
    }

    const [existing] = await database.db
      .select({
        id: coachingRecords.id,
        studentId: coachingRecords.studentId,
      })
      .from(coachingRecords)
      .where(eq(coachingRecords.id, request.params.id))
      .limit(1)

    if (!existing) {
      return reply.code(404).send({
        ok: false,
        error: 'coaching_record_not_found',
      })
    }

    if (parsed.data.teacherId) {
      const [assignment] = await database.db
        .select({ id: studentTeacherAssignments.id })
        .from(studentTeacherAssignments)
        .where(
          and(
            eq(studentTeacherAssignments.studentId, existing.studentId),
            eq(studentTeacherAssignments.teacherId, parsed.data.teacherId),
            or(
              isNull(studentTeacherAssignments.stageCode),
              eq(studentTeacherAssignments.stageCode, stage.code),
            ),
          ),
        )
        .limit(1)

      if (!assignment) {
        return reply.code(409).send({
          ok: false,
          error: 'teacher_not_assigned_to_student_stage',
        })
      }
    }

    await database.db
      .update(coachingRecords)
      .set({
        teacherId: parsed.data.teacherId ?? null,
        stageCode: stage.code,
        title: parsed.data.title,
        content: parsed.data.content,
        occurredAt: parsed.data.occurredAt,
      })
      .where(eq(coachingRecords.id, request.params.id))

    return { ok: true }
  })

  app.delete<{ Params: { id: string } }>(
    '/admin/coaching-records/:id',
    async (request, reply) => {
      if (!ensureLocalAdmin(env, reply)) return

      if (!database.configured) {
        return reply.code(503).send({
          ok: false,
          error: 'database_not_configured',
        })
      }

      await database.db
        .delete(coachingRecords)
        .where(eq(coachingRecords.id, request.params.id))

      return { ok: true }
    },
  )

  app.put<{
    Params: { id: string }
    Body: unknown
  }>('/admin/students/:id', async (request, reply) => {
    if (!ensureLocalAdmin(env, reply)) return

    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const parsed = studentPatchSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_student_payload',
        issues: parsed.error.issues,
      })
    }

    if (
      parsed.data.currentStage !== undefined &&
      parsed.data.currentStage !== null &&
      !getStageDefinition(parsed.data.currentStage)
    ) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_stage',
      })
    }

    await database.db
      .update(students)
      .set(parsed.data)
      .where(eq(students.id, request.params.id))

    const [student] = await database.db
      .select({
        id: students.id,
        name: students.name,
        university: students.university,
        major: students.major,
        currentStage: students.currentStage,
      })
      .from(students)
      .where(eq(students.id, request.params.id))
      .limit(1)

    if (!student) {
      return reply.code(404).send({
        ok: false,
        error: 'student_not_found',
      })
    }

    return {
      ok: true,
      student,
    }
  })

  app.put<{
    Params: {
      studentId: string
      stageCode: string
      planType: string
    }
    Body: unknown
  }>(
    '/admin/students/:studentId/classroom/:stageCode/:planType',
    async (request, reply) => {
      if (!ensureLocalAdmin(env, reply)) return

      if (!database.configured) {
        return reply.code(503).send({
          ok: false,
          error: 'database_not_configured',
        })
      }

      if (!PLAN_TYPES.includes(request.params.planType as PlanType)) {
        return reply.code(400).send({
          ok: false,
          error: 'invalid_plan_type',
        })
      }

      const planType = request.params.planType as PlanType
      const stage = getStageDefinition(request.params.stageCode)

      if (!stage || !isPlanTypeAllowed(stage.code, planType)) {
        return reply.code(400).send({
          ok: false,
          error: 'plan_type_not_allowed_for_stage',
        })
      }

      const parsed = planPayloadSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          error: 'invalid_plan_payload',
          issues: parsed.error.issues,
        })
      }

      const [student] = await database.db
        .select({ id: students.id })
        .from(students)
        .where(eq(students.id, request.params.studentId))
        .limit(1)

      if (!student) {
        return reply.code(404).send({
          ok: false,
          error: 'student_not_found',
        })
      }

      const [existingPlan] = await database.db
        .select({
          id: studentPlans.id,
        })
        .from(studentPlans)
        .where(
          and(
            eq(studentPlans.studentId, request.params.studentId),
            eq(studentPlans.stageCode, stage.code),
            eq(studentPlans.type, planType),
          ),
        )
        .limit(1)

      const planId = existingPlan?.id ?? randomUUID()

      await database.db.transaction(async (tx) => {
        if (existingPlan) {
          await tx
            .update(studentPlans)
            .set({ title: parsed.data.title })
            .where(eq(studentPlans.id, planId))
        } else {
          await tx.insert(studentPlans).values({
            id: planId,
            studentId: request.params.studentId,
            stageCode: stage.code,
            type: planType,
            title: parsed.data.title,
          })
        }

        await tx.delete(planItems).where(eq(planItems.planId, planId))

        if (parsed.data.items.length > 0) {
          await tx.insert(planItems).values(
            parsed.data.items.map((item, index) => ({
              id: randomUUID(),
              planId,
              sortOrder: index,
              name: item.name,
              target: item.target ?? null,
              status: item.status,
            })),
          )
        }
      })

      const items = await database.db
        .select({
          id: planItems.id,
          sortOrder: planItems.sortOrder,
          name: planItems.name,
          target: planItems.target,
          status: planItems.status,
        })
        .from(planItems)
        .where(eq(planItems.planId, planId))
        .orderBy(asc(planItems.sortOrder))

      return {
        ok: true,
        plan: {
          id: planId,
          studentId: request.params.studentId,
          stageCode: stage.code,
          type: planType,
          title: parsed.data.title,
          items,
        },
      }
    },
  )
}
