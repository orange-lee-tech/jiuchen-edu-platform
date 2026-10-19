import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AppEnv } from '../config/env.js'
import type { DatabaseContext } from '../db/client.js'
import {
  internalIds,
  students,
  teachers,
  userAgreements,
  userProfiles,
  userSessions,
  users,
} from '../db/schema.js'
import { PLACEHOLDER_USER_AGREEMENT_VERSION } from '../domain/auth-policy.js'
import {
  issueSession,
  resolveSessionUser,
  revokeCurrentSession,
} from '../services/session.js'
import {
  exchangeWechatLoginCode,
  exchangeWechatPhoneCode,
} from '../services/wechat.js'

const agreementFields = {
  agreementAccepted: z.literal(true),
  agreementVersion: z.literal(PLACEHOLDER_USER_AGREEMENT_VERSION),
}

const wechatBodySchema = z.object({
  code: z.string().min(1).optional(),
  ...agreementFields,
})

const phoneBodySchema = z.object({
  phoneCode: z.string().min(1),
  wechatCode: z.string().min(1).optional(),
  ...agreementFields,
})

type LoginUser = {
  id: string
  role: 'user' | 'student' | 'teacher' | 'staff' | 'admin'
  status: 'active' | 'deleted'
  displayName: string | null
  wechatOpenId: string | null
  phoneNumber: string | null
}

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

async function loadBusinessIdentity(
  database: DatabaseContext & { configured: true },
  userId: string,
) {
  const [identity] = await database.db
    .select({
      businessId: internalIds.businessId,
      type: internalIds.type,
      status: internalIds.status,
    })
    .from(internalIds)
    .where(eq(internalIds.userId, userId))
    .limit(1)

  return identity ?? null
}

async function loadWechatUserByOpenId(
  database: DatabaseContext & { configured: true },
  openId: string,
) {
  const [user] = await database.db
    .select({
      id: users.id,
      role: users.role,
      status: users.status,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.wechatOpenId, openId))
    .limit(1)

  return user ?? null
}

async function loadPhoneLoginUserByOpenId(
  database: DatabaseContext & { configured: true },
  openId: string,
): Promise<LoginUser | null> {
  const [user] = await database.db
    .select({
      id: users.id,
      role: users.role,
      status: users.status,
      displayName: users.displayName,
      wechatOpenId: users.wechatOpenId,
      phoneNumber: users.phoneNumber,
    })
    .from(users)
    .where(eq(users.wechatOpenId, openId))
    .limit(1)

  return user ?? null
}

async function loadLoginUserByPhone(
  database: DatabaseContext & { configured: true },
  phoneNumber: string,
): Promise<LoginUser | null> {
  const [user] = await database.db
    .select({
      id: users.id,
      role: users.role,
      status: users.status,
      displayName: users.displayName,
      wechatOpenId: users.wechatOpenId,
      phoneNumber: users.phoneNumber,
    })
    .from(users)
    .where(eq(users.phoneNumber, phoneNumber))
    .limit(1)

  return user ?? null
}

async function finalizeLogin(
  database: DatabaseContext & { configured: true },
  user: Pick<LoginUser, 'id' | 'role' | 'displayName'>,
  agreementVersion: string,
) {
  const businessIdentity = await loadBusinessIdentity(database, user.id)
  if (businessIdentity?.status === 'disabled') throw new Error('internal_id_suspended')
  await recordUserAgreement(database, user.id, agreementVersion)
  const session = await issueSession(database, user.id)

  return {
    ok: true as const,
    user: {
      id: user.id,
      role: user.role,
      displayName: user.displayName,
    },
    businessIdentity,
    agreement: {
      type: 'user_terms' as const,
      version: agreementVersion,
      accepted: true as const,
    },
    session,
  }
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

    const body = wechatBodySchema.safeParse(request.body ?? {})
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

      const existing = await loadWechatUserByOpenId(database, identity.openId)

      if (existing?.status === 'deleted') {
        return reply.code(403).send({
          ok: false,
          error: 'account_deleted',
        })
      }

      const user = existing ?? {
        id: randomUUID(),
        role: 'user' as const,
        status: 'active' as const,
        displayName: null,
        wechatOpenId: identity.openId,
        phoneNumber: null,
      }

      if (!existing) {
        await database.db.insert(users).values({
          id: user.id,
          wechatOpenId: identity.openId,
          role: 'user',
          status: 'active',
        })
      }

      return finalizeLogin(database, user, body.data.agreementVersion)
    } catch (error) {
      if (error instanceof Error && error.message === 'internal_id_suspended') {
        return reply.code(403).send({ ok: false, error: 'internal_id_suspended' })
      }
      app.log.warn({ err: error }, 'WeChat identity bootstrap failed')
      return reply.code(502).send({
        ok: false,
        error: 'wechat_login_failed',
      })
    }
  })

  app.post('/auth/phone/bootstrap', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const body = phoneBodySchema.safeParse(request.body ?? {})
    if (!body.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_phone_login_payload',
      })
    }

    try {
      const cloudOpenId = headerValue(request, 'x-wx-openid')
      const cloudUnionId = headerValue(request, 'x-wx-unionid')

      const identity = cloudOpenId
        ? { openId: cloudOpenId, unionId: cloudUnionId }
        : body.data.wechatCode
          ? await exchangeWechatLoginCode(body.data.wechatCode, env)
          : null

      if (!identity) {
        return reply.code(401).send({
          ok: false,
          error: 'wechat_identity_missing',
        })
      }

      const phone = await exchangeWechatPhoneCode(body.data.phoneCode, env)

      const [openIdUser, phoneUser] = await Promise.all([
        loadPhoneLoginUserByOpenId(database, identity.openId),
        loadLoginUserByPhone(database, phone.phoneNumber),
      ])

      if (openIdUser?.status === 'deleted' || phoneUser?.status === 'deleted') {
        return reply.code(403).send({
          ok: false,
          error: 'account_deleted',
        })
      }

      if (openIdUser && phoneUser && openIdUser.id !== phoneUser.id) {
        return reply.code(409).send({
          ok: false,
          error: 'auth_identity_conflict',
        })
      }

      if (
        !openIdUser &&
        phoneUser?.wechatOpenId &&
        phoneUser.wechatOpenId !== identity.openId
      ) {
        return reply.code(409).send({
          ok: false,
          error: 'phone_bound_to_other_wechat',
        })
      }

      let user = openIdUser ?? phoneUser

      if (!user) {
        user = {
          id: randomUUID(),
          role: 'user',
          status: 'active',
          displayName: null,
          wechatOpenId: identity.openId,
          phoneNumber: phone.phoneNumber,
        }

        await database.db.insert(users).values({
          id: user.id,
          wechatOpenId: identity.openId,
          phoneNumber: phone.phoneNumber,
          phoneCountryCode: phone.countryCode,
          role: 'user',
          status: 'active',
        })
      } else {
        await database.db
          .update(users)
          .set({
            wechatOpenId: identity.openId,
            phoneNumber: phone.phoneNumber,
            phoneCountryCode: phone.countryCode,
          })
          .where(eq(users.id, user.id))

        user = {
          ...user,
          wechatOpenId: identity.openId,
          phoneNumber: phone.phoneNumber,
        }
      }

      return finalizeLogin(database, user, body.data.agreementVersion)
    } catch (error) {
      if (error instanceof Error && error.message === 'internal_id_suspended') {
        return reply.code(403).send({ ok: false, error: 'internal_id_suspended' })
      }
      app.log.warn({ err: error }, 'WeChat phone bootstrap failed')
      return reply.code(502).send({
        ok: false,
        error: 'phone_login_failed',
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
      businessIdentity: await loadBusinessIdentity(database, user.userId),
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

    return { ok: true }
  })

  app.post('/auth/delete-account', async (request, reply) => {
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

    const now = new Date()

    await database.db.transaction(async (tx) => {
      await tx
        .update(userSessions)
        .set({ revokedAt: now })
        .where(eq(userSessions.userId, user.userId))

      await tx
        .update(internalIds)
        .set({
          status: 'disabled',
          userId: null,
        })
        .where(eq(internalIds.userId, user.userId))

      await tx
        .update(students)
        .set({ userId: null })
        .where(eq(students.userId, user.userId))

      await tx
        .update(teachers)
        .set({ userId: null })
        .where(eq(teachers.userId, user.userId))

      await tx
        .delete(userProfiles)
        .where(eq(userProfiles.userId, user.userId))

      await tx
        .update(users)
        .set({
          wechatOpenId: null,
          role: 'user',
          status: 'deleted',
          displayName: null,
          deletedAt: now,
        })
        .where(eq(users.id, user.userId))
    })

    // Native phone auth is rolled out with a separate idempotent schema upgrade.
    // Clear verified phone identity when those columns already exist, while
    // keeping account deletion compatible with databases not upgraded yet.
    try {
      await database.pool.query(
        'UPDATE `users` SET `phone_number` = NULL, `phone_country_code` = NULL WHERE `id` = ?',
        [user.userId],
      )
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : ''
      if (code !== 'ER_BAD_FIELD_ERROR') {
        app.log.warn({ err: error }, 'Failed to clear verified phone identity')
      }
    }

    return { ok: true }
  })
}
