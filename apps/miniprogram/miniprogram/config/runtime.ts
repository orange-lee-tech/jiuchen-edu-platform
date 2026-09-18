export type ApiTransport = 'http' | 'cloud'

export const LOCAL_API_DEBUG_STORAGE_KEY = 'jiuchen-use-local-api'

function shouldUseLocalApi(): boolean {
  try {
    return wx.getStorageSync(LOCAL_API_DEBUG_STORAGE_KEY) === true
  } catch {
    return false
  }
}

export const runtimeConfig = {
  apiTransport: (shouldUseLocalApi() ? 'http' : 'cloud') as ApiTransport,
  apiBaseUrl: 'http://127.0.0.1:3000',
  cloudEnvId: 'cloud1-d3geim00r03edb212',
  cloudServiceName: 'jiuchen-api',
} as const
