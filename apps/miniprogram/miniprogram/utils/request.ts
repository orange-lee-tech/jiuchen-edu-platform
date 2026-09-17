import { runtimeConfig } from '../config/runtime'

export type HealthResponse = {
  ok: boolean
  service: string
  environment: string
  dependencies: {
    database: 'not_configured' | 'ok' | 'error'
  }
}

export function getHealth(): Promise<HealthResponse> {
  return new Promise((resolve, reject) => {
    wx.request<HealthResponse>({
      url: `${runtimeConfig.apiBaseUrl}/health`,
      method: 'GET',
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data)
          return
        }

        reject(new Error(`API health check failed with HTTP ${response.statusCode}`))
      },
      fail(error) {
        reject(new Error(error.errMsg || '无法连接 API'))
      },
    })
  })
}
