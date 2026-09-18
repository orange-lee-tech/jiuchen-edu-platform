const API_SESSION_TOKEN_KEY = 'jiuchen-api-session-token'

export function saveApiSessionToken(token: string) {
  wx.setStorageSync(API_SESSION_TOKEN_KEY, token)
}

export function getApiSessionToken(): string | null {
  const token = wx.getStorageSync(API_SESSION_TOKEN_KEY)
  return typeof token === 'string' && token.length > 0 ? token : null
}

export function clearApiSessionToken() {
  wx.removeStorageSync(API_SESSION_TOKEN_KEY)
}
