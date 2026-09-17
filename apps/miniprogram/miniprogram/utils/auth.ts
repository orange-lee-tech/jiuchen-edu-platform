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
  const code = await getWechatLoginCode()
  const result = await request<{ ok: true; user: BootstrapUser }>(
    '/auth/wechat/bootstrap',
    'POST',
    { code },
  )
  return result.user
}
