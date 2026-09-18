import { randomUUID } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { AppEnv } from '../config/env.js'
import type { DatabaseContext } from '../db/client.js'
import {
  planItems,
  studentPlans,
  students,
  studentTeacherAssignments,
  teachers,
  users,
} from '../db/schema.js'
import {
  PLAN_TYPES,
  getStageDefinition,
  isPlanTypeAllowed,
  type PlanType,
} from '../domain/classroom.js'

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
