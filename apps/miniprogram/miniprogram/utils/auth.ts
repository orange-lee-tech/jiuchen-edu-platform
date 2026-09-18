import { request } from './request'

export type LoginPortal = 'student' | 'teacher'

export type BootstrapUser = {
  id: string
  role: 'user' | 'student' | 'teacher' | 'staff' | 'admin'
  displayName: string | null
}

export type BootstrapResult = {
  ok: true
  user: BootstrapUser
  portal: LoginPortal
  needsProfileBinding: boolean
  agreement: {
    type: 'user_terms'
    version: string
    accepted: true
  }
}

export const USER_AGREEMENT_VERSION = 'placeholder-v0'
export const AUTH_STORAGE_KEY = 'jiuchen-auth-session'

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

export async function bootstrapWechatUser(
  portal: LoginPortal,
  agreementAccepted: boolean,
): Promise<BootstrapResult> {
  if (!agreementAccepted) {
    throw new Error('请先阅读并同意用户协议')
  }

  const code = await getWechatLoginCode()

  return request<BootstrapResult>(
    '/auth/wechat/bootstrap',
    'POST',
    {
      code,
      portal,
      agreementAccepted: true,
      agreementVersion: USER_AGREEMENT_VERSION,
    },
  )
}

export function saveAuthResult(result: BootstrapResult) {
  wx.setStorageSync(AUTH_STORAGE_KEY, result)
}

export function getSavedAuthResult(): BootstrapResult | null {
  const value = wx.getStorageSync(AUTH_STORAGE_KEY)
  if (!value || typeof value !== 'object') return null
  return value as BootstrapResult
}

export function clearSavedAuthResult() {
  wx.removeStorageSync(AUTH_STORAGE_KEY)
}
