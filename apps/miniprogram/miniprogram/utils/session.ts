const API_SESSION_TOKEN_KEY = 'jiuchen-api-session-token'

let memoryToken: string | null | undefined

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

export function clearApiSessionToken() {
  memoryToken = null
  wx.removeStorageSync(API_SESSION_TOKEN_KEY)
}
