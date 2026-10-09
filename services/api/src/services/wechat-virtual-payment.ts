import { createHash, createHmac } from 'node:crypto'
import { z } from 'zod'
import type { AppEnv } from '../config/env.js'
import type { CreditSku } from './commercial-config.js'
import { getWechatStableAccessToken } from './wechat.js'

export type VirtualPayConfig = {
  offerId: string
  appKey: string
  env: 0 | 1
  products: Record<string,string>
}
export type VirtualPaymentParams = {
  mode: 'goods'
  signData: string
  paySig: string
  signature: string
}

export function virtualPaymentConfig(env: AppEnv): VirtualPayConfig | null {
  if (env.WECHAT_VIRTUAL_PAY_ENABLED !== true ||
    !env.WECHAT_VIRTUAL_PAY_APP_KEY || !env.WECHAT_VIRTUAL_PAY_OFFER_ID ||
    !env.WECHAT_VIRTUAL_PAY_PRODUCT_ONE || !env.WECHAT_VIRTUAL_PAY_PRODUCT_TEN) return null
  if(env.WECHAT_VIRTUAL_PAY_ENV === 'production' && env.WECHAT_VIRTUAL_PAY_PRODUCTION_APPROVED !== true) return null
  return {
    offerId:env.WECHAT_VIRTUAL_PAY_OFFER_ID,
    appKey:env.WECHAT_VIRTUAL_PAY_APP_KEY,
    env:env.WECHAT_VIRTUAL_PAY_ENV === 'production' ? 0 : 1,
    products:{'assessment-1':env.WECHAT_VIRTUAL_PAY_PRODUCT_ONE,
      'assessment-10':env.WECHAT_VIRTUAL_PAY_PRODUCT_TEN},
  }
}
export function paySig(uri:string,body:string,key:string) {
  if(!/^requestVirtualPayment$|^\/xpay\/[a-z_]+$/.test(uri)) throw new Error('virtual_uri_not_allowed')
  return createHmac('sha256',key).update(uri+'&'+body,'utf8').digest('hex')
}
export function signature(body:string,key:string) {
  return createHmac('sha256',key).update(body,'utf8').digest('hex')
}
export function buildVirtualPayment(input:{config:VirtualPayConfig;sku:CreditSku;orderNo:string;sessionKey:string}):VirtualPaymentParams {
  const productId=input.config.products[input.sku.key]
  if(!productId || !/^JC[A-Z0-9]{12,50}$/.test(input.orderNo)) throw new Error('virtual_checkout_bad_sku_or_order')
  const signData=JSON.stringify({
    mode:'goods',offerId:input.config.offerId,buyQuantity:1,
    env:input.config.env,currencyType:'CNY',productId,
    goodsPrice:input.sku.amountFen,outTradeNo:input.orderNo,attach:'',
  })
  return {mode:'goods',signData,
    paySig:paySig('requestVirtualPayment',signData,input.config.appKey),
    signature:signature(signData,input.sessionKey)}
}

const xpayQueryResponseSchema=z.object({
  errcode:z.number().optional(),
  errmsg:z.string().optional(),
  order:z.object({
    order_id:z.string(),order_fee:z.number().int(),
    paid_fee:z.number().int().optional(),
    status:z.number().int(),
    wx_order_id:z.string().optional(),
    wxpay_order_id:z.string().optional(),
    env_type:z.number().optional(),
  }).optional(),
})
export type VerifiedVirtualOrder = { state:'paid'|'pending'|'refunded'|'closed';transactionId:string|null;notificationId:string|null;payloadHash:string|null }
export function verifyVirtualQuery(payload:unknown, orderNo:string, expectedFen:number): VerifiedVirtualOrder {
  const result=xpayQueryResponseSchema.parse(payload)
  if(result.errcode!==undefined && result.errcode!==0) throw new Error('virtual_query_rejected')
  const order=result.order
  if(!order || order.order_id!==orderNo || order.order_fee!==expectedFen) throw new Error('virtual_order_mismatch')
  if([5,8,9,10].includes(order.status)) return {state:'refunded',transactionId:null,notificationId:null,payloadHash:null}
  if(order.status===6) return {state:'closed',transactionId:null,notificationId:null,payloadHash:null}
  if(![2,3,4].includes(order.status)) return {state:'pending',transactionId:null,notificationId:null,payloadHash:null}
  const transactionId=order.wx_order_id || order.wxpay_order_id
  if(!transactionId || transactionId.length>64 || order.paid_fee!==expectedFen)
    throw new Error('virtual_paid_evidence_incomplete')
  const evidence='virtual:'+orderNo+':'+transactionId+':'+expectedFen
  return {state:'paid',transactionId,notificationId:createHash('sha256').update(evidence).digest('hex'),
    payloadHash:createHash('sha256').update(evidence).digest('hex')}
}
async function postSignedXpay(config:VirtualPayConfig,env:AppEnv,path:string,body:string):Promise<unknown> {
  const token=await getWechatStableAccessToken(env)
  const url=new URL('https://api.weixin.qq.com'+path)
  url.searchParams.set('access_token',token)
  url.searchParams.set('pay_sig',paySig(path,body,config.appKey))
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body,signal:AbortSignal.timeout(9000)})
  if(!response.ok) throw new Error('virtual_gateway_http_'+response.status)
  return response.json()
}
export async function queryVirtualPayment(env:AppEnv,config:VirtualPayConfig,openId:string,orderNo:string,fen:number) {
  const payload=await postSignedXpay(config,env,'/xpay/query_order',JSON.stringify({
    openid:openId,env:config.env,order_id:orderNo,
  }))
  return verifyVirtualQuery(payload,orderNo,fen)
}
export async function confirmVirtualDelivery(env:AppEnv,config:VirtualPayConfig,orderNo:string) {
  const result=z.object({errcode:z.number(),errmsg:z.string().optional()}).parse(
    await postSignedXpay(config,env,'/xpay/notify_provide_goods',JSON.stringify({order_id:orderNo,env:config.env})))
  if(result.errcode!==0) throw new Error('virtual_delivery_notification_pending')
}
