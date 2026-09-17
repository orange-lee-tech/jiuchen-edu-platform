import { runtimeConfig } from '../config/runtime'
import { request } from './request'

export type BootstrapUser = {
  id: string
  role: 'user' | 'student' | 'staff' | 'admin'
  displayName: string | null
}

function getWechatLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success(result) {
        if (result.code) {
          resolve(result.code)
          return
        }
        reject(new Error('微信登录未返回 code'))
      },
      fail(error) {
        reject(new Error(error.errMsg || '微信登录失败'))
      },
    })
  })
}

export async function bootstrapWechatUser(): Promise<BootstrapUser> {
  const payload: WechatMiniprogram.IAnyObject = {}

  // CloudBase callContainer 会自动把可信的 x-wx-openid 注入到后端。
  // 本地 HTTP 调试没有该 Header，因此仅在本地链路使用 wx.login code 兜底。
  if (runtimeConfig.apiTransport === 'http') {
    payload.code = await getWechatLoginCode()
  }

  const result = await request<{ ok: true; user: BootstrapUser }>(
    '/auth/wechat/bootstrap',
    'POST',
    payload,
  )
  return result.user
}
