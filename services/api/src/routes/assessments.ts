import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DatabaseContext } from '../db/client.js'
import { assessments } from '../db/schema.js'
import {
  ASSESSMENT_AGENT_VERSION,
  ASSESSMENT_INPUT_SCHEMA_VERSION,
  ASSESSMENT_OUTPUT_SCHEMA_VERSION,
  assessmentInputSchema,
  normalizeAssessmentInput,
} from '../domain/assessment.js'
import { canUseAssessment } from '../domain/auth-policy.js'
import {
  AssessmentProviderUnavailableError,
  createUnconfiguredAssessmentRuntime,
  executeAssessment,
  type AssessmentRuntime,
} from '../services/assessment-runtime.js'
import { resolveSessionUser } from '../services/session.js'

const createAssessmentSchema = z
  .object({
    input: assessmentInputSchema,
  })
  .strict()

function isMissingTable(error: unknown) {
  return (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    String((error as { code?: unknown }).code ?? '') === 'ER_NO_SUCH_TABLE'
  )
}

function serializeAssessment(row: {
  id: string
  status: 'draft' | 'running' | 'succeeded' | 'failed'
  inputSchemaVersion: string
  outputSchemaVersion: string
  agentVersion: string
  provider: string | null
  model: string | null
  knowledgeVersion: string | null
  inputJson: unknown
  evidenceJson: unknown
  outputJson: unknown
  failureCode: string | null
  creditConsumed: boolean
  startedAt: Date | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: row.id,
    status: row.status,
    versions: {
      inputSchema: row.inputSchemaVersion,
      outputSchema: row.outputSchemaVersion,
      agent: row.agentVersion,
      knowledge: row.knowledgeVersion,
    },
    model: {
      provider: row.provider,
      name: row.model,
    },
    input: row.inputJson,
    evidence: row.evidenceJson,
    output: row.outputJson,
    failureCode: row.failureCode,
    creditConsumed: row.creditConsumed,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function registerAssessmentRoutes(
  app: FastifyInstance,
  database: DatabaseContext,
  runtime: AssessmentRuntime = createUnconfiguredAssessmentRuntime(),
) {
  app.get('/assessments/meta', async () => ({
    ok: true,
    versions: {
      inputSchema: ASSESSMENT_INPUT_SCHEMA_VERSION,
      outputSchema: ASSESSMENT_OUTPUT_SCHEMA_VERSION,
      agent: ASSESSMENT_AGENT_VERSION,
    },
    limits: {
      targets: 5,
      englishRecords: 6,
      researchExperiences: 12,
      competitionExperiences: 12,
    },
    providerConfigured: runtime.provider.isConfigured(),
    outputPolicy: {
      preciseAdmissionProbability: false,
      evidenceRequiredForClaims: true,
    },
  }))

  app.post<{ Body: unknown }>('/me/assessments', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const user = await resolveSessionUser(request, database)
    if (!user) {
      return reply.code(401).send({
        ok: false,
        error: 'unauthorized',
      })
    }

    if (!canUseAssessment(user.role)) {
      return reply.code(403).send({
        ok: false,
        error: 'assessment_not_available_for_role',
      })
    }

    const parsed = createAssessmentSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_assessment_input',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    const id = randomUUID()

    try {
      await database.db.insert(assessments).values({
        id,
        userId: user.userId,
        status: 'draft',
        inputSchemaVersion: ASSESSMENT_INPUT_SCHEMA_VERSION,
        outputSchemaVersion: ASSESSMENT_OUTPUT_SCHEMA_VERSION,
        agentVersion: ASSESSMENT_AGENT_VERSION,
        inputJson: parsed.data.input,
        creditConsumed: false,
      })

      const [created] = await database.db
        .select()
        .from(assessments)
        .where(
          and(
            eq(assessments.id, id),
            eq(assessments.userId, user.userId),
          ),
        )
        .limit(1)

      if (!created) {
        throw new Error('assessment_create_readback_failed')
      }

      return reply.code(201).send({
        ok: true,
        assessment: serializeAssessment(created),
      })
    } catch (error) {
      if (isMissingTable(error)) {
        return reply.code(503).send({
          ok: false,
          error: 'assessment_schema_not_ready',
        })
      }
      throw error
    }
  })

  app.put<{
    Params: { id: string }
    Body: unknown
  }>('/me/assessments/:id', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const user = await resolveSessionUser(request, database)
    if (!user) {
      return reply.code(401).send({
        ok: false,
        error: 'unauthorized',
      })
    }

    if (!canUseAssessment(user.role)) {
      return reply.code(403).send({
        ok: false,
        error: 'assessment_not_available_for_role',
      })
    }

    const parsed = createAssessmentSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_assessment_input',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    try {
      const [existing] = await database.db
        .select()
        .from(assessments)
        .where(
          and(
            eq(assessments.id, request.params.id),
            eq(assessments.userId, user.userId),
          ),
        )
        .limit(1)

      if (!existing) {
        return reply.code(404).send({
          ok: false,
          error: 'assessment_not_found',
        })
      }

      if (existing.status !== 'draft') {
        return reply.code(409).send({
          ok: false,
          error: 'assessment_not_editable',
        })
      }

      await database.db
        .update(assessments)
        .set({
          inputSchemaVersion: ASSESSMENT_INPUT_SCHEMA_VERSION,
          outputSchemaVersion: ASSESSMENT_OUTPUT_SCHEMA_VERSION,
          agentVersion: ASSESSMENT_AGENT_VERSION,
          inputJson: parsed.data.input,
          evidenceJson: null,
          outputJson: null,
          provider: null,
          model: null,
          knowledgeVersion: null,
          failureCode: null,
          creditConsumed: false,
          startedAt: null,
          completedAt: null,
        })
        .where(eq(assessments.id, existing.id))

      const [updated] = await database.db
        .select()
        .from(assessments)
        .where(eq(assessments.id, existing.id))
        .limit(1)

      if (!updated) {
        throw new Error('assessment_update_readback_failed')
      }

      return {
        ok: true,
        assessment: serializeAssessment(updated),
      }
    } catch (error) {
      if (isMissingTable(error)) {
        return reply.code(503).send({
          ok: false,
          error: 'assessment_schema_not_ready',
        })
      }
      throw error
    }
  })

  app.get('/me/assessments', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const user = await resolveSessionUser(request, database)
    if (!user) {
      return reply.code(401).send({
        ok: false,
        error: 'unauthorized',
      })
    }

    if (!canUseAssessment(user.role)) {
      return reply.code(403).send({
        ok: false,
        error: 'assessment_not_available_for_role',
      })
    }

    try {
      const rows = await database.db
        .select()
        .from(assessments)
        .where(eq(assessments.userId, user.userId))
        .orderBy(desc(assessments.createdAt))
        .limit(50)

      return {
        ok: true,
        assessments: rows.map(serializeAssessment),
      }
    } catch (error) {
      if (isMissingTable(error)) {
        return reply.code(503).send({
          ok: false,
          error: 'assessment_schema_not_ready',
        })
      }
      throw error
    }
  })

  app.get<{ Params: { id: string } }>(
    '/me/assessments/:id',
    async (request, reply) => {
      if (!database.configured) {
        return reply.code(503).send({
          ok: false,
          error: 'database_not_configured',
        })
      }

      const user = await resolveSessionUser(request, database)
      if (!user) {
        return reply.code(401).send({
          ok: false,
          error: 'unauthorized',
        })
      }

      if (!canUseAssessment(user.role)) {
        return reply.code(403).send({
          ok: false,
          error: 'assessment_not_available_for_role',
        })
      }

      try {
        const [row] = await database.db
          .select()
          .from(assessments)
          .where(
            and(
              eq(assessments.id, request.params.id),
              eq(assessments.userId, user.userId),
            ),
          )
          .limit(1)

        if (!row) {
          return reply.code(404).send({
            ok: false,
            error: 'assessment_not_found',
          })
        }

        return {
          ok: true,
          assessment: serializeAssessment(row),
        }
      } catch (error) {
        if (isMissingTable(error)) {
          return reply.code(503).send({
            ok: false,
            error: 'assessment_schema_not_ready',
          })
        }
        throw error
      }
    },
  )

  app.post<{ Params: { id: string } }>(
    '/me/assessments/:id/run',
    async (request, reply) => {
      if (!database.configured) {
        return reply.code(503).send({
          ok: false,
          error: 'database_not_configured',
        })
      }

      const user = await resolveSessionUser(request, database)
      if (!user) {
        return reply.code(401).send({
          ok: false,
          error: 'unauthorized',
        })
      }

      if (!canUseAssessment(user.role)) {
        return reply.code(403).send({
          ok: false,
          error: 'assessment_not_available_for_role',
        })
      }

      let row: typeof assessments.$inferSelect | undefined

      try {
        ;[row] = await database.db
          .select()
          .from(assessments)
          .where(
            and(
              eq(assessments.id, request.params.id),
              eq(assessments.userId, user.userId),
            ),
          )
          .limit(1)
      } catch (error) {
        if (isMissingTable(error)) {
          return reply.code(503).send({
            ok: false,
            error: 'assessment_schema_not_ready',
          })
        }
        throw error
      }

      if (!row) {
        return reply.code(404).send({
          ok: false,
          error: 'assessment_not_found',
        })
      }

      if (row.status === 'running') {
        return reply.code(409).send({
          ok: false,
          error: 'assessment_already_running',
        })
      }

      if (row.status === 'succeeded') {
        return reply.code(409).send({
          ok: false,
          error: 'assessment_already_succeeded',
        })
      }

      if (!runtime.provider.isConfigured()) {
        return reply.code(503).send({
          ok: false,
          error: 'assessment_provider_not_configured',
        })
      }

      const input = normalizeAssessmentInput(row.inputJson)
      const startedAt = new Date()

      await database.db
        .update(assessments)
        .set({
          status: 'running',
          startedAt,
          completedAt: null,
          failureCode: null,
        })
        .where(eq(assessments.id, row.id))

      try {
        const result = await executeAssessment(runtime, input)
        const completedAt = new Date()

        await database.db
          .update(assessments)
          .set({
            status: 'succeeded',
            provider: result.provider,
            model: result.model,
            knowledgeVersion: result.knowledgeVersion,
            evidenceJson: result.evidence,
            outputJson: result.output,
            failureCode: null,
            creditConsumed: false,
            completedAt,
          })
          .where(eq(assessments.id, row.id))

        const [completed] = await database.db
          .select()
          .from(assessments)
          .where(eq(assessments.id, row.id))
          .limit(1)

        if (!completed) {
          throw new Error('assessment_complete_readback_failed')
        }

        return {
          ok: true,
          assessment: serializeAssessment(completed),
        }
      } catch (error) {
        if (error instanceof AssessmentProviderUnavailableError) {
          await database.db
            .update(assessments)
            .set({
              status: 'draft',
              startedAt: null,
              failureCode: null,
            })
            .where(eq(assessments.id, row.id))

          return reply.code(503).send({
            ok: false,
            error: 'assessment_provider_not_configured',
          })
        }

        app.log.warn(
          { err: error, assessmentId: row.id },
          'Assessment execution failed',
        )

        await database.db
          .update(assessments)
          .set({
            status: 'failed',
            failureCode: 'assessment_execution_failed',
            creditConsumed: false,
            completedAt: new Date(),
          })
          .where(eq(assessments.id, row.id))

        return reply.code(502).send({
          ok: false,
          error: 'assessment_execution_failed',
        })
      }
    },
  )
}
