import { runtimeConfig } from '../config/runtime'

export type HealthResponse = {
  ok: boolean
  service: string
  environment: string
  dependencies: {
    database: 'not_configured' | 'ok' | 'error'
  }
}

export type StudentSummary = {
  id: string
  name: string
  university: string | null
  major: string | null
  currentStage: string | null
}

const DEMO_STUDENT_ID = '00000000-0000-4000-8000-000000000001'

function get<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.request<T>({
      url: `${runtimeConfig.apiBaseUrl}${path}`,
      method: 'GET',
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data)
          return
        }

        reject(new Error(`Request failed with HTTP ${response.statusCode}`))
      },
      fail(error) {
        reject(new Error(error.errMsg || '无法连接 API'))
      },
    })
  })
}

export function getHealth(): Promise<HealthResponse> {
  return get<HealthResponse>('/health')
}

export async function getDemoStudent(): Promise<StudentSummary> {
  const result = await get<{ ok: true; student: StudentSummary }>(
    `/students/${DEMO_STUDENT_ID}`,
  )
  return result.student
}
