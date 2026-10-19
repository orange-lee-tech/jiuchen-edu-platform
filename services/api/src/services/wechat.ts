import { z } from 'zod'
import type { AppEnv } from '../config/env.js'

const loginSuccessSchema = z.object({
  openid: z.string().min(1),
  session_key: z.string().min(1),
  unionid: z.string().min(1).optional(),
})

const stableTokenSuccessSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
})

const phoneSuccessSchema = z.object({
  errcode: z.literal(0).optional(),
  errmsg: z.string().optional(),
  phone_info: z.object({
    phoneNumber: z.string().min(1),
    purePhoneNumber: z.string().min(1),
    countryCode: z.string().min(1),
  }),
})

const errorSchema = z.object({
  errcode: z.number(),
  errmsg: z.string().optional(),
})

export type WechatIdentity = {
  openId: string
  unionId?: string
}

export type WechatPhoneInfo = {
  phoneNumber: string
  purePhoneNumber: string
  countryCode: string
}

let stableTokenCache:
  | {
      token: string
      expiresAt: number
    }
  | undefined

function assertWechatConfigured(env: AppEnv) {
  if (!env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET) {
    throw new Error('wechat_not_configured')
  }

  return {
    appId: env.WECHAT_APP_ID,
    appSecret: env.WECHAT_APP_SECRET,
  }
}

function throwWechatApiError(payload: unknown, prefix: string) {
  const error = errorSchema.safeParse(payload)
  if (!error.success || error.data.errcode === 0) return

  throw new Error(
    `${prefix}_${error.data.errcode}:${error.data.errmsg ?? 'unknown'}`,
  )
}

export async function exchangeWechatLoginCode(
  code: string,
  env: AppEnv,
): Promise<WechatIdentity> {
  const { appId, appSecret } = assertWechatConfigured(env)

  const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
  url.searchParams.set('appid', appId)
  url.searchParams.set('secret', appSecret)
  url.searchParams.set('js_code', code)
  url.searchParams.set('grant_type', 'authorization_code')

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`wechat_http_${response.status}`)
  }

  const payload = await response.json()
  throwWechatApiError(payload, 'wechat_api')

  const result = loginSuccessSchema.parse(payload)
  return {
    openId: result.openid,
    unionId: result.unionid,
  }
}

export async function getWechatStableAccessToken(env: AppEnv): Promise<string> {
  const now = Date.now()
  if (stableTokenCache && stableTokenCache.expiresAt > now) {
    return stableTokenCache.token
  }

  const { appId, appSecret } = assertWechatConfigured(env)

  const response = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'client_credential',
      appid: appId,
      secret: appSecret,
      force_refresh: false,
    }),
  })

  if (!response.ok) {
    throw new Error(`wechat_stable_token_http_${response.status}`)
  }

  const payload = await response.json()
  throwWechatApiError(payload, 'wechat_stable_token')

  const result = stableTokenSuccessSchema.parse(payload)
  stableTokenCache = {
    token: result.access_token,
    // Keep a five-minute safety margin so callers do not race token expiry.
    expiresAt: now + Math.max(60, result.expires_in - 300) * 1000,
  }

  return result.access_token
}

export async function exchangeWechatPhoneCode(
  code: string,
  env: AppEnv,
): Promise<WechatPhoneInfo> {
  const accessToken = await getWechatStableAccessToken(env)
  const url = new URL(
    'https://api.weixin.qq.com/wxa/business/getuserphonenumber',
  )
  url.searchParams.set('access_token', accessToken)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ code }),
  })

  if (!response.ok) {
    throw new Error(`wechat_phone_http_${response.status}`)
  }

  const payload = await response.json()
  throwWechatApiError(payload, 'wechat_phone')

  const result = phoneSuccessSchema.parse(payload)
  return {
    phoneNumber: result.phone_info.phoneNumber,
    purePhoneNumber: result.phone_info.purePhoneNumber,
    countryCode: result.phone_info.countryCode,
  }
}

/** Only for creating one virtual-payment purchase. The session key is never
 * persisted or exposed; require the OpenID to match the authenticated account. */
export async function exchangeWechatVirtualPaymentCode(code: string, env: AppEnv) {
  const { appId, appSecret } = assertWechatConfigured(env)
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
  url.searchParams.set('appid',appId)
  url.searchParams.set('secret',appSecret)
  url.searchParams.set('js_code',code)
  url.searchParams.set('grant_type','authorization_code')
  const response=await fetch(url,{signal:AbortSignal.timeout(10000)})
  if(!response.ok) throw new Error('wechat_virtual_login_http_failure')
  const payload: unknown=await response.json()
  throwWechatApiError(payload,'wechat_virtual_login')
  const result=loginSuccessSchema.parse(payload)
  return {openId:result.openid,sessionKey:result.session_key}
}
