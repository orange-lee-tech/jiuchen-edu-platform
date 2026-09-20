import { request } from './request'
import {
  clearApiSessionToken,
  saveApiSessionToken,
} from './session'

export type UserRole = 'user' | 'student' | 'teacher' | 'staff' | 'admin'

export type BusinessIdentity = {
  businessId: string
  type: 'student' | 'teacher' | 'admin'
  status: 'available' | 'claimed' | 'disabled'
}

export type BootstrapUser = {
  id: string
  role: UserRole
  displayName: string | null
}

export type BootstrapResult = {
  ok: true
  user: BootstrapUser
  businessIdentity: BusinessIdentity | null
  agreement: {
    type: 'user_terms'
    version: string
    accepted: true
  }
  session: {
    token: string
    expiresAt: string
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
      agreementAccepted: true,
      agreementVersion: USER_AGREEMENT_VERSION,
    },
  )
}

export async function bootstrapPhoneUser(
  phoneCode: string,
  agreementAccepted: boolean,
): Promise<BootstrapResult> {
  if (!agreementAccepted) {
    throw new Error('请先阅读并同意用户协议')
  }

  if (!phoneCode) {
    throw new Error('未取得手机号授权')
  }

  const wechatCode = await getWechatLoginCode()

  return request<BootstrapResult>(
    '/auth/phone/bootstrap',
    'POST',
    {
      phoneCode,
      wechatCode,
      agreementAccepted: true,
      agreementVersion: USER_AGREEMENT_VERSION,
    },
  )
}

export function saveAuthResult(result: BootstrapResult) {
  wx.setStorageSync(AUTH_STORAGE_KEY, result)
  saveApiSessionToken(result.session.token)
}

export function getSavedAuthResult(): BootstrapResult | null {
  const value = wx.getStorageSync(AUTH_STORAGE_KEY)
  if (!value || typeof value !== 'object') return null
  return value as BootstrapResult
}

export function updateSavedIdentity(
  role: UserRole,
  businessIdentity: BusinessIdentity,
) {
  const current = getSavedAuthResult()
  if (!current) return

  const updated: BootstrapResult = {
    ...current,
    user: {
      ...current.user,
      role,
    },
    businessIdentity,
  }

  wx.setStorageSync(AUTH_STORAGE_KEY, updated)
}

export function clearSavedAuthResult() {
  wx.removeStorageSync(AUTH_STORAGE_KEY)
  clearApiSessionToken()
}

export async function logoutWechatUser() {
  try {
    await request<{ ok: true }>('/auth/logout', 'POST', {})
  } finally {
    clearSavedAuthResult()
  }
}

export async function deleteCurrentAccount() {
  try {
    await request<{ ok: true }>('/auth/delete-account', 'POST', {})
  } finally {
    clearSavedAuthResult()
  }
}
