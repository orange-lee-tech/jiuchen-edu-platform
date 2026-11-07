import { randomUUID } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import { growthRecords, scheduleImports } from '../db/schema.js'
import { courseAcademicFactSchema, courseAcademicFactWriteSchema, courseFactSourceKey, courseKeySchema, courseStageSchema,
  type CourseAcademicFact } from '../domain/course-academic-fact.js'
import { normalizeEditableSchedule } from '../services/schedule-parser.js'
import { resolveSessionUser } from '../services/session.js'

function missingGrowthTable(error: unknown) {
  const candidate = error as { code?: unknown; errno?: unknown; sqlState?: unknown }
  return String(candidate?.code || '') === 'ER_NO_SUCH_TABLE' || Number(candidate?.errno) === 1146 || String(candidate?.sqlState || '') === '42S02'
}

function factView(row: typeof growthRecords.$inferSelect, fact: CourseAcademicFact) {
  return { recordId: row.id, title: row.title, updatedAt: row.updatedAt.toISOString(), ...fact }
}

function gradeDescription(fact: CourseAcademicFact) {
  if (fact.gradeValue === null) return null
  const labels: Record<string, string> = { percentage: '百分制', four_point: '四分制', five_point: '五分制', letter: '等级', pass_fail: '通过情况', other: '其他计分制' }
  return `${labels[fact.gradeScale] || '成绩'}：${fact.gradeValue}`
}

export function registerCourseAcademicFactRoutes(app: FastifyInstance, database: DatabaseContext) {
  app.get<{ Querystring: { stageCode?: string } }>('/me/course-academic-facts', async (request, reply) => {
    if (!database.configured) return reply.code(503).send({ ok: false, error: 'database_not_configured' })
    const session = await resolveSessionUser(request, database)
    if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })
    if (!['user', 'student'].includes(session.role) || ('readOnly' in session && session.readOnly))
      return reply.code(403).send({ ok: false, error: 'course_facts_forbidden' })
    const parsed = courseStageSchema.safeParse(request.query.stageCode)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_course_stage' })
    try {
      const rows = await database.db.select().from(growthRecords).where(and(eq(growthRecords.userId, session.userId),
        eq(growthRecords.type, 'course'), eq(growthRecords.status, 'active'), eq(growthRecords.userConfirmed, true)))
      const facts = rows.flatMap(row => {
        const metadata = courseAcademicFactSchema.safeParse(row.metadataJson)
        return metadata.success && metadata.data.stageCode === parsed.data ? [factView(row, metadata.data)] : []
      })
      return { ok: true, facts }
    } catch (error) {
      if (missingGrowthTable(error)) return reply.code(503).send({ ok: false, error: 'growth_profile_schema_not_ready' })
      throw error
    }
  })

  app.put<{ Params: { courseKey: string }; Body: unknown }>('/me/course-academic-facts/:courseKey', async (request, reply) => {
    if (!database.configured) return reply.code(503).send({ ok: false, error: 'database_not_configured' })
    const session = await resolveSessionUser(request, database)
    if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })
    if (!['user', 'student'].includes(session.role) || ('readOnly' in session && session.readOnly))
      return reply.code(403).send({ ok: false, error: 'course_facts_forbidden' })
    const key = courseKeySchema.safeParse(request.params.courseKey)
    const input = courseAcademicFactWriteSchema.safeParse(request.body)
    if (!key.success || !input.success) return reply.code(400).send({ ok: false, error: 'invalid_course_fact' })
    const sourceKey = courseFactSourceKey(session.userId, input.data.stageCode, key.data)
    try {
      const [existing] = await database.db.select().from(growthRecords).where(eq(growthRecords.sourceKey, sourceKey)).limit(1)
      if (existing && (existing.userId !== session.userId || existing.type !== 'course'))
        return reply.code(409).send({ ok: false, error: 'course_fact_identity_conflict' })
      const [latest] = await database.db.select({ parsedJson: scheduleImports.parsedJson }).from(scheduleImports)
        .where(and(eq(scheduleImports.userId, session.userId), eq(scheduleImports.status, 'parsed'),
          sql`JSON_UNQUOTE(JSON_EXTRACT(${scheduleImports.parsedJson}, '$.stageCode')) = ${input.data.stageCode}`))
        .orderBy(desc(scheduleImports.updatedAt)).limit(1)
      let title = existing?.title || ''
      if (latest?.parsedJson) {
        try {
          const schedule = normalizeEditableSchedule(latest.parsedJson)
          title = schedule.courses.find(course => course.courseKey === key.data)?.name || title
        } catch { /* An old malformed import cannot replace a confirmed fact. */ }
      }
      if (!title) return reply.code(404).send({ ok: false, error: 'course_key_not_owned' })
      const metadata: CourseAcademicFact = { schemaVersion: 'course-academic-fact-v1', courseKey: key.data, ...input.data }
      const description = metadata.credits === null ? null : `学分：${metadata.credits}`
      const result = gradeDescription(metadata)
      const standardExpression = [title, description, result].filter(Boolean).join('；')
      const now = new Date()
      await database.db.insert(growthRecords).values({ id: randomUUID(), userId: session.userId, type: 'course', title,
        description, result, standardExpression, metadataJson: metadata, sourceType: 'classroom', sourceRecordId: key.data,
        sourceKey, userConfirmed: true, userConfirmedAt: now, status: 'active' })
        .onDuplicateKeyUpdate({ set: { title, description, result, standardExpression, metadataJson: metadata,
          userConfirmed: true, userConfirmedAt: now, status: 'active' } })
      const [saved] = await database.db.select().from(growthRecords).where(eq(growthRecords.sourceKey, sourceKey)).limit(1)
      const confirmed = courseAcademicFactSchema.safeParse(saved?.metadataJson)
      if (!saved || !confirmed.success || saved.userId !== session.userId || saved.type !== 'course' ||
        confirmed.data.stageCode !== metadata.stageCode || confirmed.data.courseKey !== metadata.courseKey ||
        confirmed.data.credits !== metadata.credits || confirmed.data.gradeScale !== metadata.gradeScale ||
        confirmed.data.gradeValue !== metadata.gradeValue)
        return reply.code(409).send({ ok: false, error: 'course_fact_readback_mismatch' })
      return { ok: true, fact: factView(saved, confirmed.data) }
    } catch (error) {
      if (missingGrowthTable(error)) return reply.code(503).send({ ok: false, error: 'growth_profile_schema_not_ready' })
      throw error
    }
  })
}
