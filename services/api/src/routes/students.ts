import { and, asc, desc, eq, isNull, or } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import {
  coachingRecords,
  planItems,
  studentPlans,
  students,
  studentTeacherAssignments,
  teachers,
} from '../db/schema.js'
import { DEFAULT_PLAN_TITLES, STAGE_DEFINITIONS, getStageDefinition } from '../domain/classroom.js'

export function registerStudentRoutes(app: FastifyInstance, database: DatabaseContext) {
  app.get('/classroom/stages', async () => ({
    ok: true,
    stages: STAGE_DEFINITIONS,
  }))

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

    const showGuidance = stage.mode !== 'internship'

    const mentors = showGuidance
      ? await database.db
          .select({
            id: teachers.id,
            name: teachers.name,
            title: teachers.title,
            bio: teachers.bio,
            relationship: studentTeacherAssignments.relationship,
            stageCode: studentTeacherAssignments.stageCode,
          })
          .from(studentTeacherAssignments)
          .innerJoin(
            teachers,
            eq(studentTeacherAssignments.teacherId, teachers.id),
          )
          .where(
            and(
              eq(studentTeacherAssignments.studentId, student.id),
              eq(teachers.status, 'active'),
              or(
                isNull(studentTeacherAssignments.stageCode),
                eq(studentTeacherAssignments.stageCode, stage.code),
              ),
            ),
          )
          .orderBy(asc(studentTeacherAssignments.createdAt))
      : []

    let records: Array<{
      id: string
      teacherId: string | null
      teacherName: string | null
      stageCode: string
      title: string
      content: string
      occurredAt: Date
    }> = []

    if (showGuidance) {
      try {
        records = await database.db
          .select({
            id: coachingRecords.id,
            teacherId: coachingRecords.teacherId,
            teacherName: teachers.name,
            stageCode: coachingRecords.stageCode,
            title: coachingRecords.title,
            content: coachingRecords.content,
            occurredAt: coachingRecords.occurredAt,
          })
          .from(coachingRecords)
          .leftJoin(teachers, eq(coachingRecords.teacherId, teachers.id))
          .where(
            and(
              eq(coachingRecords.studentId, student.id),
              eq(coachingRecords.stageCode, stage.code),
            ),
          )
          .orderBy(desc(coachingRecords.occurredAt), desc(coachingRecords.createdAt))
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error
            ? String((error as { code?: unknown }).code ?? '')
            : ''
        if (code !== 'ER_NO_SUCH_TABLE') {
          throw error
        }
      }
    }

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
      showGuidance,
      mentors,
      records: records.map((record) => ({
        ...record,
        occurredAt: record.occurredAt.toISOString(),
      })),
      plans,
    }
  })
}
