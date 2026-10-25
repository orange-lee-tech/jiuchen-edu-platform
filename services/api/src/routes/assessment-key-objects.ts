import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AppEnv } from '../config/env.js'
import type { DatabaseContext } from '../db/client.js'
import { canAccessAdminWorkspace } from '../domain/auth-policy.js'
import { resolveSessionUser } from '../services/session.js'
import { ControlError, sixDigitPin } from '../services/admin-control-boxes.js'
import {
  archiveAssessmentKey, assessmentKeyInput, createAssessmentKey, disableAssessmentKey,
  listAssessmentKeys, revealAssessmentKey, setLegacyAssessmentKeyPin, switchAssessmentKey,
  testAssessmentKey,
} from '../services/assessment-key-objects.js'

const idSchema = z.string().uuid()
const versionSchema = z.number().int().nonnegative()
const revealSchema = z.object({ pin: sixDigitPin }).strict()
const pinSetupSchema = z.object({ currentPin: sixDigitPin, newPin: sixDigitPin }).strict()
const switchSchema = z.object({ expectedVersion: versionSchema,
  currentPin: sixDigitPin, targetPin: sixDigitPin }).strict()
const controlSchema = z.object({ expectedVersion: versionSchema, currentPin: sixDigitPin }).strict()

export function registerAssessmentKeyObjectRoutes(
  app: FastifyInstance, database: DatabaseContext, env: AppEnv, onKeyChanged: () => Promise<void>,
) {
  async function admin(request: FastifyRequest, reply: FastifyReply) {
    if (!database.configured) {
      reply.code(503).send({ ok: false, error: 'database_not_configured' }); return null
    }
    const user = await resolveSessionUser(request, database)
    if (!user) { reply.code(401).send({ ok: false, error: 'unauthorized' }); return null }
    if (!canAccessAdminWorkspace(user.role)) {
      reply.code(403).send({ ok: false, error: 'admin_forbidden' }); return null
    }
    return user
  }
  function failure(reply: FastifyReply, error: unknown) {
    if (error instanceof ControlError) return reply.code(error.status).send({ ok: false, error: error.code })
    if ((error as { code?: string }).code === 'ER_NO_SUCH_TABLE') {
      return reply.code(503).send({ ok: false, error: 'assessment_keys_schema_not_ready' })
    }
    throw error
  }
  app.get('/me/admin/assessment-keys', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user || !database.configured) return
    try { return { ok: true, ...await listAssessmentKeys(database.pool) } }
    catch (error) { return failure(reply, error) }
  })
  app.post<{ Body: unknown }>('/me/admin/assessment-keys', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user || !database.configured) return
    const parsed = assessmentKeyInput.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_assessment_key' })
    try {
      const result = await createAssessmentKey({ pool: database.pool, actorId: user.userId,
        data: parsed.data, masterKey: env.ADMIN_AI_KEY_ENCRYPTION_KEY ?? '' })
      if (result.active) await onKeyChanged()
      return reply.code(201).send({ ok: true, ...result })
    } catch (error) { return failure(reply, error) }
  })
  app.post<{ Params: { id: string }; Body: unknown }>('/me/admin/assessment-keys/:id/reveal', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user || !database.configured) return
    const parsed = revealSchema.safeParse(request.body)
    if (!idSchema.safeParse(request.params.id).success || !parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_assessment_key_request' })
    }
    try { return { ok: true, ...await revealAssessmentKey({ pool: database.pool,
      actorId: user.userId, id: request.params.id, pin: parsed.data.pin,
      masterKey: env.ADMIN_AI_KEY_ENCRYPTION_KEY ?? '' }) } }
    catch (error) { return failure(reply, error) }
  })
  app.post<{ Params: { id: string }; Body: unknown }>('/me/admin/assessment-keys/:id/setup-pin', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user || !database.configured) return
    const parsed = pinSetupSchema.safeParse(request.body)
    if (!idSchema.safeParse(request.params.id).success || !parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_assessment_key_request' })
    }
    try { await setLegacyAssessmentKeyPin({ pool: database.pool, actorId: user.userId,
      id: request.params.id, ...parsed.data }); return { ok: true } }
    catch (error) { return failure(reply, error) }
  })
  app.post<{ Params: { id: string }; Body: unknown }>('/me/admin/assessment-keys/:id/activate', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user || !database.configured) return
    const parsed = switchSchema.safeParse(request.body)
    if (!idSchema.safeParse(request.params.id).success || !parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_assessment_key_request' })
    }
    try { const result = await switchAssessmentKey({ pool: database.pool, actorId: user.userId,
      id: request.params.id, ...parsed.data }); await onKeyChanged(); return { ok: true, ...result } }
    catch (error) { return failure(reply, error) }
  })
  app.post<{ Body: unknown }>('/me/admin/assessment-keys/disable', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user || !database.configured) return
    const parsed = controlSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_assessment_key_request' })
    try { const result = await disableAssessmentKey({ pool: database.pool, actorId: user.userId,
      ...parsed.data }); await onKeyChanged(); return { ok: true, ...result } }
    catch (error) { return failure(reply, error) }
  })
  app.post<{ Params: { id: string }; Body: unknown }>('/me/admin/assessment-keys/:id/archive', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user || !database.configured) return
    const parsed = controlSchema.safeParse(request.body)
    if (!idSchema.safeParse(request.params.id).success || !parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_assessment_key_request' })
    }
    try { return { ok: true, ...await archiveAssessmentKey({ pool: database.pool,
      actorId: user.userId, id: request.params.id, ...parsed.data }) } }
    catch (error) { return failure(reply, error) }
  })
  app.post<{ Params: { id: string }; Body: unknown }>('/me/admin/assessment-keys/:id/test', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user || !database.configured) return
    const parsed = revealSchema.safeParse(request.body)
    if (!idSchema.safeParse(request.params.id).success || !parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_assessment_key_request' })
    }
    try {
      const result = await testAssessmentKey({ pool: database.pool,
        actorId: user.userId, id: request.params.id, pin: parsed.data.pin, env })
      request.log.info({ diagnosticId: result.diagnosticId, objectId: request.params.id,
        reachable: result.reachable, reportSchemaValid: result.reportSchemaValid,
        errorCategory: result.errorCategory, providerHttpStatus: result.providerHttpStatus },
      'Assessment key format probe completed')
      return { ok: true, ...result }
    }
    catch (error) { return failure(reply, error) }
  })
}
