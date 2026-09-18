import { runtimeConfig } from '../config/runtime'

export type LivenessResponse = {
  ok: boolean
  service: string
  environment: string
}

export type HealthResponse = {
  ok: boolean
  service: string
  environment: string
  dependencies: {
    database: 'not_configured' | 'schema_missing' | 'ok' | 'error'
  }
}

export type StudentSummary = {
  id: string
  name: string
  university: string | null
  major: string | null
  currentStage: string | null
}

export type ClassroomPlanType =
  | 'gpa'
  | 'english'
  | 'competition'
  | 'research'
  | 'internship'

export type ClassroomStage = {
  code: string
  label: string
  mode: 'term' | 'holiday' | 'internship'
  description: string
  planTypes: ClassroomPlanType[]
}

export type ClassroomPlan = {
  id: string | null
  type: ClassroomPlanType
  title: string
  items: Array<{
    id: string
    sortOrder: number
    name: string
    target: string | null
    status: 'pending' | 'in_progress' | 'done'
  }>
}

export type ClassroomView = {
  ok: true
  student: StudentSummary
  stage: ClassroomStage
  showGuidance: boolean
  plans: ClassroomPlan[]
}

const DEMO_STUDENT_ID = '00000000-0000-4000-8000-000000000001'

type RequestMethod = 'GET' | 'POST'

export function request<T>(
  path: string,
  method: RequestMethod = 'GET',
  data?: WechatMiniprogram.IAnyObject,
): Promise<T> {
  if (runtimeConfig.apiTransport === 'cloud') {
    return new Promise((resolve, reject) => {
      wx.cloud.callContainer({
        config: {
          env: runtimeConfig.cloudEnvId,
        },
        path,
        method,
        header: {
          'X-WX-SERVICE': runtimeConfig.cloudServiceName,
        },
        data,
        success(response) {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(response.data as T)
            return
          }
          const detail =
            typeof response.data === 'string'
              ? response.data
              : JSON.stringify(response.data)
          reject(
            new Error(
              `Request failed with HTTP ${response.statusCode}${detail ? `: ${detail}` : ''}`,
            ),
          )
        },
        fail(error) {
          reject(new Error(error.errMsg || '无法连接云托管 API'))
        },
      })
    })
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${runtimeConfig.apiBaseUrl}${path}`,
      method,
      data,
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data as T)
          return
        }

        const detail =
          typeof response.data === 'string'
            ? response.data
            : JSON.stringify(response.data)
        reject(
          new Error(
            `Request failed with HTTP ${response.statusCode}${detail ? `: ${detail}` : ''}`,
          ),
        )
      },
      fail(error) {
        reject(new Error(error.errMsg || '无法连接 API'))
      },
    })
  })
}

export function getLiveness(): Promise<LivenessResponse> {
  return request<LivenessResponse>('/health/live')
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health')
}

export async function getDemoStudent(): Promise<StudentSummary> {
  const result = await request<{ ok: true; student: StudentSummary }>(
    `/students/${DEMO_STUDENT_ID}`,
  )
  return result.student
}


export async function getClassroomStages(): Promise<ClassroomStage[]> {
  const result = await request<{ ok: true; stages: ClassroomStage[] }>('/classroom/stages')
  return result.stages
}

export function getDemoStudentClassroom(stageCode: string): Promise<ClassroomView> {
  return request<ClassroomView>(
    `/students/${DEMO_STUDENT_ID}/classroom?stage=${encodeURIComponent(stageCode)}`,
  )
}
