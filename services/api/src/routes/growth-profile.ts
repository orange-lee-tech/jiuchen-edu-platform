import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DatabaseContext } from '../db/client.js'
import {
  assessments,
  growthRecords,
  students,
  userProfiles,
  users,
} from '../db/schema.js'
import {
  GENERIC_RECRUITMENT_SCHEMA,
  GROWTH_PROFILE_SCHEMA_VERSION,
  assessmentToGrowthCandidates,
  buildApplicationProjection,
  buildResumeProjection,
  buildStandardExpression,
  growthRecordInputSchema,
  growthRecordTypeSchema,
  resumeProjectionOptionsSchema,
  type CanonicalGrowthRecord,
  type CanonicalProfile,
} from '../domain/growth-profile.js'
import { resolveSessionUser } from '../services/session.js'

function isMissingTable(error: unknown) {
  const seen = new Set<unknown>()
  let current: unknown = error
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== 'object' || seen.has(current)) return false
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
    ) return true
    current = candidate.cause
  }
  return false
}

function serializeRecord(row: typeof growthRecords.$inferSelect): CanonicalGrowthRecord {
  const evidence = Array.isArray(row.evidenceJson)
    ? row.evidenceJson as Array<Record<string, unknown>>
    : undefined
  const metadata =
    row.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
      ? row.metadataJson as Record<string, unknown>
      : undefined

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    organization: row.organization,
    role: row.role,
    startDate: row.startDate,
    endDate: row.endDate,
    description: row.description,
    result: row.result,
    evidence,
    metadata,
    standardExpression:
      row.standardExpression ??
      buildStandardExpression({
        type: row.type,
        title: row.title,
        organization: row.organization,
        role: row.role,
        startDate: row.startDate,
        endDate: row.endDate,
        description: row.description,
        result: row.result,
        evidence,
        metadata,
      }),
    source: {
      type: row.sourceType,
      recordId: row.sourceRecordId,
      key: row.sourceKey,
    },
    confirmations: {
      user: row.userConfirmed,
      teacher: row.teacherConfirmed,
      admin: row.adminConfirmed,
    },
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function loadCanonicalProfile(
  database: DatabaseContext & { configured: true },
  userId: string,
): Promise<{ profile: CanonicalProfile; growthSchemaReady: boolean }> {
  const [[user], [profile], [student]] = await Promise.all([
    database.db.select({
      displayName: users.displayName,
    }).from(users).where(eq(users.id, userId)).limit(1),
    database.db.select({
      university: userProfiles.university,
      major: userProfiles.major,
      currentGrade: userProfiles.currentGrade,
      gpaText: userProfiles.gpaText,
      rankText: userProfiles.rankText,
    }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1),
    database.db.select({
      name: students.name,
    }).from(students).where(eq(students.userId, userId)).limit(1),
  ])

  let rows: Array<typeof growthRecords.$inferSelect> = []
  let growthSchemaReady = true
  try {
    rows = await database.db
      .select()
      .from(growthRecords)
      .where(
        and(
          eq(growthRecords.userId, userId),
          eq(growthRecords.status, 'active'),
          eq(growthRecords.userConfirmed, true),
        ),
      )
      .orderBy(desc(growthRecords.updatedAt))
  } catch (error) {
    if (!isMissingTable(error)) throw error
    growthSchemaReady = false
  }

  return {
    growthSchemaReady,
    profile: {
      schemaVersion: GROWTH_PROFILE_SCHEMA_VERSION,
      identity: {
        displayName: user?.displayName ?? student?.name ?? null,
        university: profile?.university ?? null,
        major: profile?.major ?? null,
        currentGrade: profile?.currentGrade ?? null,
        gpaText: profile?.gpaText ?? null,
        rankText: profile?.rankText ?? null,
      },
      records: rows.map(serializeRecord),
    },
  }
}

const assessmentImportSchema = z.object({
  assessmentId: z.string().uuid(),
  candidateKeys: z.array(z.string().min(1).max(80)).max(40).optional(),
}).strict()

export function registerGrowthProfileRoutes(
  app: FastifyInstance,
  database: DatabaseContext,
) {
  app.get('/growth-profile/meta', async () => ({
    ok: true,
    schemaVersion: GROWTH_PROFILE_SCHEMA_VERSION,
    recordTypes: growthRecordTypeSchema.options,
    resumeTargets: ['general', 'technical', 'academic'],
    applicationSchemas: [GENERIC_RECRUITMENT_SCHEMA],
    aiPolicy: {
      canonicalReadRequiresAI: false,
      projectionRequiresAI: false,
      naturalLanguageParsingReserved: true,
      jdAdaptationReserved: true,
    },
  }))

  app.get('/me/growth-profile', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({ ok: false, error: 'database_not_configured' })
    }
    const session = await resolveSessionUser(request, database)
    if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })

    const result = await loadCanonicalProfile(database, session.userId)
    return { ok: true, ...result }
  })

  app.post<{ Body: unknown }>('/me/growth-records', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({ ok: false, error: 'database_not_configured' })
    }
    const session = await resolveSessionUser(request, database)
    if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })

    const parsed = growthRecordInputSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_growth_record',
        issues: parsed.error.issues,
      })
    }

    const id = randomUUID()
    const now = new Date()
    try {
      const { evidence, metadata, ...fields } = parsed.data
      await database.db.insert(growthRecords).values({
        id,
        userId: session.userId,
        ...fields,
        evidenceJson: evidence ?? null,
        metadataJson: metadata ?? null,
        standardExpression: buildStandardExpression(parsed.data),
        sourceType: 'manual',
        sourceKey: `manual:${id}`,
        userConfirmed: true,
        userConfirmedAt: now,
      })
      const [row] = await database.db
        .select()
        .from(growthRecords)
        .where(eq(growthRecords.id, id))
        .limit(1)
      return reply.code(201).send({ ok: true, record: row ? serializeRecord(row) : null })
    } catch (error) {
      if (isMissingTable(error)) {
        return reply.code(503).send({ ok: false, error: 'growth_profile_schema_not_ready' })
      }
      throw error
    }
  })

  app.put<{ Params: { id: string }; Body: unknown }>(
    '/me/growth-records/:id',
    async (request, reply) => {
      if (!database.configured) {
        return reply.code(503).send({ ok: false, error: 'database_not_configured' })
      }
      const session = await resolveSessionUser(request, database)
      if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })

      const parsed = growthRecordInputSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          error: 'invalid_growth_record',
          issues: parsed.error.issues,
        })
      }

      try {
        const [existing] = await database.db
          .select({ id: growthRecords.id })
          .from(growthRecords)
          .where(and(eq(growthRecords.id, request.params.id), eq(growthRecords.userId, session.userId)))
          .limit(1)
        if (!existing) {
          return reply.code(404).send({ ok: false, error: 'growth_record_not_found' })
        }
        const { evidence, metadata, ...fields } = parsed.data
        await database.db
          .update(growthRecords)
          .set({
            ...fields,
            evidenceJson: evidence ?? null,
            metadataJson: metadata ?? null,
            standardExpression: buildStandardExpression(parsed.data),
            userConfirmed: true,
            userConfirmedAt: new Date(),
            status: 'active',
          })
          .where(eq(growthRecords.id, existing.id))
        const [row] = await database.db.select().from(growthRecords).where(eq(growthRecords.id, existing.id)).limit(1)
        return { ok: true, record: row ? serializeRecord(row) : null }
      } catch (error) {
        if (isMissingTable(error)) {
          return reply.code(503).send({ ok: false, error: 'growth_profile_schema_not_ready' })
        }
        throw error
      }
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/me/growth-records/:id',
    async (request, reply) => {
      if (!database.configured) {
        return reply.code(503).send({ ok: false, error: 'database_not_configured' })
      }
      const session = await resolveSessionUser(request, database)
      if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })

      try {
        await database.db
          .update(growthRecords)
          .set({ status: 'archived' })
          .where(and(eq(growthRecords.id, request.params.id), eq(growthRecords.userId, session.userId)))
        return { ok: true }
      } catch (error) {
        if (isMissingTable(error)) {
          return reply.code(503).send({ ok: false, error: 'growth_profile_schema_not_ready' })
        }
        throw error
      }
    },
  )

  app.post<{ Body: unknown }>(
    '/me/growth-records/assessment-preview',
    async (request, reply) => {
      if (!database.configured) {
        return reply.code(503).send({ ok: false, error: 'database_not_configured' })
      }
      const session = await resolveSessionUser(request, database)
      if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })
      const parsed = assessmentImportSchema.pick({ assessmentId: true }).safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: 'invalid_assessment_import' })
      }

      try {
        const [assessment] = await database.db
          .select({ inputJson: assessments.inputJson })
          .from(assessments)
          .where(and(eq(assessments.id, parsed.data.assessmentId), eq(assessments.userId, session.userId)))
          .limit(1)
        if (!assessment) return reply.code(404).send({ ok: false, error: 'assessment_not_found' })
        return {
          ok: true,
          candidates: assessmentToGrowthCandidates(assessment.inputJson),
        }
      } catch (error) {
        if (isMissingTable(error)) {
          return reply.code(503).send({ ok: false, error: 'assessment_or_growth_schema_not_ready' })
        }
        throw error
      }
    },
  )

  app.post<{ Body: unknown }>(
    '/me/growth-records/import-assessment',
    async (request, reply) => {
      if (!database.configured) {
        return reply.code(503).send({ ok: false, error: 'database_not_configured' })
      }
      const session = await resolveSessionUser(request, database)
      if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })
      const parsed = assessmentImportSchema.safeParse(request.body)
      if (!parsed.success || !parsed.data.candidateKeys?.length) {
        return reply.code(400).send({ ok: false, error: 'candidate_confirmation_required' })
      }

      try {
        const [assessment] = await database.db
          .select({ inputJson: assessments.inputJson })
          .from(assessments)
          .where(and(eq(assessments.id, parsed.data.assessmentId), eq(assessments.userId, session.userId)))
          .limit(1)
        if (!assessment) return reply.code(404).send({ ok: false, error: 'assessment_not_found' })

        const selected = new Set(parsed.data.candidateKeys)
        const candidates = assessmentToGrowthCandidates(assessment.inputJson)
          .filter((candidate) => selected.has(candidate.candidateKey))
        if (candidates.length !== selected.size) {
          return reply.code(400).send({ ok: false, error: 'invalid_candidate_selection' })
        }

        const importedIds: string[] = []
        for (const candidate of candidates) {
          const sourceKey = `assessment:${parsed.data.assessmentId}:${candidate.candidateKey}`
          const [existing] = await database.db
            .select({ id: growthRecords.id })
            .from(growthRecords)
            .where(eq(growthRecords.sourceKey, sourceKey))
            .limit(1)
          const now = new Date()
          const { evidence, metadata, ...fields } = candidate.record
          if (existing) {
            await database.db
              .update(growthRecords)
              .set({
                ...fields,
                evidenceJson: evidence ?? null,
                metadataJson: metadata ?? null,
                standardExpression: candidate.standardExpression,
                userConfirmed: true,
                userConfirmedAt: now,
                status: 'active',
              })
              .where(and(eq(growthRecords.id, existing.id), eq(growthRecords.userId, session.userId)))
            importedIds.push(existing.id)
          } else {
            const id = randomUUID()
            await database.db.insert(growthRecords).values({
              id,
              userId: session.userId,
              ...fields,
              evidenceJson: evidence ?? null,
              metadataJson: metadata ?? null,
              standardExpression: candidate.standardExpression,
              sourceType: 'assessment',
              sourceRecordId: parsed.data.assessmentId,
              sourceKey,
              userConfirmed: true,
              userConfirmedAt: now,
            })
            importedIds.push(id)
          }
        }

        return { ok: true, imported: importedIds.length, recordIds: importedIds }
      } catch (error) {
        if (isMissingTable(error)) {
          return reply.code(503).send({ ok: false, error: 'assessment_or_growth_schema_not_ready' })
        }
        throw error
      }
    },
  )

  app.post<{ Body: unknown }>('/me/resume-projection', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({ ok: false, error: 'database_not_configured' })
    }
    const session = await resolveSessionUser(request, database)
    if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })
    const parsed = resumeProjectionOptionsSchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_resume_projection_options' })
    }
    const result = await loadCanonicalProfile(database, session.userId)
    return {
      ok: true,
      growthSchemaReady: result.growthSchemaReady,
      projection: buildResumeProjection(result.profile, parsed.data),
    }
  })

  app.post<{ Body: unknown }>('/me/application-projection', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({ ok: false, error: 'database_not_configured' })
    }
    const session = await resolveSessionUser(request, database)
    if (!session) return reply.code(401).send({ ok: false, error: 'unauthorized' })
    const parsed = z.object({
      schemaKey: z.literal(GENERIC_RECRUITMENT_SCHEMA.key).default(GENERIC_RECRUITMENT_SCHEMA.key),
    }).strict().safeParse(request.body ?? {})
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'unsupported_application_schema' })
    }
    const result = await loadCanonicalProfile(database, session.userId)
    return {
      ok: true,
      growthSchemaReady: result.growthSchemaReady,
      projection: buildApplicationProjection(result.profile),
    }
  })
}
