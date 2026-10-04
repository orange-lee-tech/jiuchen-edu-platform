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

let memoryAuthResult: BootstrapResult | null | undefined

const USER_ROLES = new Set<UserRole>([
  'user',
  'student',
  'teacher',
  'staff',
  'admin',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isBootstrapResult(value: unknown): value is BootstrapResult {
  if (!isRecord(value) || value.ok !== true) return false

  const user = value.user
  const session = value.session

  if (!isRecord(user) || !isRecord(session)) return false
  if (typeof user.id !== 'string' || !user.id) return false
  if (typeof user.role !== 'string' || !USER_ROLES.has(user.role as UserRole)) {
    return false
  }

  return (
    typeof session.token === 'string' &&
    session.token.length > 0 &&
    typeof session.expiresAt === 'string' &&
    session.expiresAt.length > 0
  )
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
  if (!isBootstrapResult(result)) {
    clearSavedAuthResult()
    throw new Error('backend_version_mismatch')
  }

  saveApiSessionToken(result.session.token)

  try {
    wx.setStorageSync(AUTH_STORAGE_KEY, result)
    memoryAuthResult = result
  } catch (error) {
    memoryAuthResult = null
    clearApiSessionToken()
    throw error
  }
}

export function getSavedAuthResult(): BootstrapResult | null {
  if (memoryAuthResult !== undefined) return memoryAuthResult

  const value = wx.getStorageSync(AUTH_STORAGE_KEY)

  if (!isBootstrapResult(value)) {
    memoryAuthResult = null
    if (value) {
      wx.removeStorageSync(AUTH_STORAGE_KEY)
      clearApiSessionToken()
    }
    return null
  }

  memoryAuthResult = value
  return memoryAuthResult
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
  memoryAuthResult = updated
}

export function clearSavedAuthResult() {
  memoryAuthResult = null
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
  await request<{ ok: true }>('/auth/delete-account', 'POST', {})
  clearSavedAuthResult()
}
