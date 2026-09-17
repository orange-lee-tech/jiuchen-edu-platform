import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AppEnv } from '../config/env.js'
import type { DatabaseContext } from '../db/client.js'
import { users } from '../db/schema.js'
import { exchangeWechatLoginCode } from '../services/wechat.js'

const bodySchema = z.object({
  code: z.string().min(1).optional(),
})

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name]
  return Array.isArray(value) ? value[0] : value
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

      if (existing) {
        return {
          ok: true,
          user: existing,
        }
      }

      const id = randomUUID()
      await database.db.insert(users).values({
        id,
        wechatOpenId: identity.openId,
        role: 'user',
      })

      return {
        ok: true,
        user: {
          id,
          role: 'user',
          displayName: null,
        },
      }
    } catch (error) {
      app.log.warn({ err: error }, 'WeChat identity bootstrap failed')
      return reply.code(502).send({
        ok: false,
        error: 'wechat_login_failed',
      })
    }
  })
}
