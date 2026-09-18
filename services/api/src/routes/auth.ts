import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AppEnv } from '../config/env.js'
import type { DatabaseContext } from '../db/client.js'
import { userAgreements, users } from '../db/schema.js'
import {
  LOGIN_PORTALS,
  PLACEHOLDER_USER_AGREEMENT_VERSION,
  canEnterPortal,
  needsStudentBinding,
  type LoginPortal,
  type UserRole,
} from '../domain/auth-policy.js'
import {
  issueSession,
  resolveSessionUser,
  revokeCurrentSession,
} from '../services/session.js'
import { exchangeWechatLoginCode } from '../services/wechat.js'

const bodySchema = z.object({
  code: z.string().min(1).optional(),
  portal: z.enum(LOGIN_PORTALS),
  agreementAccepted: z.literal(true),
  agreementVersion: z.literal(PLACEHOLDER_USER_AGREEMENT_VERSION),
})

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name]
  return Array.isArray(value) ? value[0] : value
}

async function recordUserAgreement(
  database: DatabaseContext & { configured: true },
  userId: string,
  version: string,
) {
  const [existing] = await database.db
    .select({ id: userAgreements.id })
    .from(userAgreements)
    .where(
      and(
        eq(userAgreements.userId, userId),
        eq(userAgreements.type, 'user_terms'),
        eq(userAgreements.version, version),
      ),
    )
    .limit(1)

  if (existing) return

  await database.db.insert(userAgreements).values({
    id: randomUUID(),
    userId,
    type: 'user_terms',
    version,
  })
}

export function registerAuthRoutes(
  app: FastifyInstance,
  database: DatabaseContext,
  env: AppEnv,
) {
  app.post('/auth/wechat/bootstrap', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const body = bodySchema.safeParse(request.body ?? {})
    if (!body.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_login_payload',
      })
    }

    try {
      const cloudOpenId = headerValue(request, 'x-wx-openid')
      const cloudUnionId = headerValue(request, 'x-wx-unionid')

      const identity = cloudOpenId
        ? { openId: cloudOpenId, unionId: cloudUnionId }
        : body.data.code
          ? await exchangeWechatLoginCode(body.data.code, env)
          : null

      if (!identity) {
        return reply.code(401).send({
          ok: false,
          error: 'wechat_identity_missing',
        })
      }

      const [existing] = await database.db
        .select({
          id: users.id,
          role: users.role,
          displayName: users.displayName,
        })
        .from(users)
        .where(eq(users.wechatOpenId, identity.openId))
        .limit(1)

      const user = existing ?? {
        id: randomUUID(),
        role: 'user' as const,
        displayName: null,
      }

      if (!existing) {
        await database.db.insert(users).values({
          id: user.id,
          wechatOpenId: identity.openId,
          role: user.role,
        })
      }

      const role = user.role as UserRole
      const portal = body.data.portal as LoginPortal

      if (!canEnterPortal(role, portal)) {
        return reply.code(403).send({
          ok: false,
          error: 'role_not_authorized',
          portal,
        })
      }

      await recordUserAgreement(
        database,
        user.id,
        body.data.agreementVersion,
      )

      const session = await issueSession(database, user.id)

      return {
        ok: true,
        user: {
          ...user,
          role,
        },
        portal,
        needsProfileBinding: needsStudentBinding(role, portal),
        agreement: {
          type: 'user_terms',
          version: body.data.agreementVersion,
          accepted: true,
        },
        session,
      }
    } catch (error) {
      app.log.warn({ err: error }, 'WeChat identity bootstrap failed')
      return reply.code(502).send({
        ok: false,
        error: 'wechat_login_failed',
      })
    }
  })

  app.get('/auth/me', async (request, reply) => {
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

    return {
      ok: true,
      user: {
        id: user.userId,
        role: user.role,
        displayName: user.displayName,
      },
    }
  })

  app.post('/auth/logout', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const revoked = await revokeCurrentSession(request, database)
    if (!revoked) {
      return reply.code(401).send({
        ok: false,
        error: 'unauthorized',
      })
    }

    return {
      ok: true,
    }
  })
}
