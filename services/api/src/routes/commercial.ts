import type { FastifyInstance, FastifyReply } from 'fastify'
import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { AppEnv } from '../config/env.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { buildVirtualPayment, queryVirtualPayment, virtualPaymentConfig,
  virtualPaymentOperationalConfig } from '../services/wechat-virtual-payment.js'
import { decryptVirtualPush, encryptedVirtualPushBody, parseVirtualGoodsPush,
  parseVirtualAncillaryPush, virtualPushEvent,
  verifyVirtualPushSignature, verifyVirtualServerSignature } from '../services/wechat-virtual-push.js'
import { recordVirtualAncillaryPush, recordVirtualPaymentCase, reviewVirtualPaymentCase } from '../services/virtual-payment-cases.js'
import { readVirtualOrder, reconcileVirtualOrder } from '../services/virtual-payment-reconciliation.js'
import { endRejectedVirtualOrder, UnpaidOrderError } from '../services/virtual-unpaid-order.js'
import { exchangeWechatVirtualPaymentCode } from '../services/wechat.js'
import type { DatabaseContext } from '../db/client.js'
import { canAccessAdminWorkspace, canUseAssessment } from '../domain/auth-policy.js'
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
  const operationalConfig = virtualPaymentOperationalConfig(env)

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
            !env.WECHAT_APP_ID || !operationalConfig || !database.configured)
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
          const event=virtualPushEvent(message)
          if(event==='xpay_refund_notify' || event==='xpay_complaint_notify') {
            const ancillary=parseVirtualAncillaryPush(message)
            if(ancillary.event==='refund' && ancillary.env!==operationalConfig.env)
              throw new Error('virtual_refund_environment_mismatch')
            await recordVirtualAncillaryPush(database.pool,operationalConfig,ancillary)
            return reply.send(success)
          }
          if(event!=='xpay_goods_deliver_notify') {
            // This merchant sells direct goods only. A verified unrelated event
            // cannot grant credits and should not trigger repeated push retries.
            app.log.warn({code:'virtual_push_event_unhandled'},'verified unrelated WeChat event ignored')
            return reply.send(success)
          }
          const pushed = parseVirtualGoodsPush(message)
          const [rows] = await database.pool.query<import('mysql2/promise').RowDataPacket[]>(
            'SELECT id FROM payment_orders WHERE out_trade_no = ? LIMIT 1', [pushed.outTradeNo])
          const order = rows[0] ? await readVirtualOrder(database.pool, String(rows[0].id)) : null
          if (!order || order.openId !== pushed.openId ||
              order.wechatProductId !== pushed.productId ||
              order.payEnvironment !== (pushed.env===0?'production':'sandbox') ||
              (pushed.actualPriceFen!==null && order.amountFen!==pushed.actualPriceFen))
            throw new Error('push_order_mismatch')
          if(order.status==='closed') {
            const late=await queryVirtualPayment(env,operationalConfig,order.openId!,order.outTradeNo,
              order.amountFen,order.wechatProductId??undefined)
            if(late.state==='paid' || late.state==='review' || late.state==='refunded') {
              await recordVirtualPaymentCase(database.pool,{eventKey:'late:'+order.id,
                orderId:order.id,kind:'late_payment',state:'open',
                reasonCode:'closed_order_payment_evidence'})
              return reply.send(success)
            }
            throw new Error('push_closed_order_unverified')
          }
          const result = await reconcileVirtualOrder({ database, env, config: operationalConfig,
            order, checkPaidState: true,deliveryPush:true })
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
    if(!operationalConfig) return reply.code(503).send({ok:false,error:'wechat_virtual_payment_not_ready'})
    if(!database.configured) return reply.code(503).send({ok:false,error:'database_not_configured'})
    const user=await resolveSessionUser(request,database)
    if(!user) return reply.code(401).send({ok:false,error:'unauthorized'})
    if(!canUseAssessment(user.role)) return reply.code(403).send({ok:false,error:'assessment_not_available_for_role'})
    const order=await readVirtualOrder(database.pool,request.params.id,user.userId)
    if(!order) return reply.code(404).send({ok:false,error:'virtual_order_not_found'})
    if(!order.openId) return reply.code(409).send({ok:false,error:'wechat_openid_missing'})
    try {
      return {ok:true,...await reconcileVirtualOrder({database,env,config:operationalConfig,order,checkPaidState:true})}
    }
    catch(error){
      app.log.warn({err:error,orderId:order.id},'virtual payment query not yet verified')
      return reply.code(503).send({ok:false,error:'virtual_payment_query_unavailable'})
    }
  })

  const endUnpaidSchema=z.object({
    prePaymentErrorCode:z.number().int().min(-99999).max(99999).optional(),
    confirmUnpaid:z.literal(true),
  }).strict()
  app.post<{Params:{id:string};Body:unknown}>(
    '/me/virtual-payment-orders/:id/end-unpaid',async(request,reply)=>{
      if(!operationalConfig || !database.configured)
        return reply.code(503).send({ok:false,error:'wechat_virtual_payment_not_ready'})
      const user=await resolveSessionUser(request,database)
      if(!user) return reply.code(401).send({ok:false,error:'unauthorized'})
      if(!canUseAssessment(user.role))
        return reply.code(403).send({ok:false,error:'assessment_not_available_for_role'})
      const parsed=endUnpaidSchema.safeParse(request.body)
      if(!parsed.success || !z.string().uuid().safeParse(request.params.id).success)
        return reply.code(400).send({ok:false,error:'invalid_virtual_unpaid_end_payload'})
      try {
        const result=await endRejectedVirtualOrder({database,env,config:operationalConfig,
          orderId:request.params.id,userId:user.userId,...parsed.data})
        app.log.warn({orderId:request.params.id,
          reason:'verified_unpaid_after_checkout_expiry',officialCode:268490002},
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

  // These read models are projections of the same payment orders and credit
  // ledger used for settlement. They never infer payment from a client callback.
  app.get('/me/virtual-payment-orders',async(request,reply)=>{
    if(!database.configured) return reply.code(503).send({ok:false,error:'database_not_configured'})
    const user=await resolveSessionUser(request,database)
    if(!user) return reply.code(401).send({ok:false,error:'unauthorized'})
    const [orders]=await database.pool.query<import('mysql2/promise').RowDataPacket[]>(
      `SELECT p.id,p.sku_key AS skuKey,p.status,p.amount_fen AS amountFen,
        p.credit_amount AS purchasedCredits,p.created_at AS createdAt,p.paid_at AS paidAt,
        p.virtual_delivery_confirmed_at AS deliveredAt,
        COALESCE((SELECT SUM(l.delta) FROM credit_ledger_entries l
          WHERE l.payment_order_id=p.id AND l.type='payment_grant'),0) AS credited,
        (SELECT c.state FROM virtual_payment_cases c WHERE c.order_id=p.id
          ORDER BY c.created_at DESC LIMIT 1) AS reviewState
       FROM payment_orders p WHERE p.user_id=? AND p.out_trade_no LIKE 'JCV%'
       ORDER BY p.created_at DESC LIMIT 30`,[user.userId])
    return {ok:true,orders}
  })

  app.post<{Params:{id:string}}>('/me/virtual-payment-orders/:id/after-sales',
    async(request,reply)=>{
      if(!database.configured) return reply.code(503).send({ok:false,error:'database_not_configured'})
      const user=await resolveSessionUser(request,database)
      if(!user) return reply.code(401).send({ok:false,error:'unauthorized'})
      if(!canUseAssessment(user.role))
        return reply.code(403).send({ok:false,error:'assessment_not_available_for_role'})
      if(!z.string().uuid().safeParse(request.params.id).success)
        return reply.code(400).send({ok:false,error:'invalid_order_id'})
      const [rows]=await database.pool.query<import('mysql2/promise').RowDataPacket[]>(
        `SELECT id,status,paid_at AS paidAt,provider_transaction_id AS transactionId
         FROM payment_orders WHERE id=? AND user_id=? AND out_trade_no LIKE 'JCV%' LIMIT 1`,
        [request.params.id,user.userId])
      const order=rows[0]
      if(!order) return reply.code(404).send({ok:false,error:'virtual_order_not_found'})
      if(order.status!=='paid' || !order.paidAt || !order.transactionId)
        return reply.code(409).send({ok:false,error:'after_sales_payment_not_verified'})
      await recordVirtualPaymentCase(database.pool,{eventKey:'after_sales:'+order.id,
        orderId:String(order.id),kind:'refund',state:'open',reasonCode:'customer_refund_request'})
      return {ok:true,state:'review_requested'}
    })

  app.get<{Querystring:{status?:string;sku?:string}}>('/me/admin/virtual-payment-orders',
    async(request,reply)=>{
      if(!database.configured) return reply.code(503).send({ok:false,error:'database_not_configured'})
      const user=await resolveSessionUser(request,database)
      if(!user) return reply.code(401).send({ok:false,error:'unauthorized'})
      if(!canAccessAdminWorkspace(user.role)) return reply.code(403).send({ok:false,error:'admin_forbidden'})
      const filters=z.object({status:z.enum(['pending','paid','closed','refunded']).optional(),
        sku:z.enum(['JC000','JC001','JC002','JC003']).optional()}).safeParse(request.query)
      if(!filters.success) return reply.code(400).send({ok:false,error:'invalid_order_filter'})
      const [orders]=await database.pool.query<import('mysql2/promise').RowDataPacket[]>(
        `SELECT p.id,p.sku_key AS skuKey,p.status,p.amount_fen AS amountFen,
          p.credit_amount AS purchasedCredits,p.created_at AS createdAt,p.paid_at AS paidAt,
          p.virtual_delivery_confirmed_at AS deliveredAt,p.virtual_reconcile_checked_at AS lastCheckedAt,
          COALESCE((SELECT SUM(l.delta) FROM credit_ledger_entries l
            WHERE l.payment_order_id=p.id AND l.type='payment_grant'),0) AS credited,
          (SELECT c.state FROM virtual_payment_cases c WHERE c.order_id=p.id
            ORDER BY c.created_at DESC LIMIT 1) AS reviewState
         FROM payment_orders p WHERE p.out_trade_no LIKE 'JCV%'
           AND (? IS NULL OR p.status=?) AND (? IS NULL OR p.sku_key=?)
         ORDER BY p.created_at DESC LIMIT 50`,
        [filters.data.status??null,filters.data.status??null,
          filters.data.sku??null,filters.data.sku??null])
      return {ok:true,orders}
    })

  app.get<{Querystring:{state?:string}}>('/me/admin/virtual-payment-cases',async(request,reply)=>{
    if(!database.configured) return reply.code(503).send({ok:false,error:'database_not_configured'})
    const user=await resolveSessionUser(request,database)
    if(!user) return reply.code(401).send({ok:false,error:'unauthorized'})
    if(!canAccessAdminWorkspace(user.role)) return reply.code(403).send({ok:false,error:'admin_forbidden'})
    const filter=z.enum(['open','processing','succeeded','failed','resolved']).optional().safeParse(request.query.state)
    if(!filter.success) return reply.code(400).send({ok:false,error:'invalid_case_filter'})
    const [cases]=await database.pool.query<import('mysql2/promise').RowDataPacket[]>(
      `SELECT c.id,c.order_id AS orderId,c.kind,c.state,c.reason_code AS reasonCode,
        c.refund_amount_fen AS refundAmountFen,c.last_checked_at AS lastCheckedAt,
        c.created_at AS createdAt,p.sku_key AS skuKey,p.status AS orderStatus,
        p.amount_fen AS amountFen,p.credit_amount AS purchasedCredits,
        COALESCE((SELECT SUM(l.delta) FROM credit_ledger_entries l
          WHERE l.payment_order_id=c.order_id AND l.type='payment_grant'),0) AS credited
       FROM virtual_payment_cases c LEFT JOIN payment_orders p ON p.id=c.order_id
       WHERE (? IS NULL OR c.state=?) ORDER BY c.created_at DESC LIMIT 50`,
      [filter.data??null,filter.data??null])
    return {ok:true,cases}
  })

  app.get('/me/admin/virtual-payment-reconciliation',async(request,reply)=>{
    if(!database.configured) return reply.code(503).send({ok:false,error:'database_not_configured'})
    const user=await resolveSessionUser(request,database)
    if(!user) return reply.code(401).send({ok:false,error:'unauthorized'})
    if(!canAccessAdminWorkspace(user.role)) return reply.code(403).send({ok:false,error:'admin_forbidden'})
    const [rows]=await database.pool.query<import('mysql2/promise').RowDataPacket[]>(
      `SELECT COUNT(*) AS orders,
        SUM(CASE WHEN p.status='paid' AND p.credited<p.credit_amount THEN 1 ELSE 0 END) AS paidNotCredited,
        SUM(CASE WHEN p.credited>0 AND p.virtual_delivery_confirmed_at IS NULL THEN 1 ELSE 0 END) AS creditedNotDelivered,
        SUM(CASE WHEN p.status='refunded' AND p.credited>0 THEN 1 ELSE 0 END) AS refundCreditReview
       FROM (SELECT o.id,o.status,o.credit_amount,o.virtual_delivery_confirmed_at,
         COALESCE((SELECT SUM(l.delta) FROM credit_ledger_entries l
           WHERE l.payment_order_id=o.id AND l.type='payment_grant'),0) AS credited
         FROM payment_orders o WHERE o.out_trade_no LIKE 'JCV%'
           AND o.created_at>=CURRENT_TIMESTAMP-INTERVAL 1 DAY) p`)
    const [cases]=await database.pool.query<import('mysql2/promise').RowDataPacket[]>(
      `SELECT kind,COUNT(*) AS count FROM virtual_payment_cases
       WHERE state<>'resolved' AND created_at>=CURRENT_TIMESTAMP-INTERVAL 1 DAY
       GROUP BY kind`)
    const summary=rows[0]
    return {ok:true,window:'rolling_24_hours',generatedAt:new Date().toISOString(),
      local:{orders:Number(summary?.orders??0),
        paidNotCredited:Number(summary?.paidNotCredited??0),
        creditedNotDelivered:Number(summary?.creditedNotDelivered??0),
        refundCreditReview:Number(summary?.refundCreditReview??0),
        openCases:cases.map(row=>({kind:String(row.kind),count:Number(row.count)}))},
      officialOrderSource:'verified_query_and_push',wechatBill:'not_connected'}
  })

  app.post<{Params:{id:string}}>('/me/admin/virtual-payment-orders/:id/recheck',
    async(request,reply)=>{
      if(!database.configured || !operationalConfig)
        return reply.code(503).send({ok:false,error:'wechat_virtual_payment_not_ready'})
      const user=await resolveSessionUser(request,database)
      if(!user) return reply.code(401).send({ok:false,error:'unauthorized'})
      if(!canAccessAdminWorkspace(user.role)) return reply.code(403).send({ok:false,error:'admin_forbidden'})
      if(!z.string().uuid().safeParse(request.params.id).success)
        return reply.code(400).send({ok:false,error:'invalid_order_id'})
      const order=await readVirtualOrder(database.pool,request.params.id)
      if(!order) return reply.code(404).send({ok:false,error:'virtual_order_not_found'})
      try {return {ok:true,...await reconcileVirtualOrder({database,env,config:operationalConfig,
        order,checkPaidState:true})}}
      catch(error) {
        app.log.warn({orderId:order.id,code:error instanceof Error?error.name:'unknown'},
          'manual virtual order check unavailable')
        return reply.code(503).send({ok:false,error:'virtual_payment_query_unavailable'})
      }
    })

  app.post<{Params:{id:string};Body:unknown}>('/me/admin/virtual-payment-cases/:id/review',
    async(request,reply)=>{
      if(!database.configured) return reply.code(503).send({ok:false,error:'database_not_configured'})
      const user=await resolveSessionUser(request,database)
      if(!user) return reply.code(401).send({ok:false,error:'unauthorized'})
      if(!canAccessAdminWorkspace(user.role)) return reply.code(403).send({ok:false,error:'admin_forbidden'})
      const body=z.object({note:z.string().trim().min(8).max(500),
        action:z.enum(['processing','resolved'])}).strict().safeParse(request.body)
      if(!z.string().uuid().safeParse(request.params.id).success || !body.success)
        return reply.code(400).send({ok:false,error:'invalid_case_review'})
      const connection=await database.pool.getConnection()
      try {await reviewVirtualPaymentCase(connection,{caseId:request.params.id,
        actorUserId:user.userId,note:body.data.note,action:body.data.action});return {ok:true}}
      catch(error) {
        if(error instanceof Error && error.message==='virtual_case_not_found')
          return reply.code(404).send({ok:false,error:'virtual_case_not_found'})
        throw error
      } finally {connection.release()}
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
