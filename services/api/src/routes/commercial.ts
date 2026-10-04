import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { DatabaseContext } from '../db/client.js'
import { canUseAssessment } from '../domain/auth-policy.js'
import {
  createPaymentOrder,
  getPaymentOrder,
  settleVerifiedPaymentNotification,
} from '../services/payment-orders.js'
import {
  CommercialStateError,
  grantFreeCredits,
  readCreditAccount,
} from '../services/credit-ledger.js'
import {
  findCreditSku,
  type CommercialConfig,
} from '../services/commercial-config.js'
import {
  WechatPayGatewayError,
  type WechatPayGateway,
} from '../services/wechat-pay.js'
import { resolveSessionUser } from '../services/session.js'

const createOrderSchema = z.object({
  skuKey: z.string().trim().min(1).max(64),
}).strict()

function commercialErrorReply(
  reply: FastifyReply,
  error: CommercialStateError,
) {
  const status =
    error.code === 'assessment_credit_insufficient'
      ? 402
      : error.code === 'assessment_not_found'
        ? 404
        : error.code === 'wechat_pay_not_configured' ||
            error.code === 'free_credit_grant_not_configured' ||
            error.code === 'credit_payment_schema_not_ready'
          ? 503
          : error.code.endsWith('_conflict')
            ? 409
            : 400

  return reply.code(status).send({
    ok: false,
    error: error.code,
  })
}

function stringHeader(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export function registerCommercialRoutes(
  app: FastifyInstance,
  database: DatabaseContext,
  config: CommercialConfig,
  wechatPay: WechatPayGateway,
) {
  app.get('/commercial/meta', async () => ({
    ok: true,
    policy: {
      assessmentCreditCost: 1,
      enforcementEnabled: config.creditEnforcementEnabled,
    },
    freeGrant: config.freeGrant
      ? {
          configured: true,
          version: config.freeGrant.version,
          amount: config.freeGrant.amount,
        }
      : {
          configured: false,
        },
    payment: {
      provider: 'wechat_pay',
      providerConfigured: wechatPay.isConfigured(),
      skus: config.paymentSkus,
    },
  }))

  app.get('/me/credits', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const user = await resolveSessionUser(request, database)
    if (!user) {
      return reply.code(401).send({ ok: false, error: 'unauthorized' })
    }
    if (!canUseAssessment(user.role)) {
      return reply.code(403).send({
        ok: false,
        error: 'assessment_not_available_for_role',
      })
    }

    try {
      const account = await readCreditAccount(database, user.userId)
      return { ok: true, account }
    } catch (error) {
      if (error instanceof CommercialStateError) {
        return commercialErrorReply(reply, error)
      }
      throw error
    }
  })

  app.post('/me/credits/free-grant', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const user = await resolveSessionUser(request, database)
    if (!user) {
      return reply.code(401).send({ ok: false, error: 'unauthorized' })
    }
    if (!canUseAssessment(user.role)) {
      return reply.code(403).send({
        ok: false,
        error: 'assessment_not_available_for_role',
      })
    }

    try {
      const grant = await grantFreeCredits({
        database,
        userId: user.userId,
        grant: config.freeGrant,
      })
      const account = await readCreditAccount(database, user.userId)
      return {
        ok: true,
        grant,
        account,
      }
    } catch (error) {
      if (error instanceof CommercialStateError) {
        return commercialErrorReply(reply, error)
      }
      throw error
    }
  })

  app.post<{ Body: unknown }>('/me/payment-orders', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const user = await resolveSessionUser(request, database)
    if (!user) {
      return reply.code(401).send({ ok: false, error: 'unauthorized' })
    }
    if (!canUseAssessment(user.role)) {
      return reply.code(403).send({
        ok: false,
        error: 'assessment_not_available_for_role',
      })
    }

    const parsed = createOrderSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_payment_order_request',
      })
    }

    const sku = findCreditSku(config, parsed.data.skuKey)
    if (!sku) {
      return reply.code(400).send({
        ok: false,
        error: 'payment_sku_not_found',
      })
    }

    try {
      const result = await createPaymentOrder({
        database,
        userId: user.userId,
        sku,
        gateway: wechatPay,
      })
      return reply.code(201).send({
        ok: true,
        ...result,
      })
    } catch (error) {
      if (error instanceof CommercialStateError) {
        return commercialErrorReply(reply, error)
      }
      if (error instanceof WechatPayGatewayError) {
        return reply.code(502).send({
          ok: false,
          error: error.code,
        })
      }
      throw error
    }
  })

  app.get<{ Params: { id: string } }>(
    '/me/payment-orders/:id',
    async (request, reply) => {
      if (!database.configured) {
        return reply.code(503).send({
          ok: false,
          error: 'database_not_configured',
        })
      }

      const user = await resolveSessionUser(request, database)
      if (!user) {
        return reply.code(401).send({ ok: false, error: 'unauthorized' })
      }

      try {
        const order = await getPaymentOrder({
          database,
          userId: user.userId,
          orderId: request.params.id,
        })
        if (!order) {
          return reply.code(404).send({
            ok: false,
            error: 'payment_order_not_found',
          })
        }
        return { ok: true, order }
      } catch (error) {
        if (error instanceof CommercialStateError) {
          return commercialErrorReply(reply, error)
        }
        throw error
      }
    },
  )

  app.register(async (callbackScope) => {
    callbackScope.removeContentTypeParser('application/json')
    callbackScope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_request, body, done) => done(null, body),
    )

    callbackScope.post<{ Body: Buffer }>(
      '/payments/wechat/callback',
      async (request, reply) => {
        if (!database.configured) {
          return reply.code(503).send({
            code: 'FAIL',
            message: 'database_not_configured',
          })
        }
        if (!wechatPay.isConfigured()) {
          return reply.code(503).send({
            code: 'FAIL',
            message: 'wechat_pay_not_configured',
          })
        }
        if (!Buffer.isBuffer(request.body)) {
          return reply.code(400).send({
            code: 'FAIL',
            message: 'wechat_pay_callback_body_required',
          })
        }

        try {
          const verified =
            await wechatPay.verifyAndDecryptNotification({
              rawBody: request.body,
              headers: {
                'wechatpay-timestamp': stringHeader(
                  request.headers['wechatpay-timestamp'],
                ),
                'wechatpay-nonce': stringHeader(
                  request.headers['wechatpay-nonce'],
                ),
                'wechatpay-signature': stringHeader(
                  request.headers['wechatpay-signature'],
                ),
                'wechatpay-serial': stringHeader(
                  request.headers['wechatpay-serial'],
                ),
              },
            })

          const result = await settleVerifiedPaymentNotification({
            database,
            notification: verified,
          })
          if (result.status === 'rejected') {
            app.log.error(
              {
                reason: result.reason,
                outTradeNo: verified.outTradeNo,
                notificationId: verified.notificationId,
              },
              'Verified WeChat Pay callback rejected by business settlement',
            )
            return reply.code(409).send({
              code: 'FAIL',
              message: result.reason,
            })
          }

          return {
            code: 'SUCCESS',
            message: '成功',
          }
        } catch (error) {
          if (error instanceof WechatPayGatewayError) {
            return reply.code(401).send({
              code: 'FAIL',
              message: error.code,
            })
          }
          if (error instanceof CommercialStateError) {
            app.log.error(
              { err: error, code: error.code },
              'WeChat Pay settlement failed',
            )
            return reply.code(500).send({
              code: 'FAIL',
              message: error.code,
            })
          }
          throw error
        }
      },
    )
  })
}
