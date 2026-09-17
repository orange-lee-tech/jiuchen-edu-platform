import { z } from 'zod'
import type { AppEnv } from '../config/env.js'

const successSchema = z.object({
  openid: z.string().min(1),
  session_key: z.string().min(1),
  unionid: z.string().min(1).optional(),
})

const errorSchema = z.object({
  errcode: z.number(),
  errmsg: z.string().optional(),
})

export type WechatIdentity = {
  openId: string
  unionId?: string
}

export async function exchangeWechatLoginCode(
  code: string,
  env: AppEnv,
): Promise<WechatIdentity> {
  if (!env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET) {
    throw new Error('wechat_not_configured')
  }

  const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
  url.searchParams.set('appid', env.WECHAT_APP_ID)
  url.searchParams.set('secret', env.WECHAT_APP_SECRET)
  url.searchParams.set('js_code', code)
  url.searchParams.set('grant_type', 'authorization_code')

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`wechat_http_${response.status}`)
  }

  const payload = await response.json()
  const error = errorSchema.safeParse(payload)
  if (error.success) {
    throw new Error(`wechat_api_${error.data.errcode}`)
  }

  const result = successSchema.parse(payload)
  return {
    openId: result.openid,
    unionId: result.unionid,
  }
}
