import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { DatabaseContext } from '../db/client.js'
import type { AppEnv } from '../config/env.js'
import { resolveSessionUser } from '../services/session.js'
import { ControlError } from '../services/admin-control-boxes.js'
import { readOfficialBalanceStatus, refreshOfficialObjectBalance, setOfficialBalanceThreshold } from '../services/ai-operations.js'

const thresholdInput = z.object({ currency: z.enum(['CNY', 'USD']),
  warningThreshold: z.string().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,8})?$/) }).strict()
export function registerAiOperationsRoutes(app: FastifyInstance, database: DatabaseContext, env: AppEnv) {
  async function admin(request: FastifyRequest, reply: FastifyReply, write: boolean) {
    if (!database.configured) { reply.code(503).send({ ok: false, error: 'database_not_configured' }); return null }
    const user = await resolveSessionUser(request, database)
    if (!user) { reply.code(401).send({ ok: false, error: 'unauthorized' }); return null }
    if (user.role !== 'admin' || write && 'readOnly' in user && user.readOnly) {
      reply.code(403).send({ ok: false, error: 'admin_forbidden' }); return null
    }
    return user
  }
  function failure(reply: FastifyReply, error: unknown) {
    if (error instanceof ControlError) return reply.code(error.status).send({ ok: false, error: error.code })
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(String((error as { code?: string }).code)))
      return reply.code(503).send({ ok: false, error: 'ai_operations_schema_not_ready' })
    throw error
  }
  app.get<{ Params: { id: string } }>('/me/admin/ai-operations/:id/balance', async (request, reply) => {
    if (!await admin(request, reply, false) || !database.configured) return
    if (!z.string().uuid().safeParse(request.params.id).success) return reply.code(400).send({ ok: false, error: 'invalid_account' })
    try { return { ok: true, balance: await readOfficialBalanceStatus(database.pool, request.params.id) } }
    catch (error) { return failure(reply, error) }
  })
  app.post<{ Params: { id: string } }>('/me/admin/ai-operations/:id/balance/refresh', async (request, reply) => {
    const user = await admin(request, reply, true)
    if (!user || !database.configured) return
    if (!z.string().uuid().safeParse(request.params.id).success) return reply.code(400).send({ ok: false, error: 'invalid_account' })
    try {
      const result = await refreshOfficialObjectBalance({ pool: database.pool, env, objectId: request.params.id, actorId: user.userId })
      if (result.status === 'unsupported') return reply.code(422).send({ ok: false, error: result.error })
      return { ok: true, observation: result, balance: await readOfficialBalanceStatus(database.pool, request.params.id) }
    } catch (error) { return failure(reply, error) }
  })
  app.put<{ Params: { id: string }; Body: unknown }>('/me/admin/ai-operations/:id/balance/threshold', async (request, reply) => {
    const user = await admin(request, reply, true)
    if (!user || !database.configured) return
    const parsed = thresholdInput.safeParse(request.body)
    if (!z.string().uuid().safeParse(request.params.id).success || !parsed.success)
      return reply.code(400).send({ ok: false, error: 'invalid_balance_threshold' })
    try {
      await setOfficialBalanceThreshold(database.pool, user.userId, request.params.id, parsed.data.currency, parsed.data.warningThreshold)
      return { ok: true, balance: await readOfficialBalanceStatus(database.pool, request.params.id) }
    } catch (error) { return failure(reply, error) }
  })
}
