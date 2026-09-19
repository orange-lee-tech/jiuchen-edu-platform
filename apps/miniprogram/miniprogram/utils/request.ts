import { getApiSessionToken } from './session'
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

export type AcademicProfile = {
  university: string | null
  major: string | null
  currentGrade: string | null
  gpaText: string | null
  rankText: string | null
}

export type InternalIdentity = {
  businessId: string
  type: 'student' | 'teacher' | 'admin'
  status: 'available' | 'claimed' | 'disabled'
}

const DEMO_STUDENT_ID = '00000000-0000-4000-8000-000000000001'

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export function request<T>(
  path: string,
  method: RequestMethod = 'GET',
  data?: WechatMiniprogram.IAnyObject,
): Promise<T> {
  const sessionToken = getApiSessionToken()

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
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
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
      header: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
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


export async function getMyAcademicProfile(): Promise<AcademicProfile> {
  const result = await request<{ ok: true; profile: AcademicProfile }>('/me/profile')
  return result.profile
}

export async function updateMyAcademicProfile(
  profile: AcademicProfile,
): Promise<AcademicProfile> {
  const result = await request<{ ok: true; profile: AcademicProfile }>(
    '/me/profile',
    'PUT',
    profile as unknown as WechatMiniprogram.IAnyObject,
  )
  return result.profile
}


export async function getMyInternalIdentity(): Promise<{
  identity: InternalIdentity | null
  locked: boolean
}> {
  return request<{ ok: true; identity: InternalIdentity | null; locked: boolean }>(
    '/me/internal-id',
  )
}

export async function claimMyInternalIdentity(
  businessId: string,
): Promise<{
  identity: InternalIdentity
  role: 'student' | 'teacher'
  locked: true
}> {
  const result = await request<{
    ok: true
    identity: InternalIdentity
    role: 'student' | 'teacher'
    locked: true
  }>(
    '/me/internal-id/claim',
    'POST',
    { businessId },
  )
  return result
}


export type AdminInternalId = {
  id: string
  businessId: string
  type: 'student' | 'teacher' | 'admin'
  claimMode: 'self' | 'admin'
  status: 'available' | 'claimed' | 'disabled'
  userId: string | null
  entityId: string | null
  batch: string | null
  claimedAt: string | null
}

export type AdminTeacher = {
  id: string
  name: string
  title: string | null
  status: 'active' | 'inactive'
}

export type AdminAssignment = {
  id: string
  studentId: string
  studentName: string
  teacherId: string
  teacherName: string
  stageCode: string | null
  relationship: 'primary' | 'support'
}

export type AdminNewsPost = {
  id: string
  title: string
  summary: string | null
  coverUrl: string | null
  articleUrl: string | null
  publishedAt: string | null
  source: 'manual' | 'wechat_official'
  status: 'active' | 'hidden'
}

export async function getAdminInternalIds(): Promise<AdminInternalId[]> {
  const result = await request<{ ok: true; internalIds: AdminInternalId[] }>(
    '/me/admin/internal-ids',
  )
  return result.internalIds
}

export async function createAdminInternalId(
  type: 'student' | 'teacher' | 'admin',
  name: string | null,
): Promise<AdminInternalId> {
  const result = await request<{ ok: true; identity: AdminInternalId }>(
    '/me/admin/internal-ids',
    'POST',
    { type, name },
  )
  return result.identity
}

export async function unbindAdminInternalId(id: string): Promise<void> {
  await request<{ ok: true }>(
    `/me/admin/internal-ids/${id}/unbind`,
    'POST',
    {},
  )
}

export async function deleteAdminInternalId(id: string): Promise<void> {
  await request<{ ok: true }>(
    `/me/admin/internal-ids/${id}`,
    'DELETE',
    {},
  )
}

export async function getAdminStudents(): Promise<StudentSummary[]> {
  const result = await request<{ ok: true; students: StudentSummary[] }>(
    '/me/admin/students',
  )
  return result.students
}

export async function getAdminTeachers(): Promise<AdminTeacher[]> {
  const result = await request<{ ok: true; teachers: AdminTeacher[] }>(
    '/me/admin/teachers',
  )
  return result.teachers
}

export async function getAdminAssignments(): Promise<AdminAssignment[]> {
  const result = await request<{ ok: true; assignments: AdminAssignment[] }>(
    '/me/admin/assignments',
  )
  return result.assignments
}

export async function createAdminAssignment(payload: {
  studentId: string
  teacherId: string
  stageCode: string | null
  relationship: 'primary' | 'support'
}): Promise<void> {
  await request<{ ok: true }>(
    '/me/admin/assignments',
    'POST',
    payload as unknown as WechatMiniprogram.IAnyObject,
  )
}

export async function deleteAdminAssignment(id: string): Promise<void> {
  await request<{ ok: true }>(
    `/me/admin/assignments/${id}`,
    'DELETE',
    {},
  )
}

export async function getAdminNews(): Promise<AdminNewsPost[]> {
  const result = await request<{ ok: true; posts: AdminNewsPost[] }>(
    '/me/admin/news',
  )
  return result.posts
}

export async function syncOfficialAccountNews(): Promise<number> {
  const result = await request<{ ok: true; synced: number }>(
    '/me/admin/news/sync',
    'POST',
    {},
  )
  return result.synced
}


export type AdminUser = {
  id: string
  role: 'user' | 'student' | 'teacher' | 'staff' | 'admin'
  status: 'active' | 'deleted'
  displayName: string | null
  createdAt: string
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const result = await request<{ ok: true; users: AdminUser[] }>(
    '/me/admin/users',
  )
  return result.users
}

export async function bindAdminInternalId(
  id: string,
  userId: string,
): Promise<void> {
  await request<{ ok: true }>(
    `/me/admin/internal-ids/${id}/bind`,
    'POST',
    { userId },
  )
}
