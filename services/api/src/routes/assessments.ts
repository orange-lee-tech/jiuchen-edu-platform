import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { DatabaseContext } from '../db/client.js'
import { assessments } from '../db/schema.js'
import {
  ASSESSMENT_AGENT_VERSION,
  ASSESSMENT_INPUT_SCHEMA_VERSION,
  ASSESSMENT_OUTPUT_SCHEMA_VERSION,
  assessmentInputSchema,
} from '../domain/assessment.js'
import { canUseAssessment } from '../domain/auth-policy.js'
import {
  createUnconfiguredAssessmentRuntime,
  type AssessmentRuntime,
} from '../services/assessment-runtime.js'
import type {
  AssessmentCommercialOptions,
  AssessmentRunDispatcher,
} from '../services/assessment-background.js'
import {
  CommercialStateError,
  beginAssessmentRunWithCredit,
  grantFreeCredits,
} from '../services/credit-ledger.js'
import { resolveSessionUser } from '../services/session.js'
import {
  createUnconfiguredAssessmentImportService,
  isOwnedAssessmentImportFile,
  isSupportedAssessmentImportFileName,
  type AssessmentImportService,
} from '../services/assessment-import.js'

const createAssessmentSchema = z
  .object({
    input: assessmentInputSchema,
  })
  .strict()

const assessmentImportRequestSchema = z
  .object({
    fileID: z.string().min(1).max(1000),
    fileName: z.string().min(1).max(255),
    sourceType: z.enum(['document', 'image']),
  })
  .strict()

const DEFAULT_COMMERCIAL_OPTIONS: AssessmentCommercialOptions = {
  creditEnforcementEnabled: false,
  freeGrant: null,
}

const DEFAULT_RUN_DISPATCHER: Pick<
  AssessmentRunDispatcher,
  'wake' | 'completionNotification'
> = {
  wake() {},
  completionNotification: { channel: 'none', configured: false },
}

function assessmentImportErrorReply(
  reply: FastifyReply,
  error: unknown,
) {
  const rawCode = error instanceof Error ? error.message : 'assessment_import_failed'
  const materialCodeMap: Record<string, string> = {
    material_document_parser_not_configured: 'assessment_import_parser_not_configured',
    material_document_parser_not_enabled: 'assessment_import_parser_not_enabled',
    material_document_source_download_failed: 'assessment_import_source_download_failed',
    material_document_file_too_large: 'assessment_import_file_too_large',
    material_document_parser_billing_unavailable: 'assessment_import_parser_billing_unavailable',
    material_document_parser_permission_denied: 'assessment_import_parser_permission_denied',
    material_document_result_missing: 'assessment_import_parser_failed',
    material_document_result_download_failed: 'assessment_import_parser_failed',
    material_document_result_invalid: 'assessment_import_parser_failed',
    material_document_result_too_large: 'assessment_import_parser_result_too_large',
    material_document_result_text_missing: 'assessment_import_document_text_empty',
    material_document_result_text_empty: 'assessment_import_document_text_empty',
    material_document_result_compression_unsupported: 'assessment_import_parser_failed',
    material_document_temp_url_failed: 'assessment_import_source_download_failed',
    material_document_parser_timeout: 'assessment_import_parser_timeout',
    material_document_type_not_supported: 'assessment_import_file_type_not_allowed',
  }
  const code =
    rawCode.startsWith('assessment_import_')
      ? rawCode
      : rawCode.startsWith('material_document_parser_failed:InternalError')
        ? 'assessment_import_parser_internal_error'
        : rawCode.startsWith('material_document_parser_failed:')
          ? 'assessment_import_parser_failed'
          : materialCodeMap[rawCode] ?? 'assessment_import_ai_failed'

  const status =
    code === 'assessment_import_file_too_large'
      ? 413
      : code === 'assessment_import_file_type_not_allowed' ||
          code === 'assessment_import_file_not_owned'
        ? 400
        : code === 'assessment_import_document_text_empty'
          ? 422
          : code === 'assessment_import_provider_not_configured' ||
              code === 'assessment_import_parser_not_configured' ||
              code === 'assessment_import_parser_not_enabled' ||
              code === 'assessment_import_parser_billing_unavailable' ||
              code === 'assessment_import_parser_permission_denied'
            ? 503
            : 502

  return reply.code(status).send({
    ok: false,
    error: code,
  })
}

function assessmentCommercialErrorReply(
  reply: FastifyReply,
  error: CommercialStateError,
) {
  const status =
    error.code === 'assessment_credit_insufficient'
      ? 402
      : error.code === 'assessment_not_found'
        ? 404
        : error.code === 'credit_payment_schema_not_ready'
          ? 503
          : error.code === 'assessment_already_running' ||
              error.code === 'assessment_already_succeeded' ||
              error.code.includes('conflict')
            ? 409
            : 500

  return reply.code(status).send({
    ok: false,
    error: error.code,
  })
}

export function isMissingTable(error: unknown) {
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
  commercial: AssessmentCommercialOptions = DEFAULT_COMMERCIAL_OPTIONS,
  dispatcher: Pick<
    AssessmentRunDispatcher,
    'wake' | 'completionNotification'
  > = DEFAULT_RUN_DISPATCHER,
  importService: AssessmentImportService =
    createUnconfiguredAssessmentImportService(),
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
    backgroundExecution: {
      enabled: true,
      stateStore: 'assessments',
      terminalStates: ['succeeded', 'failed'],
    },
    completionNotification: dispatcher.completionNotification,
    outputPolicy: {
      preciseAdmissionProbability: false,
      evidenceRequiredForClaims: true,
    },
    materialImport: {
      enabled: importService.configured,
      documentFormats: ['doc', 'docx', 'pdf'],
      imageFormats: ['jpg', 'jpeg', 'png', 'webp'],
    },
  }))

  app.post<{ Body: unknown }>('/me/assessments/import-profile', async (request, reply) => {
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

    const parsed = assessmentImportRequestSchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_assessment_import_payload',
      })
    }

    if (!isSupportedAssessmentImportFileName(
      parsed.data.fileName,
      parsed.data.sourceType,
    )) {
      return reply.code(400).send({
        ok: false,
        error: 'assessment_import_file_type_not_allowed',
      })
    }

    if (!isOwnedAssessmentImportFile(parsed.data.fileID, user.userId)) {
      return reply.code(400).send({
        ok: false,
        error: 'assessment_import_file_not_owned',
      })
    }

    try {
      const result = await importService.parse({
        ...parsed.data,
        userId: user.userId,
      })
      return {
        ok: true,
        ...result,
      }
    } catch (error) {
      app.log.warn({ err: error }, 'Assessment material import failed')
      return assessmentImportErrorReply(reply, error)
    } finally {
      try {
        await importService.cleanup(parsed.data.fileID)
      } catch (cleanupError) {
        app.log.warn(
          { err: cleanupError },
          'Assessment import temporary source cleanup failed',
        )
      }
    }
  })

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

      const startedAt = new Date()

      if (commercial.creditEnforcementEnabled) {
        try {
          if (commercial.freeGrant) {
            await grantFreeCredits({
              database,
              userId: user.userId,
              grant: commercial.freeGrant,
            })
          }
          await beginAssessmentRunWithCredit({
            database,
            userId: user.userId,
            assessmentId: row.id,
            startedAt,
          })
        } catch (error) {
          if (error instanceof CommercialStateError) {
            return assessmentCommercialErrorReply(reply, error)
          }
          throw error
        }
      } else {
        await database.db
          .update(assessments)
          .set({
            status: 'running',
            agentVersion: ASSESSMENT_AGENT_VERSION,
            startedAt,
            completedAt: null,
            failureCode: null,
          })
          .where(eq(assessments.id, row.id))
      }

      const [queued] = await database.db
        .select()
        .from(assessments)
        .where(and(
          eq(assessments.id, row.id),
          eq(assessments.userId, user.userId),
        ))
        .limit(1)

      if (!queued) {
        return reply.code(503).send({
          ok: false,
          error: 'assessment_queue_readback_failed',
        })
      }

      dispatcher.wake()

      return reply.code(202).send({
        ok: true,
        execution: {
          mode: 'background',
          observableFrom: '/me/assessments',
        },
        assessment: serializeAssessment(queued),
      })
    },
  )
}
