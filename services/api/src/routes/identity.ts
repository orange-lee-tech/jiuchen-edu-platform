import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DatabaseContext } from '../db/client.js'
import {
  internalIds,
  students,
  teachers,
  users,
} from '../db/schema.js'
import { resolveSessionUser } from '../services/session.js'

const claimSchema = z.object({
  businessId: z.string().trim().min(6).max(40),
})

export function registerIdentityRoutes(
  app: FastifyInstance,
  database: DatabaseContext,
) {
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
      .where(eq(internalIds.userId, sessionUser.userId))
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

    const normalized = parsed.data.businessId.toUpperCase()

    const [identity] = await database.db
      .select({
        id: internalIds.id,
        businessId: internalIds.businessId,
        type: internalIds.type,
        claimMode: internalIds.claimMode,
        status: internalIds.status,
        entityId: internalIds.entityId,
      })
      .from(internalIds)
      .where(
        and(
          eq(internalIds.businessId, normalized),
          eq(internalIds.status, 'available'),
        ),
      )
      .limit(1)

    if (!identity || identity.claimMode !== 'self' || identity.type === 'admin') {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_internal_id',
      })
    }

    if (!identity.entityId) {
      return reply.code(409).send({
        ok: false,
        error: 'internal_id_not_ready',
      })
    }

    await database.db.transaction(async (tx) => {
      await tx
        .update(internalIds)
        .set({
          userId: sessionUser.userId,
          status: 'claimed',
          claimedAt: new Date(),
        })
        .where(eq(internalIds.id, identity.id))

      await tx
        .update(users)
        .set({ role: identity.type })
        .where(eq(users.id, sessionUser.userId))

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
