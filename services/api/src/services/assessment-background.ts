import { and, asc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { FastifyBaseLogger } from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import { assessments } from '../db/schema.js'
import { createAssessmentAccountContextLoader } from './assessment-account-context.js'
import type { AssessmentEvidenceItem } from '../domain/assessment.js'
import {
  ASSESSMENT_AGENT_VERSION,
  normalizeAssessmentInput,
} from '../domain/assessment.js'
import {
  AssessmentEvidenceReferenceError,
  AssessmentProviderUnavailableError,
  executeAssessment,
  type AssessmentRuntime,
} from './assessment-runtime.js'
import { classifyAssessmentFailure } from './assessment-failure.js'
import {
  persistAssessmentFailureAndReleaseCredit,
  persistAssessmentSuccessAndConsumeCredit,
} from './credit-ledger.js'
import type {
  AssessmentNotificationAdapter,
  AssessmentNotificationEvent,
} from './assessment-notification.js'

export type AssessmentCommercialOptions = {
  creditEnforcementEnabled: boolean
  freeGrant: {
    version: string
    amount: number
  } | null
  studentBonusGrant?: {
    version: string
    amount: number
  } | null
}

export type AssessmentBackgroundJob = {
  id: string
  userId: string
  inputJson: unknown
}

export interface AssessmentBackgroundStore {
  nextRunning(): Promise<AssessmentBackgroundJob | null>
  persistSuccess(
    job: AssessmentBackgroundJob,
    result: Awaited<ReturnType<typeof executeAssessment>>,
    completedAt: Date,
  ): Promise<void>
  persistFailure(
    job: AssessmentBackgroundJob,
    failureCode: string,
    completedAt: Date,
  ): Promise<void>
}

type WorkerLogger = Pick<FastifyBaseLogger, 'error' | 'info' | 'warn'>

export type AssessmentRunDispatcher = {
  start(): void
  stop(): void
  wake(): void
  completionNotification: {
    channel: AssessmentNotificationAdapter['channel']
    configured: boolean
  }
}

async function notifyTerminalState(input: {
  adapter: AssessmentNotificationAdapter
  event: AssessmentNotificationEvent
  logger: WorkerLogger
}) {
  try {
    const result = await input.adapter.notify(input.event)
    if (!result.delivered && result.reason !== 'not_configured') {
      input.logger.warn(
        {
          assessmentId: input.event.assessmentId,
          notificationChannel: result.channel,
          notificationReason: result.reason,
        },
        'Assessment completion notification was not delivered',
      )
    }
  } catch (error) {
    input.logger.warn(
      {
        assessmentId: input.event.assessmentId,
        notificationChannel: input.adapter.channel,
      },
      'Assessment completion notification adapter failed',
    )
  }
}

export async function processAssessmentBackgroundJob(input: {
  job: AssessmentBackgroundJob
  store: AssessmentBackgroundStore
  runtime: AssessmentRuntime
  notification: AssessmentNotificationAdapter
  logger: WorkerLogger
  creditEnforcementEnabled?: boolean
  accountContextLoader?: (input: {
    userId: string; assessmentId: string; includePlanning: boolean; includeRecentAssessments: boolean
  }) => Promise<AssessmentEvidenceItem[]>
}): Promise<'succeeded' | 'failed'> {
  const { job, store, runtime, notification, logger } = input
  const requestId = randomUUID()
  const startedAt = Date.now()
  const diagnostics = () => runtime.diagnostics?.() ?? {
    source: 'unknown' as const, objectId: null, version: null,
    provider: runtime.provider.provider, model: runtime.provider.model,
  }

  let normalizedInput: ReturnType<typeof normalizeAssessmentInput>
  try {
    normalizedInput = normalizeAssessmentInput(job.inputJson)
  } catch (error) {
    const completedAt = new Date()
    logger.warn(
      { assessmentId: job.id, requestId, failureStage: 'input',
        errorCategory: 'invalid_schema' },
      'Persisted Assessment input is invalid in background worker',
    )
    await store.persistFailure(job, 'assessment_input_invalid', completedAt)
    await notifyTerminalState({
      adapter: notification,
      event: {
        assessmentId: job.id,
        userId: job.userId,
        status: 'failed',
        failureCode: 'assessment_input_invalid',
        completedAt,
      },
      logger,
    })
    return 'failed'
  }

  let result: Awaited<ReturnType<typeof executeAssessment>>
  let failureStage: 'account_context' | 'knowledge_retrieval' | 'model_request' |
    'report_validation' = 'account_context'
  try {
    const accountEvidence = input.accountContextLoader ? await input.accountContextLoader({
      userId: job.userId,
      assessmentId: job.id,
      includePlanning: normalizedInput.contextOptions?.includePlanning !== false,
      includeRecentAssessments: normalizedInput.contextOptions?.includeRecentAssessments !== false,
    }) : []
    result = await executeAssessment(runtime, normalizedInput, accountEvidence,
      stage => { failureStage = stage })
  } catch (error) {
    const completedAt = new Date()
    const classified = classifyAssessmentFailure(error)
    const category = error instanceof AssessmentEvidenceReferenceError
      ? 'invalid_schema' : classified.category
    const failureCode =
      error instanceof AssessmentProviderUnavailableError
        ? 'assessment_provider_not_configured'
        : category !== 'internal' ? `assessment_ai_${category}`
        : 'assessment_execution_failed'

    logger.warn(
      { assessmentId: job.id, requestId, failureStage,
        errorCategory: category, providerHttpStatus: classified.httpStatus,
        ...diagnostics(), failureCode, elapsedMs: Date.now() - startedAt },
      'Assessment background execution failed',
    )
    await store.persistFailure(job, failureCode, completedAt)
    logger.info({ assessmentId: job.id, requestId, failureStage: 'terminal_persistence',
      reportPersisted: false, creditReleased: input.creditEnforcementEnabled === true ? true : null,
      elapsedMs: Date.now() - startedAt },
    'Assessment failure persisted and credit released')
    await notifyTerminalState({
      adapter: notification,
      event: {
        assessmentId: job.id,
        userId: job.userId,
        status: 'failed',
        failureCode,
        completedAt,
      },
      logger,
    })
    return 'failed'
  }

  const completedAt = new Date()
  logger.info({ assessmentId: job.id, requestId, ...diagnostics(),
    reportSchemaValid: true, reportPersisted: false, elapsedMs: Date.now() - startedAt },
  'Assessment report validated before persistence')
  try {
    await store.persistSuccess(job, result, completedAt)
  } catch (error) {
    logger.error({ assessmentId: job.id, requestId, failureStage: 'terminal_persistence',
      errorCategory: 'internal', reportPersisted: false,
      elapsedMs: Date.now() - startedAt }, 'Assessment result persistence failed')
    throw error
  }
  logger.info({ assessmentId: job.id, requestId, ...diagnostics(),
    reportSchemaValid: true, reportPersisted: true,
    creditConsumed: input.creditEnforcementEnabled === true ? true : null,
    elapsedMs: Date.now() - startedAt }, 'Assessment report persisted')
  await notifyTerminalState({
    adapter: notification,
    event: {
      assessmentId: job.id,
      userId: job.userId,
      status: 'succeeded',
      failureCode: null,
      completedAt,
    },
    logger,
  })
  return 'succeeded'
}

function createConfiguredStore(
  database: Extract<DatabaseContext, { configured: true }>,
  commercial: AssessmentCommercialOptions,
): AssessmentBackgroundStore {
  return {
    async nextRunning() {
      const [row] = await database.db
        .select({
          id: assessments.id,
          userId: assessments.userId,
          inputJson: assessments.inputJson,
        })
        .from(assessments)
        .where(eq(assessments.status, 'running'))
        .orderBy(asc(assessments.startedAt), asc(assessments.createdAt))
        .limit(1)

      return row ?? null
    },

    async persistSuccess(job, result, completedAt) {
      if (commercial.creditEnforcementEnabled) {
        await persistAssessmentSuccessAndConsumeCredit({
          database,
          userId: job.userId,
          assessmentId: job.id,
          provider: result.provider,
          model: result.model,
          knowledgeVersion: result.knowledgeVersion,
          evidence: result.evidence,
          output: result.output,
          completedAt,
        })
        return
      }

      await database.db
        .update(assessments)
        .set({
          status: 'succeeded',
          agentVersion: ASSESSMENT_AGENT_VERSION,
          provider: result.provider,
          model: result.model,
          knowledgeVersion: result.knowledgeVersion,
          evidenceJson: result.evidence,
          outputJson: result.output,
          failureCode: null,
          creditConsumed: false,
          completedAt,
        })
        .where(and(
          eq(assessments.id, job.id),
          eq(assessments.userId, job.userId),
          eq(assessments.status, 'running'),
        ))
    },

    async persistFailure(job, failureCode, completedAt) {
      if (commercial.creditEnforcementEnabled) {
        await persistAssessmentFailureAndReleaseCredit({
          database,
          userId: job.userId,
          assessmentId: job.id,
          failureCode,
          completedAt,
        })
        return
      }

      await database.db
        .update(assessments)
        .set({
          status: 'failed',
          failureCode,
          creditConsumed: false,
          completedAt,
        })
        .where(and(
          eq(assessments.id, job.id),
          eq(assessments.userId, job.userId),
          eq(assessments.status, 'running'),
        ))
    },
  }
}

export function createAssessmentBackgroundWorker(input: {
  database: DatabaseContext
  runtime: AssessmentRuntime
  commercial: AssessmentCommercialOptions
  notification: AssessmentNotificationAdapter
  logger: WorkerLogger
  pollIntervalMs?: number
}): AssessmentRunDispatcher {
  const completionNotification = {
    channel: input.notification.channel,
    configured: input.notification.isConfigured(),
  }

  if (!input.database.configured) {
    return {
      start() {},
      stop() {},
      wake() {},
      completionNotification,
    }
  }

  const store = createConfiguredStore(input.database, input.commercial)
  const accountContextLoader = createAssessmentAccountContextLoader(input.database)
  const pollIntervalMs = Math.max(input.pollIntervalMs ?? 3000, 500)
  let active = false
  let draining = false
  let timer: ReturnType<typeof setInterval> | null = null

  const drain = async () => {
    if (!active || draining) return
    draining = true
    try {
      while (active) {
        const job = await store.nextRunning()
        if (!job) break
        try {
          await processAssessmentBackgroundJob({
            job,
            store,
            runtime: input.runtime,
            accountContextLoader,
            notification: input.notification,
            logger: input.logger,
            creditEnforcementEnabled: input.commercial.creditEnforcementEnabled,
          })
        } catch (error) {
          input.logger.error(
            { assessmentId: job.id, failureStage: 'terminal_persistence',
              errorCategory: 'internal' },
            'Assessment background worker could not persist terminal state',
          )
          break
        }
      }
    } catch (error) {
      input.logger.error({ failureStage: 'worker_scan', errorCategory: 'internal' },
        'Assessment background worker scan failed')
    } finally {
      draining = false
    }
  }

  const wake = () => {
    if (!active || draining) return
    void drain()
  }

  return {
    start() {
      if (active) return
      active = true
      timer = setInterval(wake, pollIntervalMs)
      timer.unref?.()
      wake()
      input.logger.info(
        { pollIntervalMs, completionNotification },
        'Assessment background worker started',
      )
    },
    stop() {
      active = false
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
    wake,
    completionNotification,
  }
}
