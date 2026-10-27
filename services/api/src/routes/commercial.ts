import type { FastifyInstance, FastifyReply } from 'fastify'
import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { AppEnv } from '../config/env.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { buildVirtualPayment, virtualPaymentConfig } from '../services/wechat-virtual-payment.js'
import { decryptVirtualPush, encryptedVirtualPushBody, parseVirtualGoodsPush,
  verifyVirtualPushSignature, verifyVirtualServerSignature } from '../services/wechat-virtual-push.js'
import { readVirtualOrder, reconcileVirtualOrder } from '../services/virtual-payment-reconciliation.js'
import { endRejectedVirtualOrder, UnpaidOrderError } from '../services/virtual-unpaid-order.js'
import { exchangeWechatVirtualPaymentCode } from '../services/wechat.js'
import type { DatabaseContext } from '../db/client.js'
import { canUseAssessment } from '../domain/auth-policy.js'
import {
  getPaymentOrder,
  settleVerifiedPaymentNotification,
} from '../services/payment-orders.js'
import {
  CommercialStateError,
  grantFreeCredits,
  readCreditAccount,
} from '../services/credit-ledger.js'
import {
  FIXED_ASSESSMENT_SKUS,
  GUEST_FREE_COUNT,
  STUDENT_TOTAL_FREE_COUNT,
  freeGrantsForRole,
  findCreditSku,
  type CommercialConfig,
} from '../services/commercial-config.js'
import {
  WechatPayGatewayError,
  type WechatPayGateway,
} from '../services/wechat-pay.js'
import { resolveSessionUser } from '../services/session.js'

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
  getConfig: () => Promise<CommercialConfig & { platformPriceConfirmed: boolean; adminSettingsApplied: boolean }>,
  wechatPay: WechatPayGateway,
  env: AppEnv,
) {
  const virtualConfig = virtualPaymentConfig(env)

  // WeChat virtual-goods messages use Mini Program message signing, not the
  // ordinary WeChat Pay V3 callback. A verified push still goes through the
  // official order query before ledger settlement and delivery confirmation.
  app.register(async (pushScope) => {
    for (const type of ['application/xml', 'text/xml']) {
      pushScope.addContentTypeParser(type, { parseAs: 'string' }, (_request, body, done) => done(null, body))
    }
    const route = '/payments/wechat/virtual-push'
    const success = '<xml><ErrCode>0</ErrCode><ErrMsg><![CDATA[success]]></ErrMsg></xml>'
    const retry = '<xml><ErrCode>1</ErrCode><ErrMsg><![CDATA[retry]]></ErrMsg></xml>'
    type PushQuery = { timestamp?: string; nonce?: string; signature?: string;
      msg_signature?: string; echostr?: string }
    pushScope.get<{ Querystring: PushQuery }>(route, { logLevel: 'silent' }, async (request, reply) => {
      const { timestamp, nonce, signature, msg_signature: encryptedSignature, echostr } = request.query
      if (!env.WECHAT_VIRTUAL_PUSH_TOKEN)
        return reply.code(503).send('virtual_push_not_configured')
      if (!timestamp || !nonce || !echostr)
        return reply.code(403).send('virtual_push_signature_invalid')
      if (signature) {
        if (!verifyVirtualServerSignature({ token: env.WECHAT_VIRTUAL_PUSH_TOKEN,
          timestamp, nonce, signature }))
          return reply.code(403).send('virtual_push_signature_invalid')
        return reply.type('text/plain').send(echostr)
      }
      if (!encryptedSignature || !env.WECHAT_VIRTUAL_PUSH_AES_KEY || !env.WECHAT_APP_ID ||
          !verifyVirtualPushSignature({ token: env.WECHAT_VIRTUAL_PUSH_TOKEN,
            timestamp, nonce, encrypted: echostr, signature: encryptedSignature }))
        return reply.code(403).send('virtual_push_signature_invalid')
      try {
        const challenge = decryptVirtualPush({ encrypted: echostr,
          aesKey: env.WECHAT_VIRTUAL_PUSH_AES_KEY, appId: env.WECHAT_APP_ID })
        return reply.type('text/plain').send(challenge)
      } catch {
        return reply.code(403).send('virtual_push_challenge_invalid')
      }
    })
    pushScope.post<{ Querystring: PushQuery; Body: string }>(route,
      { bodyLimit: 16_384, logLevel: 'silent' }, async (request, reply) => {
        reply.type('application/xml')
        if (!env.WECHAT_VIRTUAL_PUSH_TOKEN || !env.WECHAT_VIRTUAL_PUSH_AES_KEY ||
            !env.WECHAT_APP_ID || !virtualConfig || !database.configured)
          return reply.code(503).send(retry)
        try {
          if (typeof request.body !== 'string' || !request.query.timestamp ||
              !request.query.nonce || !request.query.msg_signature) throw new Error('push_payload_missing')
          const encrypted = encryptedVirtualPushBody(request.body)
          if (!verifyVirtualPushSignature({ token: env.WECHAT_VIRTUAL_PUSH_TOKEN,
            timestamp: request.query.timestamp, nonce: request.query.nonce,
            encrypted, signature: request.query.msg_signature }))
            return reply.code(403).send(retry)
          const message = decryptVirtualPush({ encrypted,
            aesKey: env.WECHAT_VIRTUAL_PUSH_AES_KEY, appId: env.WECHAT_APP_ID })
          const pushed = parseVirtualGoodsPush(message)
          const [rows] = await database.pool.query<import('mysql2/promise').RowDataPacket[]>(
            'SELECT id FROM payment_orders WHERE out_trade_no = ? LIMIT 1', [pushed.outTradeNo])
          const order = rows[0] ? await readVirtualOrder(database.pool, String(rows[0].id)) : null
          if (!order || order.openId !== pushed.openId ||
              order.wechatProductId !== pushed.productId) throw new Error('push_order_mismatch')
          const result = await reconcileVirtualOrder({ database, env, config: virtualConfig,
            order, checkPaidState: true })
          if (result.state !== 'paid' || result.deliveryPending || result.requiresFinanceReview)
            throw new Error('push_delivery_pending')
          return reply.send(success)
        } catch (error) {
          app.log.error({ code: error instanceof Error ? error.name : 'unknown' },
            'virtual goods push requires retry or operator review')
          return reply.code(503).send(retry)
        }
      })
  })

  app.get('/commercial/meta', async () => {
    const config = await getConfig()
    const visibleSkus = config.paymentSkus
    const virtualCheckoutReady = Boolean(config.creditEnforcementEnabled && virtualConfig &&
      config.platformPriceConfirmed && config.paymentSkus.length &&
      config.paymentSkus.every(sku => Boolean(virtualConfig.products[sku.key])))
    return ({
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
    rolePolicy: {
      guestFree: config.adminSettingsApplied ? config.freeGrant?.amount ?? 0 : GUEST_FREE_COUNT,
      studentTotalFree: config.adminSettingsApplied
        ? (config.freeGrant?.amount ?? 0) + (config.studentBonusGrant?.amount ?? 0)
        : STUDENT_TOTAL_FREE_COUNT,
    },
    payment: {
      provider: 'wechat_pay',
      providerConfigured: wechatPay.isConfigured(),
      // AI assessment credits are virtual goods under the 2026 WeChat policy.
      // Legacy JSAPI MUST NEVER be enabled as the credit checkout transport.
      checkoutEnabled: virtualCheckoutReady,
      checkoutReason: virtualCheckoutReady ? null : 'wechat_virtual_payment_not_configured_or_not_approved',
      catalog: visibleSkus,
      skus: visibleSkus,
    },
  })
  })

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
      const grants = []
      const config = await getConfig()
      for (const grantPolicy of freeGrantsForRole(config, user.role)) {
        grants.push(await grantFreeCredits({ database, userId: user.userId, grant: grantPolicy }))
      }
      const grant = grants[0] ?? null
      const account = await readCreditAccount(database, user.userId)
      return {
        ok: true,
        grant,
        grants,
        account,
      }
    } catch (error) {
      if (error instanceof CommercialStateError) {
        return commercialErrorReply(reply, error)
      }
      throw error
    }
  })

  // AI credits are virtual goods under WeChat's 2026 policy.
  // Never use ordinary JSAPI order creation for assessment credits.
  // Future checkout requires a SEPARATE reviewed virtual-payment provider.
  app.post('/me/payment-orders', async (_request, reply) => reply.code(503).send({
    ok: false,
    error: 'wechat_virtual_payment_adapter_required',
  }))

  // API v3 JSAPI is prohibited for evaluation credits; use xpay virtual
  // payments only. Never accept client-supplied price, credits, user ID or openID.
  const virtualCreateSchema = z.object({
    skuKey:z.enum(['assessment-1','assessment-10','JC000','JC001','JC002','JC003']),
    wechatCode:z.string().min(6).max(1024),
  }).strict()
  app.post<{Body:unknown}>('/me/virtual-payment-orders', async(request,reply)=>{
    const config = await getConfig()
    const virtualCheckoutReady = Boolean(config.creditEnforcementEnabled && virtualConfig &&
      config.platformPriceConfirmed && config.paymentSkus.length &&
      config.paymentSkus.every(sku => Boolean(virtualConfig.products[sku.key])))
    if(!virtualCheckoutReady || !virtualConfig)
      return reply.code(503).send({ok:false,error:'wechat_virtual_payment_not_ready'})
    if(!database.configured) return reply.code(503).send({ok:false,error:'database_not_configured'})
    const user=await resolveSessionUser(request,database)
    if(!user) return reply.code(401).send({ok:false,error:'unauthorized'})
    if(!canUseAssessment(user.role)) return reply.code(403).send({ok:false,error:'assessment_not_available_for_role'})
    const parsed=virtualCreateSchema.safeParse(request.body)
    if(!parsed.success) return reply.code(400).send({ok:false,error:'invalid_virtual_payment_payload'})
    // Older clients may still submit the two former names. They resolve to the
    // same fixed-price goods, and the new order always records the canonical SKU.
    const skuKey=parsed.data.skuKey==='assessment-1' ? 'JC001' :
      parsed.data.skuKey==='assessment-10' ? 'JC003' : parsed.data.skuKey
    const sku=findCreditSku(config,skuKey)
    if(!sku) return reply.code(400).send({ok:false,error:'unapproved_assessment_payment_sku'})
    if(!virtualConfig.products[sku.key]) return reply.code(503).send({ok:false,error:'wechat_virtual_product_not_configured'})
    const [identity]=await database.db.select({openid:users.wechatOpenId}).from(users).where(eq(users.id,user.userId)).limit(1)
    if(!identity?.openid) return reply.code(409).send({ok:false,error:'wechat_openid_missing'})
    // Do not store session_key; fresh code is bound to THIS same account's openID.
    let fresh
    try {
      fresh=await exchangeWechatVirtualPaymentCode(parsed.data.wechatCode,env)
    } catch {
      return reply.code(409).send({ok:false,error:'wechat_virtual_code_expired'})
    }
    if(fresh.openId!==identity.openid) return reply.code(403).send({ok:false,error:'wechat_identity_mismatch'})
    const id=randomUUID()
    const outTradeNo='JCV'+Date.now().toString(36).toUpperCase()+randomBytes(10).toString('hex').toUpperCase()
    let orderSku=sku
    let payment: ReturnType<typeof buildVirtualPayment> | null = null
    try {
      const connection=await database.pool.getConnection()
      try {
        await connection.beginTransaction()
        let initialized=false
        try {
          const [heads]=await connection.query<import('mysql2/promise').RowDataPacket[]>(
            'SELECT active_plan_id,version,initialized FROM credit_plan_head WHERE id=1 FOR UPDATE')
          const head=heads[0]
          initialized=Boolean(head?.initialized)
          if(initialized) {
            if(!head.active_plan_id) throw new Error('credit_plan_disabled')
            const fixed=FIXED_ASSESSMENT_SKUS.find(item=>item.key===skuKey)
            if(!fixed) throw new Error('credit_plan_sku_invalid')
            const [plans]=await connection.query<import('mysql2/promise').RowDataPacket[]>(
              "SELECT * FROM credit_plan_objects WHERE id=? AND status='active' FOR UPDATE",[head.active_plan_id])
            const plan=plans[0]
            if(!plan) throw new Error('credit_plan_pointer_invalid')
            const count=Number(plan['count_'+fixed.key.toLowerCase()])
            if(!Number.isInteger(count) || count<1 || count>100) throw new Error('credit_plan_count_invalid')
            orderSku={...fixed,creditAmount:count,planId:String(plan.id),planVersion:Number(plan.version)}
          }
        } catch(error) {
          if((error as {code?:string}).code!=='ER_NO_SUCH_TABLE') throw error
        }
        payment=buildVirtualPayment({config:virtualConfig,sku:orderSku,
          orderNo:outTradeNo,sessionKey:fresh.sessionKey})
        await connection.query(
          `INSERT INTO payment_orders
            (id,user_id,out_trade_no,provider,status,sku_key,plan_id,plan_version,
             amount_fen,credit_amount,pay_environment,wechat_product_id,expires_at)
           VALUES (?, ?, ?, 'wechat_pay', 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id,user.userId,outTradeNo,orderSku.key,orderSku.planId??null,orderSku.planVersion??null,
            orderSku.amountFen,orderSku.creditAmount,virtualConfig.env===0?'production':'sandbox',
            virtualConfig.products[orderSku.key],new Date(Date.now()+30*60*1000)],
        )
        await connection.commit()
      } catch(error) { await connection.rollback(); throw error }
      finally { connection.release() }
    } catch(error) {
      if(error instanceof Error && error.message.startsWith('credit_plan_'))
        return reply.code(409).send({ok:false,error:error.message})
      app.log.error({code:error instanceof Error?error.name:'unknown'},'virtual payment order persistence failed')
      return reply.code(503).send({ok:false,error:'virtual_payment_schema_not_ready'})
    }
    return {ok:true,order:{id,status:'pending',amountFen:orderSku.amountFen,creditAmount:orderSku.creditAmount},payment}
  })

  app.post<{Params:{id:string}}>('/me/virtual-payment-orders/:id/reconcile',async(request,reply)=>{
    if(!virtualConfig || !(await getConfig()).creditEnforcementEnabled) return reply.code(503).send({ok:false,error:'wechat_virtual_payment_not_ready'})
    if(!database.configured) return reply.code(503).send({ok:false,error:'database_not_configured'})
    const user=await resolveSessionUser(request,database)
    if(!user) return reply.code(401).send({ok:false,error:'unauthorized'})
    if(!canUseAssessment(user.role)) return reply.code(403).send({ok:false,error:'assessment_not_available_for_role'})
    const order=await readVirtualOrder(database.pool,request.params.id,user.userId)
    if(!order) return reply.code(404).send({ok:false,error:'virtual_order_not_found'})
    if(!order.openId) return reply.code(409).send({ok:false,error:'wechat_openid_missing'})
    try {
      return {ok:true,...await reconcileVirtualOrder({database,env,config:virtualConfig,order,checkPaidState:true})}
    }
    catch(error){
      app.log.warn({err:error,orderId:order.id},'virtual payment query not yet verified')
      return reply.code(503).send({ok:false,error:'virtual_payment_query_unavailable'})
    }
  })

  const endUnpaidSchema=z.object({
    prePaymentErrorCode:z.literal(-15013),confirmUnpaid:z.literal(true),
  }).strict()
  app.post<{Params:{id:string};Body:unknown}>(
    '/me/virtual-payment-orders/:id/end-unpaid',async(request,reply)=>{
      if(!virtualConfig || !database.configured)
        return reply.code(503).send({ok:false,error:'wechat_virtual_payment_not_ready'})
      const user=await resolveSessionUser(request,database)
      if(!user) return reply.code(401).send({ok:false,error:'unauthorized'})
      if(!canUseAssessment(user.role))
        return reply.code(403).send({ok:false,error:'assessment_not_available_for_role'})
      const parsed=endUnpaidSchema.safeParse(request.body)
      if(!parsed.success || !z.string().uuid().safeParse(request.params.id).success)
        return reply.code(400).send({ok:false,error:'invalid_virtual_unpaid_end_payload'})
      try {
        const result=await endRejectedVirtualOrder({database,env,config:virtualConfig,
          orderId:request.params.id,userId:user.userId,...parsed.data})
        app.log.warn({orderId:request.params.id,
          reason:'pre_checkout_rejection',officialCode:268490002},
          'Unpaid virtual order ended after official and ledger verification')
        return {ok:true,...result}
      } catch(error) {
        if(error instanceof UnpaidOrderError)
          return reply.code(error.code==='virtual_order_not_found'?404:409)
            .send({ok:false,error:error.code})
        app.log.warn({orderId:request.params.id,code:error instanceof Error?error.name:'unknown'},
          'Unpaid virtual order official verification unavailable')
        return reply.code(503).send({ok:false,error:'virtual_payment_query_unavailable'})
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
