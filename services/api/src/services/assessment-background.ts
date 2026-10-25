import { and, asc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type mysql from 'mysql2/promise'
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
  assessmentValidationDiagnostic,
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
  releaseLease?: () => Promise<void>
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
  ): Promise<{ creditSettlement: 'release_committed' | 'no_held_reservation' | 'not_enforced' } | void>
}

type WorkerLogger = Pick<FastifyBaseLogger, 'error' | 'info' | 'warn'>

export async function acquireAssessmentLease(
  pool: Pick<mysql.Pool, 'getConnection'>, assessmentId: string,
): Promise<(AssessmentBackgroundJob & { releaseLease: () => Promise<void> }) | null> {
  const lease = await pool.getConnection()
  const name = `jiuchen:assessment:${assessmentId}`
  let acquired = false
  let closed = false
  const releaseLease = async () => {
    if (closed) return
    closed = true
    try {
      const [rows] = await lease.query<mysql.RowDataPacket[]>(
        'SELECT RELEASE_LOCK(?) AS released', [name])
      if (Number(rows[0]?.released) !== 1) {
        throw new Error('assessment_lease_release_failed')
      }
      lease.release()
    } catch (error) {
      // A possibly held named lock must never go back into the pool.
      lease.destroy()
      throw error
    }
  }
  try {
    const [locks] = await lease.query<mysql.RowDataPacket[]>(
      'SELECT GET_LOCK(?, 0) AS acquired', [name])
    const lockResult = Number(locks[0]?.acquired)
    if (lockResult !== 1) {
      closed = true
      if (lockResult === 0) {
        try { lease.release() }
        catch (error) { lease.destroy(); throw error }
      } else lease.destroy()
      return null
    }
    acquired = true
    // Read on the lock-owning connection. The earlier scan may already be stale.
    const [rows] = await lease.query<mysql.RowDataPacket[]>(
      `SELECT id, user_id AS userId, input_json AS inputJson, status
       FROM assessments WHERE id = ? LIMIT 1`, [assessmentId])
    const row = rows[0]
    if (!row || row.status !== 'running') {
      await releaseLease()
      return null
    }
    return { id: String(row.id), userId: String(row.userId),
      inputJson: row.inputJson, releaseLease }
  } catch (error) {
    if (!closed) {
      if (acquired) {
        try { await releaseLease() } catch { /* releaseLease destroyed the connection */ }
      } else {
        closed = true
        lease.destroy()
      }
    }
    throw error
  }
}

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
  let modelRequestCount = 0
  let repairRequestCount = 0
  let repairOutcome: 'not_attempted' | 'started' | 'completed' | 'failed' = 'not_attempted'
  try {
    const accountEvidence = input.accountContextLoader ? await input.accountContextLoader({
      userId: job.userId,
      assessmentId: job.id,
      includePlanning: normalizedInput.contextOptions?.includePlanning !== false,
      includeRecentAssessments: normalizedInput.contextOptions?.includeRecentAssessments !== false,
    }) : []
    result = await executeAssessment(runtime, normalizedInput, accountEvidence,
      stage => { failureStage = stage }, event => {
        modelRequestCount = event.requestCount
        if (event.phase === 'repair') {
          repairRequestCount = 1
          repairOutcome = event.outcome
        }
        logger.info({ assessmentId: job.id, requestId, modelCallPhase: event.phase,
          modelRequestCount, repairRequestCount, modelCallOutcome: event.outcome,
          ...diagnostics() }, 'Assessment model call stage')
      })
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
        validationIssues: assessmentValidationDiagnostic(error),
        modelRequestCount, repairRequestCount, repairOutcome,
        repairResult: repairRequestCount === 0 ? 'not_attempted' :
          String(failureStage) === 'report_validation' ? 'report_invalid' : repairOutcome,
        ...diagnostics(), failureCode, elapsedMs: Date.now() - startedAt },
      'Assessment background execution failed',
    )
    const settlement = await store.persistFailure(job, failureCode, completedAt)
    logger.info({ assessmentId: job.id, requestId, failureStage: 'terminal_persistence',
      reportPersisted: false,
      creditSettlement: settlement?.creditSettlement ?? 'not_observed',
      modelRequestCount, repairRequestCount, repairOutcome,
      repairResult: repairRequestCount === 0 ? 'not_attempted' :
        String(failureStage) === 'report_validation' ? 'report_invalid' : repairOutcome,
      elapsedMs: Date.now() - startedAt },
    'Assessment failure persisted with credit settlement state')
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
    reportSchemaValid: true, reportPersisted: false, modelRequestCount,
    repairRequestCount, repairOutcome,
    repairResult: repairRequestCount === 0 ? 'not_attempted' : 'report_valid',
    elapsedMs: Date.now() - startedAt },
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
    modelRequestCount, repairRequestCount, repairOutcome,
    repairResult: repairRequestCount === 0 ? 'not_attempted' : 'report_valid',
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

export function createConfiguredStore(
  database: Extract<DatabaseContext, { configured: true }>,
  commercial: AssessmentCommercialOptions,
): AssessmentBackgroundStore {
  const batchSize = 32
  let scanOffset = 0
  return {
    async nextRunning() {
      const rows = await database.db
        .select({ id: assessments.id })
        .from(assessments)
        .where(eq(assessments.status, 'running'))
        .orderBy(asc(assessments.startedAt), asc(assessments.createdAt), asc(assessments.id))
        .limit(batchSize)
        .offset(scanOffset)

      for (const row of rows) {
        // Other workers may hold earlier candidates; try later jobs in this
        // bounded batch, then rotate to the next batch on the next poll.
        const job = await acquireAssessmentLease(database.pool, row.id)
        if (job) {
          scanOffset = 0
          return job
        }
      }
      scanOffset = rows.length === batchSize ? scanOffset + batchSize : 0
      return null
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
        const result = await persistAssessmentFailureAndReleaseCredit({
          database,
          userId: job.userId,
          assessmentId: job.id,
          failureCode,
          completedAt,
        })
        return { creditSettlement: result.released ? 'release_committed' as const :
          'no_held_reservation' as const }
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
      return { creditSettlement: 'not_enforced' as const }
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
  let halted = false
  let draining = false
  let timer: ReturnType<typeof setInterval> | null = null

  const stopPolling = () => {
    active = false
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

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
          halted = true
          stopPolling()
          input.logger.error(
            { assessmentId: job.id, failureStage: 'terminal_persistence',
              errorCategory: 'internal', workerStopped: true,
              manualReviewRequired: true },
            'Assessment worker stopped: verify terminal state and credit reservation before restart',
          )
          break
        } finally {
          try { await job.releaseLease?.() }
          catch { input.logger.error({ assessmentId: job.id,
            failureStage: 'worker_lease' }, 'Assessment worker lease release failed') }
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
      if (active || halted) return
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
      stopPolling()
    },
    wake,
    completionNotification,
  }
}
