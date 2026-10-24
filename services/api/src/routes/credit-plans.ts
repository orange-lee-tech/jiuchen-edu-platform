import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { DatabaseContext } from '../db/client.js'
import { canAccessAdminWorkspace } from '../domain/auth-policy.js'
import { resolveSessionUser } from '../services/session.js'
import { ControlError, sixDigitPin } from '../services/admin-control-boxes.js'
import { activateCreditPlan, archiveCreditPlan, createCreditPlan, creditPlanInput,
  disableCreditPlan, listCreditPlans, setLegacyCreditPlanPin } from '../services/credit-plans.js'

const id = z.string().uuid()
const control = z.object({ expectedVersion: z.number().int().nonnegative(), currentPin: sixDigitPin }).strict()
const activate = control.extend({ targetPin: sixDigitPin }).strict()
const setup = z.object({ currentPin: sixDigitPin, newPin: sixDigitPin }).strict()

export function registerCreditPlanRoutes(app: FastifyInstance, database: DatabaseContext) {
  async function admin(request: FastifyRequest, reply: FastifyReply) {
    if (!database.configured) { reply.code(503).send({ ok: false, error: 'database_not_configured' }); return null }
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
      return reply.code(503).send({ ok: false, error: 'credit_plans_schema_not_ready' })
    }
    throw error
  }
  app.get('/me/admin/credit-plans', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user || !database.configured) return
    try { return { ok: true, ...await listCreditPlans(database.pool) } }
    catch (error) { return failure(reply, error) }
  })
  app.post<{ Body: unknown }>('/me/admin/credit-plans', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user || !database.configured) return
    const parsed = creditPlanInput.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_credit_plan' })
    try { return reply.code(201).send({ ok: true, ...await createCreditPlan({
      pool: database.pool, actorId: user.userId, data: parsed.data,
    }) }) } catch (error) { return failure(reply, error) }
  })
  app.post<{ Params: { id: string }; Body: unknown }>('/me/admin/credit-plans/:id/setup-pin', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user || !database.configured) return
    const parsed = setup.safeParse(request.body)
    if (!id.safeParse(request.params.id).success || !parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_credit_plan_request' })
    try { await setLegacyCreditPlanPin({ pool: database.pool, actorId: user.userId,
      id: request.params.id, ...parsed.data }); return { ok: true } }
    catch (error) { return failure(reply, error) }
  })
  app.post<{ Params: { id: string }; Body: unknown }>('/me/admin/credit-plans/:id/activate', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user || !database.configured) return
    const parsed = activate.safeParse(request.body)
    if (!id.safeParse(request.params.id).success || !parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_credit_plan_request' })
    try { return { ok: true, ...await activateCreditPlan({ pool: database.pool,
      actorId: user.userId, id: request.params.id, ...parsed.data }) } }
    catch (error) { return failure(reply, error) }
  })
  app.post<{ Body: unknown }>('/me/admin/credit-plans/disable', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user || !database.configured) return
    const parsed = control.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_credit_plan_request' })
    try { return { ok: true, ...await disableCreditPlan({ pool: database.pool,
      actorId: user.userId, ...parsed.data }) } }
    catch (error) { return failure(reply, error) }
  })
  app.post<{ Params: { id: string }; Body: unknown }>('/me/admin/credit-plans/:id/archive', async (request, reply) => {
    const user = await admin(request, reply)
    if (!user || !database.configured) return
    const parsed = control.safeParse(request.body)
    if (!id.safeParse(request.params.id).success || !parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_credit_plan_request' })
    try { return { ok: true, ...await archiveCreditPlan({ pool: database.pool,
      actorId: user.userId, id: request.params.id, ...parsed.data }) } }
    catch (error) { return failure(reply, error) }
  })
}
