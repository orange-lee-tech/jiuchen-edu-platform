import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppEnv } from '../config/env.js'
import type { DatabaseContext } from '../db/client.js'
import {
  coachingRecords,
  planItems,
  planRevisions,
  scheduleImports,
  studentPlans,
  students,
  userProfiles,
  studentTeacherAssignments,
  teachers,
} from '../db/schema.js'
import {
  DEFAULT_PLAN_TITLES,
  PLAN_TYPES,
  getStageDefinition,
  isGuidanceAllowed,
  isPlanTypeAllowed,
  type PlanType,
} from '../domain/classroom.js'
import { createScheduleAIProvider } from '../services/ai-provider.js'
import {
  createManualScheduleFallback,
  isOwnedScheduleImportFile,
  isSupportedScheduleFileName,
  normalizeEditableSchedule,
  isScheduleFirstMonday,
  parseImageSchedule,
  parseSpreadsheetSchedule,
} from '../services/schedule-parser.js'
import { createScheduleStorageProvider } from '../services/schedule-storage.js'
import { resolveSessionUser } from '../services/session.js'
import { suggestAcademicStage } from '../domain/academic-stage.js'

const itemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  target: z.string().trim().max(255).nullable().optional(),
  status: z.enum(['pending', 'in_progress', 'done']).default('pending'),
})

const planSchema = z.object({
  title: z.string().trim().min(1).max(160),
  items: z.array(itemSchema).max(50),
})

export const scheduleTermStageSchema = z.enum([
  'freshman-fall', 'freshman-spring', 'sophomore-fall', 'sophomore-spring',
  'junior-fall', 'junior-spring', 'senior-fall', 'senior-spring',
])
const scheduleImportSchema = z.object({
  fileID: z.string().min(1).max(1000),
  fileName: z.string().min(1).max(255),
  sourceType: z.enum(['spreadsheet', 'image']),
  stageCode: scheduleTermStageSchema,
}).strict()

type PlanItemPayload = z.infer<typeof itemSchema>

function isMissingTableError(error: unknown) {
  const seen = new Set<unknown>()
  let current: unknown = error

  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== 'object' || seen.has(current)) {
      return false
    }
    seen.add(current)
    const candidate = current as {
      code?: unknown
      errno?: unknown
      sqlState?: unknown
      cause?: unknown
    }
    if (
      String(candidate.code ?? '') === 'ER_NO_SUCH_TABLE' ||
      Number(candidate.errno) === 1146 ||
      String(candidate.sqlState ?? '') === '42S02'
    ) {
      return true
    }
    current = candidate.cause
  }
  return false
}

async function resolveStudentByUser(
  database: DatabaseContext & { configured: true },
  userId: string,
) {
  const [student] = await database.db
    .select({
      id: students.id,
      name: students.name,
      university: students.university,
      major: students.major,
      currentStage: students.currentStage,
    })
    .from(students)
    .where(eq(students.userId, userId))
    .limit(1)
  return student ?? null
}

export async function teacherCanAccessStudent(
  database: DatabaseContext & { configured: true },
  userId: string,
  role: string,
  studentId: string,
) {
  if (role === 'admin' || role === 'staff') return true
  if (role !== 'teacher') return false

  const [teacher] = await database.db
    .select({ id: teachers.id })
    .from(teachers)
    .where(eq(teachers.userId, userId))
    .limit(1)
  if (!teacher) return false

  const [assignment] = await database.db
    .select({ id: studentTeacherAssignments.id })
    .from(studentTeacherAssignments)
    .where(
      and(
        eq(studentTeacherAssignments.teacherId, teacher.id),
        eq(studentTeacherAssignments.studentId, studentId),
      ),
    )
    .limit(1)
  return Boolean(assignment)
}

export async function applyApprovedPlan(
  database: DatabaseContext & { configured: true },
  studentId: string,
  stageCode: string,
  type: PlanType,
  title: string,
  items: PlanItemPayload[],
  editorUserId: string,
) {
  return database.db.transaction(async (tx) => {
    // Serialize edits to this student's plans without changing the existing schema.
    await tx.execute(sql`SELECT id FROM students WHERE id = ${studentId} FOR UPDATE`)
    const [existing] = await tx.select({ id: studentPlans.id }).from(studentPlans)
      .where(and(eq(studentPlans.studentId, studentId), eq(studentPlans.stageCode, stageCode), eq(studentPlans.type, type)))
      .limit(1)
    const planId = existing?.id ?? randomUUID()
    if (existing) {
      await tx.update(studentPlans).set({ title }).where(eq(studentPlans.id, planId))
      await tx.delete(planItems).where(eq(planItems.planId, planId))
    } else {
      await tx.insert(studentPlans).values({ id: planId, studentId, stageCode, type, title })
    }
    if (items.length) {
      await tx.insert(planItems).values(items.map((item, index) => ({
        id: randomUUID(), planId, sortOrder: index, name: item.name,
        target: item.target ?? null, status: item.status,
      })))
    }
    // Older pending revisions remain in history, but can never supersede this save.
    await tx.update(planRevisions).set({
      status: 'rejected', reviewNote: '审批机制已停用，已由直接保存的计划替代',
      reviewedByUserId: editorUserId, reviewedAt: new Date(),
    }).where(and(eq(planRevisions.studentId, studentId), eq(planRevisions.stageCode, stageCode),
      eq(planRevisions.type, type), eq(planRevisions.status, 'pending')))
    return planId
  })
}

export async function loadClassroom(
  database: DatabaseContext & { configured: true },
  student: {
    id: string
    name: string
    university: string | null
    major: string | null
    currentStage: string | null
  },
  stageCode: string | null | undefined,
) {
  const stage = getStageDefinition(stageCode ?? student.currentStage)
  if (!stage) throw new Error('invalid_stage')

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
      const stored = storedPlans.find((plan) => plan.type === type)
      if (!stored) {
        return {
          id: null,
          type,
          title: DEFAULT_PLAN_TITLES[type],
          items: [],
          revisionStatus: 'none' as const,
          revisionId: null,
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
        .where(eq(planItems.planId, stored.id))
        .orderBy(asc(planItems.sortOrder))

      return {
        ...stored,
        items,
        revisionStatus: 'approved' as const,
        revisionId: null,
      }
    }),
  )

  const showGuidance = isGuidanceAllowed(stage.code)

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
        .innerJoin(teachers, eq(studentTeacherAssignments.teacherId, teachers.id))
        .where(eq(studentTeacherAssignments.studentId, student.id))
        .orderBy(asc(studentTeacherAssignments.createdAt))
    : []

  let guidanceRecordsReady = true
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
        .orderBy(desc(coachingRecords.occurredAt))
    } catch (error) {
      if (!isMissingTableError(error)) throw error
      guidanceRecordsReady = false
      records = []
    }
  }

  return {
    ok: true as const,
    student,
    stage,
    showGuidance,
    mentors,
    guidanceRecordsReady,
    records: records.map((record) => ({
      ...record,
      occurredAt: record.occurredAt.toISOString(),
    })),
    plans,
  }
}

export function registerClassroomWorkspaceRoutes(
  app: FastifyInstance,
  database: DatabaseContext,
  env: AppEnv,
) {
  const scheduleStorage = createScheduleStorageProvider(env)
  const scheduleImageAI = createScheduleAIProvider(env)

  app.get('/me/classroom/stage-suggestion', async (request, reply) => {
    if (!database.configured) return reply.code(503).send({ ok: false, error: 'database_not_configured' })
    const session = await resolveSessionUser(request, database)
    if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })
    if (session.role !== 'student' || ('readOnly' in session && session.readOnly)) return reply.code(403).send({ ok: false, error: 'student_stage_edit_forbidden' })
    const student = await resolveStudentByUser(database, session.userId)
    if (!student) return reply.code(404).send({ ok: false, error: 'student_profile_not_bound' })
    const [profile] = await database.db.select({ enrollmentYear: userProfiles.enrollmentYear, currentGrade: userProfiles.currentGrade })
      .from(userProfiles).where(eq(userProfiles.userId, session.userId)).limit(1)
    return { ok: true, currentStage: student.currentStage,
      suggestedStage: suggestAcademicStage(profile?.enrollmentYear ?? null, new Date(), profile?.currentGrade ?? null) }
  })

  app.put<{ Body: unknown }>('/me/classroom/current-stage', async (request, reply) => {
    if (!database.configured) return reply.code(503).send({ ok: false, error: 'database_not_configured' })
    const session = await resolveSessionUser(request, database)
    if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })
    if (session.role !== 'student' || ('readOnly' in session && session.readOnly)) return reply.code(403).send({ ok: false, error: 'student_stage_edit_forbidden' })
    const parsed = z.object({ stageCode: z.string(), expectedCurrentStage: z.string().nullable() }).strict().safeParse(request.body)
    if (!parsed.success || !getStageDefinition(parsed.data.stageCode)) return reply.code(400).send({ ok: false, error: 'invalid_stage' })
    const result = await database.db.transaction(async (tx) => {
      const rows = await tx.execute(sql`SELECT id, current_stage AS currentStage FROM students WHERE user_id = ${session.userId} FOR UPDATE`)
      const student = (rows[0] as unknown as Array<{ id: string; currentStage: string | null }>)[0]
      if (!student) return 'missing' as const
      if (student.currentStage !== parsed.data.expectedCurrentStage) return 'changed' as const
      await tx.update(students).set({ currentStage: parsed.data.stageCode }).where(eq(students.id, student.id))
      return 'saved' as const
    })
    if (result === 'missing') return reply.code(404).send({ ok: false, error: 'student_profile_not_bound' })
    if (result === 'changed') return reply.code(409).send({ ok: false, error: 'current_stage_changed' })
    const student = await resolveStudentByUser(database, session.userId)
    if (!student || student.currentStage !== parsed.data.stageCode) return reply.code(409).send({ ok: false, error: 'current_stage_changed' })
    return { ok: true, currentStage: student.currentStage }
  })

  app.get<{ Querystring: { stage?: string } }>('/me/classroom', async (request, reply) => {
    if (!database.configured) return reply.code(503).send({ ok: false, error: 'database_not_configured' })
    const session = await resolveSessionUser(request, database)
    if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })
    const student = await resolveStudentByUser(database, session.userId)
    if (!student) return reply.code(404).send({ ok: false, error: 'student_profile_not_bound' })

    try {
      return await loadClassroom(database, student, request.query.stage)
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid_stage') {
        return reply.code(400).send({ ok: false, error: 'invalid_stage' })
      }
      throw error
    }
  })

  app.put<{ Params: { stage: string; type: string } }>(
    '/me/classroom/plans/:stage/:type',
    async (request, reply) => {
      if (!database.configured) return reply.code(503).send({ ok: false, error: 'database_not_configured' })
      const session = await resolveSessionUser(request, database)
      if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })
      if (session.role !== 'student') return reply.code(403).send({ ok: false, error: 'student_plan_edit_forbidden' })

      const student = await resolveStudentByUser(database, session.userId)
      if (!student) return reply.code(404).send({ ok: false, error: 'student_profile_not_bound' })

      const type = request.params.type as PlanType
      if (!PLAN_TYPES.includes(type) || !isPlanTypeAllowed(request.params.stage, type)) {
        return reply.code(400).send({ ok: false, error: 'invalid_plan_type_for_stage' })
      }

      const parsed = planSchema.safeParse(request.body)
      if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_plan_payload', issues: parsed.error.issues })

      const planId = await applyApprovedPlan(database, student.id, request.params.stage,
        type, parsed.data.title, parsed.data.items, session.userId)
      return { ok: true, plan: { id: planId, status: 'saved' } }
    },
  )

  app.get<{ Params: { stage: string; type: string } }>(
    '/me/classroom/plans/:stage/:type/versions',
    async (request, reply) => {
      if (!database.configured) return reply.code(503).send({ ok: false, error: 'database_not_configured' })
      const session = await resolveSessionUser(request, database)
      if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })
      const student = await resolveStudentByUser(database, session.userId)
      if (!student) return reply.code(404).send({ ok: false, error: 'student_profile_not_bound' })

      const revisions = await database.db
        .select()
        .from(planRevisions)
        .where(
          and(
            eq(planRevisions.studentId, student.id),
            eq(planRevisions.stageCode, request.params.stage),
            eq(planRevisions.type, request.params.type as PlanType),
          ),
        )
        .orderBy(desc(planRevisions.createdAt))
        .limit(3)

      return { ok: true, revisions }
    },
  )

  app.get<{ Params: { studentId: string }; Querystring: { stage?: string } }>(
    '/me/teacher/students/:studentId/classroom',
    async (request, reply) => {
      if (!database.configured) return reply.code(503).send({ ok: false, error: 'database_not_configured' })
      const session = await resolveSessionUser(request, database)
      if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })
      if (!(await teacherCanAccessStudent(database, session.userId, session.role, request.params.studentId))) {
        return reply.code(403).send({ ok: false, error: 'teacher_student_forbidden' })
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
        .where(eq(students.id, request.params.studentId))
        .limit(1)
      if (!student) return reply.code(404).send({ ok: false, error: 'student_not_found' })

      try {
        return await loadClassroom(database, student, request.query.stage)
      } catch (error) {
        if (error instanceof Error && error.message === 'invalid_stage') {
          return reply.code(400).send({ ok: false, error: 'invalid_stage' })
        }
        throw error
      }
    },
  )

  app.put<{ Params: { studentId: string; stage: string; type: string } }>(
    '/me/teacher/students/:studentId/plans/:stage/:type',
    async (request, reply) => {
      if (!database.configured) return reply.code(503).send({ ok: false, error: 'database_not_configured' })
      const session = await resolveSessionUser(request, database)
      if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })
      if (!(await teacherCanAccessStudent(database, session.userId, session.role, request.params.studentId))) {
        return reply.code(403).send({ ok: false, error: 'teacher_student_forbidden' })
      }

      const type = request.params.type as PlanType
      if (!PLAN_TYPES.includes(type) || !isPlanTypeAllowed(request.params.stage, type)) {
        return reply.code(400).send({ ok: false, error: 'invalid_plan_type_for_stage' })
      }
      const parsed = planSchema.safeParse(request.body)
      if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_plan_payload', issues: parsed.error.issues })

      const planId = await applyApprovedPlan(
        database,
        request.params.studentId,
        request.params.stage,
        type,
        parsed.data.title,
        parsed.data.items,
        session.userId,
      )
      return { ok: true, plan: { id: planId, status: 'saved' } }
    },
  )

  // Historical revisions remain readable through /versions. The retired review endpoints
  // cannot apply an old pending revision over a newer directly saved plan.
  app.get('/me/teacher/pending-plan-revisions', async (request, reply) => {
    if (!database.configured) return reply.code(503).send({ ok: false, error: 'database_not_configured' })
    const session = await resolveSessionUser(request, database)
    if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })
    if (!['teacher', 'staff', 'admin'].includes(session.role)) {
      return reply.code(403).send({ ok: false, error: 'teacher_workspace_forbidden' })
    }
    return reply.code(410).send({ ok: false, error: 'plan_review_retired' })
  })

  for (const action of ['approve', 'reject'] as const) {
    app.post<{ Params: { revisionId: string } }>(
      `/me/teacher/plan-revisions/:revisionId/${action}`,
      async (request, reply) => {
        if (!database.configured) return reply.code(503).send({ ok: false, error: 'database_not_configured' })
        const session = await resolveSessionUser(request, database)
        if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })
        if (!['teacher', 'staff', 'admin'].includes(session.role)) {
          return reply.code(403).send({ ok: false, error: 'teacher_workspace_forbidden' })
        }
        return reply.code(410).send({ ok: false, error: 'plan_review_retired' })
      },
    )
  }
  app.post('/me/classroom/schedule-imports', async (request, reply) => {
    if (!database.configured) return reply.code(503).send({ ok: false, error: 'database_not_configured' })
    const session = await resolveSessionUser(request, database)
    if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })
    const student = await resolveStudentByUser(database, session.userId)
    if (!student) return reply.code(404).send({ ok: false, error: 'student_profile_not_bound' })

    const parsed = scheduleImportSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_schedule_import_payload' })

    if (!isSupportedScheduleFileName(parsed.data.fileName, parsed.data.sourceType)) {
      return reply.code(400).send({ ok: false, error: 'schedule_file_type_not_allowed' })
    }
    if (!isOwnedScheduleImportFile(parsed.data.fileID, session.userId)) {
      return reply.code(400).send({ ok: false, error: 'schedule_file_not_owned' })
    }

    const importId = randomUUID()
    await database.db.insert(scheduleImports).values({
      id: importId,
      userId: session.userId,
      studentId: student.id,
      sourceType: parsed.data.sourceType,
      fileId: parsed.data.fileID,
      fileName: parsed.data.fileName,
      status: 'parsing',
    })

    try {
      const buffer = await scheduleStorage.download(
        parsed.data.fileID,
        parsed.data.sourceType,
      )
      const parsedSchedule =
        parsed.data.sourceType === 'spreadsheet'
          ? parseSpreadsheetSchedule(buffer)
          : await parseImageSchedule(buffer, parsed.data.fileName, scheduleImageAI)
      const schedule = { ...parsedSchedule, stageCode: parsed.data.stageCode }

      await database.db
        .update(scheduleImports)
        .set({ status: 'parsed', parsedJson: schedule, errorCode: null })
        .where(eq(scheduleImports.id, importId))

      return { ok: true, importId, schedule }
    } catch (error) {
      const code = error instanceof Error ? error.message : 'schedule_parse_failed'
      const recoverable =
        code === 'schedule_ai_provider_not_configured' ||
        code === 'schedule_weekday_header_not_found' ||
        code === 'schedule_spreadsheet_invalid' ||
        code === 'schedule_ai_invalid_payload'

      if (recoverable) {
        const schedule = { ...createManualScheduleFallback(parsed.data.sourceType, code), stageCode: parsed.data.stageCode }
        await database.db
          .update(scheduleImports)
          .set({
            status: 'parsed',
            parsedJson: schedule,
            errorCode: code,
          })
          .where(eq(scheduleImports.id, importId))

        return {
          ok: true,
          importId,
          schedule,
          fallbackReason: code,
        }
      }

      await database.db
        .update(scheduleImports)
        .set({ status: 'failed', errorCode: code })
        .where(eq(scheduleImports.id, importId))
      return reply.code(422).send({ ok: false, error: code })
    } finally {
      try {
        await scheduleStorage.delete(parsed.data.fileID)
      } catch (cleanupError) {
        app.log.warn(
          { err: cleanupError, importId },
          'Schedule import temporary source cleanup failed',
        )
      }
    }
  })

  app.get<{ Querystring: { stageCode?: string } }>('/me/classroom/schedule-imports/latest', async (request, reply) => {
    if (!database.configured) return reply.code(503).send({ ok: false, error: 'database_not_configured' })
    const session = await resolveSessionUser(request, database)
    if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })

    const stageCode = request.query.stageCode
    if (stageCode && !scheduleTermStageSchema.safeParse(stageCode).success)
      return reply.code(400).send({ ok: false, error: 'invalid_schedule_stage' })
    const [record] = await database.db
      .select()
      .from(scheduleImports)
      .where(
        and(
          eq(scheduleImports.userId, session.userId),
          eq(scheduleImports.status, 'parsed'),
          stageCode ? sql`JSON_UNQUOTE(JSON_EXTRACT(${scheduleImports.parsedJson}, '$.stageCode')) = ${stageCode}` : undefined,
        ),
      )
      .orderBy(desc(scheduleImports.updatedAt), desc(scheduleImports.createdAt))
      .limit(1)

    if (!record) {
      return { ok: true, import: null }
    }

    let schedule = null
    try {
      schedule = normalizeEditableSchedule(record.parsedJson)
    } catch {
      app.log.warn(
        { importId: record.id },
        'Latest parsed schedule has invalid persisted payload',
      )
    }

    return {
      ok: true,
      import: {
        id: record.id,
        sourceType: record.sourceType,
        fileName: record.fileName,
        status: record.status,
        errorCode: record.errorCode,
        updatedAt: record.updatedAt.toISOString(),
        schedule,
      },
    }
  })

  // Save date metadata independently: one date change must not revalidate the
  // entire OCR/AI timetable nor overwrite concurrently edited course details.
  app.put<{ Params: { id: string }; Body: unknown }>(
    '/me/classroom/schedule-imports/:id/term-start-date', async (request, reply) => {
      if (!database.configured)
        return reply.code(503).send({ ok: false, error: 'database_not_configured' })
      const session = await resolveSessionUser(request, database)
      if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })
      const parsed = z.object({ termStartDate: z.string() }).strict().safeParse(request.body)
      if (!parsed.success || !isScheduleFirstMonday(parsed.data.termStartDate))
        return reply.code(400).send({ ok: false, error: 'schedule_first_monday_required' })

      const [owned] = await database.db.select({
        id: scheduleImports.id, status: scheduleImports.status, parsedJson: scheduleImports.parsedJson,
      }).from(scheduleImports).where(and(
        eq(scheduleImports.id, request.params.id),
        eq(scheduleImports.userId, session.userId),
      )).limit(1)
      if (!owned) return reply.code(404).send({ ok: false, error: 'schedule_import_not_found' })
      if (owned.status !== 'parsed' || !owned.parsedJson ||
        typeof owned.parsedJson !== 'object' || Array.isArray(owned.parsedJson))
        return reply.code(409).send({ ok: false, error: 'schedule_not_parsed' })

      await database.db.update(scheduleImports).set({
        parsedJson: sql`JSON_SET(${scheduleImports.parsedJson}, '$.termStartDate', ${parsed.data.termStartDate})`,
      }).where(and(
        eq(scheduleImports.id, owned.id),
        eq(scheduleImports.userId, session.userId),
        eq(scheduleImports.status, 'parsed'),
      ))
      const [confirmed] = await database.db.select({ parsedJson: scheduleImports.parsedJson })
        .from(scheduleImports).where(and(
          eq(scheduleImports.id, owned.id), eq(scheduleImports.userId, session.userId),
        )).limit(1)
      const savedDate = confirmed?.parsedJson && typeof confirmed.parsedJson === 'object' &&
        !Array.isArray(confirmed.parsedJson)
        ? (confirmed.parsedJson as Record<string, unknown>).termStartDate : null
      if (savedDate !== parsed.data.termStartDate)
        return reply.code(409).send({ok:false,error:'schedule_date_readback_mismatch'})
      return { ok: true, termStartDate: parsed.data.termStartDate }
    },
  )

  app.put<{
    Params: { id: string }
    Body: unknown
  }>('/me/classroom/schedule-imports/:id/schedule', async (request, reply) => {
    if (!database.configured) return reply.code(503).send({ ok: false, error: 'database_not_configured' })
    const session = await resolveSessionUser(request, database)
    if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })

    const [record] = await database.db
      .select({
        id: scheduleImports.id,
        userId: scheduleImports.userId,
        sourceType: scheduleImports.sourceType,
      })
      .from(scheduleImports)
      .where(
        and(
          eq(scheduleImports.id, request.params.id),
          eq(scheduleImports.userId, session.userId),
        ),
      )
      .limit(1)

    if (!record) {
      return reply.code(404).send({ ok: false, error: 'schedule_import_not_found' })
    }

    if (!scheduleTermStageSchema.safeParse((request.body as Record<string, unknown> | null)?.stageCode).success)
      return reply.code(400).send({ ok: false, error: 'schedule_stage_selection_required' })
    const draft = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
      ? request.body as Record<string, unknown> : {}
    if (draft.termStartDate !== null && draft.termStartDate !== undefined &&
      !isScheduleFirstMonday(draft.termStartDate)) {
      return reply.code(400).send({ ok: false, error: 'schedule_first_monday_required' })
    }
    let schedule
    try {
      schedule = normalizeEditableSchedule({
        ...draft,
        sourceType: record.sourceType,
        editedAt: new Date().toISOString(),
      })
    } catch (error) {
      // Only field paths are exposed: never echo student timetable content.
      const fields = error instanceof z.ZodError
        ? [...new Set(error.issues.map(issue => issue.path.join('.')))].slice(0, 8)
        : []
      return reply.code(400).send({
        ok: false,
        error: 'invalid_schedule_edit_payload',
        fields,
      })
    }

    await database.db
      .update(scheduleImports)
      .set({
        status: 'parsed',
        parsedJson: schedule,
        errorCode: null,
      })
      .where(eq(scheduleImports.id, record.id))

    return {
      ok: true,
      importId: record.id,
      schedule,
    }
  })
}
