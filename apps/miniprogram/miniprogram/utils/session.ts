const API_SESSION_TOKEN_KEY = 'jiuchen-api-session-token'

let memoryToken: string | null | undefined
const invalidationListeners = new Set<() => void>()

export function onSessionInvalidated(listener: () => void) {
  invalidationListeners.add(listener)
  return () => invalidationListeners.delete(listener)
}

export function saveApiSessionToken(token: string) {
  memoryToken = token
  wx.setStorageSync(API_SESSION_TOKEN_KEY, token)
}

export function getApiSessionToken(): string | null {
  if (memoryToken !== undefined) return memoryToken

  const token = wx.getStorageSync(API_SESSION_TOKEN_KEY)
  memoryToken =
    typeof token === 'string' && token.length > 0
      ? token
      : null
  return memoryToken
}

export function clearApiSessionToken(expectedToken?: string | null) {
  // A late response from the previous account must not revoke a new session.
  if (expectedToken !== undefined && getApiSessionToken() !== expectedToken) return
  memoryToken = null
  wx.removeStorageSync(API_SESSION_TOKEN_KEY)
  invalidationListeners.forEach((listener) => listener())
}
