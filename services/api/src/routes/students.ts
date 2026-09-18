import { and, asc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import { planItems, studentPlans, students } from '../db/schema.js'
import { DEFAULT_PLAN_TITLES, getStageDefinition } from '../domain/classroom.js'

export function registerStudentRoutes(app: FastifyInstance, database: DatabaseContext) {
  app.get<{ Params: { id: string } }>('/students/:id', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

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

  app.get<{
    Params: { id: string }
    Querystring: { stage?: string }
  }>('/students/:id/classroom', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

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

    const stageCode = request.query.stage ?? student.currentStage
    const stage = getStageDefinition(stageCode)

    if (!stage) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_stage',
      })
    }

    const storedPlans = await database.db
      .select({
        id: studentPlans.id,
        type: studentPlans.type,
        title: studentPlans.title,
      })
      .from(studentPlans)
      .where(
        and(
          eq(studentPlans.studentId, student.id),
          eq(studentPlans.stageCode, stage.code),
        ),
      )

    const plans = await Promise.all(
      stage.planTypes.map(async (type) => {
        const storedPlan = storedPlans.find((plan) => plan.type === type)

        if (!storedPlan) {
          return {
            id: null,
            type,
            title: DEFAULT_PLAN_TITLES[type],
            items: [],
          }
        }

        const items = await database.db
          .select({
            id: planItems.id,
            sortOrder: planItems.sortOrder,
            name: planItems.name,
            target: planItems.target,
            status: planItems.status,
          })
          .from(planItems)
          .where(eq(planItems.planId, storedPlan.id))
          .orderBy(asc(planItems.sortOrder))

        return {
          ...storedPlan,
          items,
        }
      }),
    )

    return {
      ok: true,
      student,
      stage,
      showGuidance: stage.mode !== 'internship',
      plans,
    }
  })
}
