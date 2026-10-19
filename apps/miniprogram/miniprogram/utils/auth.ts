import { friendlyRequestError, request } from './request'
import {
  clearApiSessionToken,
  onSessionInvalidated,
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
export type AuthState = {
  phase: 'loading' | 'ready' | 'error'
  auth: BootstrapResult | null
  message: string
}
let authState: AuthState = { phase: 'loading', auth: null, message: '' }
let authGeneration = 0
let authRefresh: { token: string; promise: Promise<BootstrapResult | null> } | null = null
const authListeners = new Set<(state: AuthState) => void>()

function publishAuth(state: AuthState) {
  authState = state
  authListeners.forEach((listener) => listener(state))
}

export function subscribeAuth(listener: (state: AuthState) => void) {
  authListeners.add(listener)
  listener(authState)
  return () => { authListeners.delete(listener) }
}

onSessionInvalidated(() => {
  authGeneration += 1
  memoryAuthResult = null
  wx.removeStorageSync(AUTH_STORAGE_KEY)
  publishAuth({ phase: 'ready', auth: null, message: '登录已失效，请重新登录' })
})

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
    authGeneration += 1
    publishAuth({ phase: 'ready', auth: result, message: '' })
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

/** Validate cached presentation against the existing server authority, never bootstrap twice. */
export function refreshAuthResult(): Promise<BootstrapResult | null> {
  const current = getSavedAuthResult()
  if (!current) {
    publishAuth({ phase: 'ready', auth: null, message: authState.message })
    return Promise.resolve(null)
  }
  if (Date.parse(current.session.expiresAt) <= Date.now()) {
    clearSavedAuthResult()
    return Promise.resolve(null)
  }
  if (authRefresh?.token === current.session.token) return authRefresh.promise
  const generation = authGeneration
  publishAuth({ phase: 'loading', auth: null, message: '' })
  const promise = request<{ ok: true; user: BootstrapUser; businessIdentity: BusinessIdentity | null }>('/auth/me')
    .then((result) => {
      if (generation !== authGeneration) return getSavedAuthResult()
      if (!result.ok || result.user.id !== current.user.id || !USER_ROLES.has(result.user.role)) {
        throw new Error('backend_version_mismatch')
      }
      const updated: BootstrapResult = { ...current, user: result.user, businessIdentity: result.businessIdentity }
      wx.setStorageSync(AUTH_STORAGE_KEY, updated)
      memoryAuthResult = updated
      publishAuth({ phase: 'ready', auth: updated, message: '' })
      return updated
    })
    .catch((error: unknown) => {
      if (generation !== authGeneration) return getSavedAuthResult()
      publishAuth({ phase: 'error', auth: null, message: friendlyRequestError(error, '身份暂时无法确认，请重试') })
      return null
    })
    .finally(() => { if (authRefresh?.promise === promise) authRefresh = null })
  authRefresh = { token: current.session.token, promise }
  return promise
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
  authGeneration += 1
  authRefresh = null
  publishAuth({ phase: 'ready', auth: updated, message: '' })
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
