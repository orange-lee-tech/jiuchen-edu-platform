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
  // 始终附带一次性 wx.login code：
  // - 微信云托管若注入可信 x-wx-openid，后端优先使用 Header；
  // - 腾讯云侧云托管没有该 Header 时，后端可安全回退到 jscode2session。
  const code = await getWechatLoginCode()

  const result = await request<{ ok: true; user: BootstrapUser }>(
    '/auth/wechat/bootstrap',
    'POST',
    { code },
  )
  return result.user
}
