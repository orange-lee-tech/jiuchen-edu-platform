import { randomUUID } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { AppEnv } from '../config/env.js'
import type { DatabaseContext } from '../db/client.js'
import { planItems, studentPlans, students } from '../db/schema.js'
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
