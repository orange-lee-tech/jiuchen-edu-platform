import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AppEnv } from '../config/env.js'
import type { DatabaseContext } from '../db/client.js'
import { canAccessAdminWorkspace } from '../domain/auth-policy.js'
import {
  authorizeKeyUse, ControlError, publicControlBox, readControlBox,
  saveControlBox, settingsSchema, sixDigitPin, unsealKey,
} from '../services/admin-control-boxes.js'
import { createAssessmentAIProvider } from '../services/ai-provider.js'
import { resolveSessionUser } from '../services/session.js'

const changeSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  currentPin: sixDigitPin.optional(),
  newPin: sixDigitPin,
  settings: settingsSchema.optional(),
  apiKey: z.string().trim().min(8).max(2048).optional(),
}).strict()
const checkSchema = z.object({ pin: sixDigitPin }).strict()

export function registerAdminControlRoutes(
  app: FastifyInstance, database: DatabaseContext, env: AppEnv,
  onKeyChanged: () => Promise<void>,
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
      return reply.code(503).send({ ok: false, error: 'admin_controls_schema_not_ready' })
    }
    throw error
  }
  app.get('/me/admin/controls', async (request, reply) => {
    if (!(await admin(request, reply)) || !database.configured) return
    try {
      const [settings, key] = await Promise.all([
        readControlBox(database.pool, 'settings'), readControlBox(database.pool, 'assessment_key'),
      ])
      return { ok: true, settings: publicControlBox(settings, 'settings'),
        assessmentKey: publicControlBox(key, 'assessment_key') }
    } catch (error) { return failure(reply, error) }
  })
  app.post<{ Params: { box: string }; Body: unknown }>('/me/admin/controls/:box', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user || !database.configured) return
    const box = request.params.box
    if (box !== 'settings' && box !== 'assessment_key') {
      return reply.code(404).send({ ok: false, error: 'control_box_unknown' })
    }
    const parsed = changeSchema.safeParse(request.body)
    if (!parsed.success || (box === 'settings' ? !parsed.data?.settings || parsed.data.apiKey !== undefined
      : !parsed.data?.apiKey || parsed.data.settings !== undefined)) {
      return reply.code(400).send({ ok: false, error: 'invalid_control_change' })
    }
    try {
      const result = await saveControlBox({
        pool: database.pool, box, actorId: user.userId,
        expectedVersion: parsed.data.expectedVersion,
        currentPin: parsed.data.currentPin, newPin: parsed.data.newPin,
        settings: parsed.data.settings, secret: parsed.data.apiKey,
        masterKey: env.ADMIN_AI_KEY_ENCRYPTION_KEY,
      })
      if (box === 'assessment_key') await onKeyChanged()
      return { ok: true, ...result }
    } catch (error) { return failure(reply, error) }
  })
  // Other admins can authorize a bounded health test with the separate key PIN.
  // The API key and provider response are never returned to the client.
  app.post<{ Body: unknown }>('/me/admin/controls/assessment-key/test', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user || !database.configured) return
    const parsed = checkSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_key_test' })
    try {
      const sealed = await authorizeKeyUse({ pool: database.pool, actorId: user.userId, pin: parsed.data.pin })
      if (!sealed || !env.ADMIN_AI_KEY_ENCRYPTION_KEY) throw new ControlError('key_vault_unavailable', 503)
      const apiKey = unsealKey(sealed, env.ADMIN_AI_KEY_ENCRYPTION_KEY)
      const provider = createAssessmentAIProvider({ ...env, ASSESSMENT_AI_API_KEY: apiKey })
      if (!provider.isConfigured()) throw new ControlError('assessment_model_not_configured', 503)
      try {
        await provider.generateJson({ system: '只返回 JSON 对象 {"ok":true}。', user: '连接测试', maxTokens: 32 })
        return { ok: true, reachable: true }
      } catch {
        return reply.code(503).send({ ok: false, error: 'assessment_provider_test_failed' })
      }
    } catch (error) { return failure(reply, error) }
  })
}
