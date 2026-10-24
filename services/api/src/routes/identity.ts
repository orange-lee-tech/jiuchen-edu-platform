import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DatabaseContext } from '../db/client.js'
import {
  internalIds,
  students,
  teachers,
  users,
} from '../db/schema.js'
import { classifyInternalIdClaim, normalizeInternalBusinessId } from '../domain/internal-id.js'
import { resolveSessionUser } from '../services/session.js'
import { bindAdditionalIdentity, IdentityRoleError, listMyIdentities,
  switchMyIdentity, unbindMyIdentity } from '../services/identity-roles.js'

const claimSchema = z.object({
  businessId: z.string().trim().min(6).max(40),
})

export function registerIdentityRoutes(
  app: FastifyInstance,
  database: DatabaseContext,
) {
  const identityId = z.string().uuid()
  const switchSchema = z.object({ role: z.enum(['admin', 'teacher', 'student']) }).strict()
  function identityFailure(reply: import('fastify').FastifyReply, error: unknown) {
    if (error instanceof IdentityRoleError) return reply.code(error.status).send({ ok: false, error: error.code })
    if ((error as {code?:string}).code === 'ER_NO_SUCH_TABLE') {
      return reply.code(503).send({ ok: false, error: 'dual_identity_schema_not_ready' })
    }
    throw error
  }
  app.get('/me/identities', async (request, reply) => {
    if (!database.configured) return reply.code(503).send({ ok: false, error: 'database_not_configured' })
    const user = await resolveSessionUser(request, database)
    if (!user) return reply.code(401).send({ ok: false, error: 'unauthorized' })
    try { return { ok: true, ...await listMyIdentities(database, user.userId) } }
    catch (error) { return identityFailure(reply, error) }
  })
  app.post<{ Body: unknown }>('/me/identities/bind', async (request, reply) => {
    if (!database.configured) return reply.code(503).send({ ok: false, error: 'database_not_configured' })
    const user = await resolveSessionUser(request, database)
    if (!user) return reply.code(401).send({ ok: false, error: 'unauthorized' })
    const parsed = claimSchema.strict().safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_internal_id' })
    try { return { ok: true, identity: await bindAdditionalIdentity(database, user.userId, parsed.data.businessId) } }
    catch (error) { return identityFailure(reply, error) }
  })
  app.post<{ Body: unknown }>('/me/identities/switch', async (request, reply) => {
    if (!database.configured) return reply.code(503).send({ ok: false, error: 'database_not_configured' })
    const user = await resolveSessionUser(request, database)
    if (!user) return reply.code(401).send({ ok: false, error: 'unauthorized' })
    const parsed = switchSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_identity_role' })
    try { return { ok: true, ...await switchMyIdentity(database, user.userId, parsed.data.role) } }
    catch (error) { return identityFailure(reply, error) }
  })
  app.post<{ Params: { id: string } }>('/me/identities/:id/unbind', async (request, reply) => {
    if (!database.configured) return reply.code(503).send({ ok: false, error: 'database_not_configured' })
    const user = await resolveSessionUser(request, database)
    if (!user) return reply.code(401).send({ ok: false, error: 'unauthorized' })
    if (!identityId.safeParse(request.params.id).success) return reply.code(400).send({ ok: false, error: 'invalid_identity_id' })
    try { return { ok: true, ...await unbindMyIdentity(database, user.userId, request.params.id) } }
    catch (error) { return identityFailure(reply, error) }
  })
  app.get('/me/internal-id', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const sessionUser = await resolveSessionUser(request, database)
    if (!sessionUser) {
      return reply.code(401).send({
        ok: false,
        error: 'unauthorized',
      })
    }

    const [identity] = await database.db
      .select({
        businessId: internalIds.businessId,
        type: internalIds.type,
        status: internalIds.status,
      })
      .from(internalIds)
      .where(and(eq(internalIds.userId, sessionUser.userId),
        eq(internalIds.type, sessionUser.role as 'admin' | 'teacher' | 'student')))
      .limit(1)

    return {
      ok: true,
      identity: identity ?? null,
      locked: Boolean(identity),
    }
  })

  app.post<{ Body: unknown }>('/me/internal-id/claim', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const sessionUser = await resolveSessionUser(request, database)
    if (!sessionUser) {
      return reply.code(401).send({
        ok: false,
        error: 'unauthorized',
      })
    }

    const parsed = claimSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_internal_id',
      })
    }

    const [existingClaim] = await database.db
      .select({
        businessId: internalIds.businessId,
        type: internalIds.type,
      })
      .from(internalIds)
      .where(eq(internalIds.userId, sessionUser.userId))
      .limit(1)

    if (existingClaim) {
      return reply.code(409).send({
        ok: false,
        error: 'internal_id_locked',
        identity: existingClaim,
      })
    }

    if (sessionUser.role !== 'user') {
      return reply.code(409).send({
        ok: false,
        error: 'role_already_assigned',
      })
    }

    const normalized = normalizeInternalBusinessId(parsed.data.businessId)

    const [identity] = await database.db
      .select({
        id: internalIds.id,
        businessId: internalIds.businessId,
        type: internalIds.type,
        claimMode: internalIds.claimMode,
        status: internalIds.status,
        userId: internalIds.userId,
        entityId: internalIds.entityId,
      })
      .from(internalIds)
      .where(eq(internalIds.businessId, normalized))
      .limit(1)

    const claimError = classifyInternalIdClaim(identity)
    if (claimError) {
      return reply.code(claimError === 'invalid_internal_id' ? 400 : 409).send({
        ok: false,
        error: claimError,
      })
    }
    if (!identity) throw new Error('unreachable_missing_identity')

    try {
      await database.db.transaction(async (tx) => {
      const [roleClaim] = await tx.update(users).set({ role: identity.type })
        .where(and(eq(users.id, sessionUser.userId), eq(users.role, 'user')))
      if (roleClaim.affectedRows !== 1) throw new Error('user_role_already_assigned')
      // Atomic one-time claim: concurrent requests cannot activate the same code.
      const [claimed] = await tx
        .update(internalIds)
        .set({
          userId: sessionUser.userId,
          status: 'claimed',
          claimedAt: new Date(),
        })
        .where(and(
          eq(internalIds.id, identity.id),
          eq(internalIds.status, 'available'),
          isNull(internalIds.userId),
        ))
      if (claimed.affectedRows !== 1) throw new Error('internal_id_not_available')

      if (identity.type === 'student') {
        await tx
          .update(students)
          .set({ userId: sessionUser.userId })
          .where(eq(students.id, identity.entityId!))
      } else if (identity.type === 'teacher') {
        await tx
          .update(teachers)
          .set({ userId: sessionUser.userId })
          .where(eq(teachers.id, identity.entityId!))
      }
    })

    } catch (error) {
      if (error instanceof Error && ['internal_id_not_available','user_role_already_assigned'].includes(error.message)) {
        return reply.code(409).send({ ok: false, error: error.message })
      }
      throw error
    }

    return {
      ok: true,
      identity: {
        businessId: identity.businessId,
        type: identity.type,
        status: 'claimed',
      },
      role: identity.type,
      locked: true,
    }
  })
}
