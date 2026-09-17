import { runtimeConfig } from '../config/runtime'

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

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${runtimeConfig.apiBaseUrl}/auth/wechat/bootstrap`,
      method: 'POST',
      data: { code },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          const data = response.data as { ok: true; user: BootstrapUser }
          resolve(data.user)
          return
        }
        reject(new Error(`微信身份初始化失败（HTTP ${response.statusCode}）`))
      },
      fail(error) {
        reject(new Error(error.errMsg || '无法连接身份服务'))
      },
    })
  })
}
