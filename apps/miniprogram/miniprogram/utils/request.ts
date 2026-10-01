import { getApiSessionToken } from './session'
import { runtimeConfig } from '../config/runtime'

export type LivenessResponse = {
  ok: boolean
  service: string
  environment: string
  release?: string
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
  revisionStatus?: 'none' | 'pending' | 'approved'
  revisionId?: string | null
  items: Array<{
    id: string
    sortOrder: number
    name: string
    target: string | null
    status: 'pending' | 'in_progress' | 'done'
  }>
}

export type ClassroomMentor = {
  id: string
  name: string
  title: string | null
  bio: string | null
  relationship: 'primary' | 'support'
  stageCode: string | null
}

export type ClassroomCoachingRecord = {
  id: string
  teacherId: string | null
  teacherName: string | null
  stageCode: string
  title: string
  content: string
  occurredAt: string
}

export type ClassroomView = {
  ok: true
  student: StudentSummary
  stage: ClassroomStage
  showGuidance: boolean
  mentors: ClassroomMentor[]
  records: ClassroomCoachingRecord[]
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

export class ApiRequestError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly detail: string

  constructor(statusCode: number, code: string, detail = '') {
    super(code)
    this.name = 'ApiRequestError'
    this.statusCode = statusCode
    this.code = code
    this.detail = detail
  }
}

function asErrorRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function responseError(statusCode: number, payload: unknown) {
  const record = asErrorRecord(payload)
  const message = typeof record.message === 'string' ? record.message : ''
  const apiError = typeof record.error === 'string' ? record.error : ''

  if (
    statusCode === 404 &&
    (message.includes('Route ') || message.includes('not found'))
  ) {
    return new ApiRequestError(statusCode, 'backend_version_mismatch', message)
  }

  const code =
    apiError && apiError !== 'Not Found'
      ? apiError
      : statusCode === 401
        ? 'unauthorized'
        : statusCode >= 500
          ? 'service_unavailable'
          : `http_${statusCode}`

  return new ApiRequestError(
    statusCode,
    code,
    message || (typeof payload === 'string' ? payload : JSON.stringify(payload)),
  )
}

export function friendlyRequestError(
  error: unknown,
  fallback = '操作失败，请稍后重试',
) {
  const code =
    error instanceof ApiRequestError
      ? error.code
      : error instanceof Error
        ? error.message
        : ''

  const messages: Record<string, string> = {
    backend_version_mismatch: '测试服务尚未更新到当前版本，请稍后重试',
    network_unavailable: '暂时无法连接服务，请检查网络后重试',
    unauthorized: '登录已失效，请重新登录',
    wechat_login_failed: '微信登录服务暂不可用，请稍后重试',
    phone_login_failed: '手机号登录暂不可用，请稍后重试',
    database_not_configured: '测试数据库尚未配置完成',
    schema_missing: '测试数据库正在升级，请稍后重试',
    service_unavailable: '服务暂不可用，请稍后重试',
    invalid_internal_id: '内部ID不正确，请核对后重试',
    internal_id_locked: '内部ID已绑定，如需变更请联系管理员',
    internal_id_not_ready: '内部ID尚未准备完成，请联系九辰工作人员',
    role_already_assigned: '当前账号已有内部身份',
  }

  if (messages[code]) return messages[code]
  if (code && /[\u4e00-\u9fff]/.test(code)) return code
  return fallback
}

export function request<T>(
  path: string,
  method: RequestMethod = 'GET',
  data?: WechatMiniprogram.IAnyObject,
): Promise<T> {
  const sessionToken = getApiSessionToken()

  if (runtimeConfig.apiTransport === 'cloudrun') {
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

          reject(responseError(response.statusCode, response.data))
        },
        fail(error) {
          reject(new ApiRequestError(0, 'network_unavailable', error.errMsg || ''))
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

        reject(responseError(response.statusCode, response.data))
      },
      fail(error) {
        reject(new ApiRequestError(0, 'network_unavailable', error.errMsg || ''))
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

export function getMyClassroom(stageCode?: string): Promise<ClassroomView> {
  const query = stageCode ? `?stage=${encodeURIComponent(stageCode)}` : ''
  return request<ClassroomView>(`/me/classroom${query}`)
}

export type PlanEditorItem = {
  name: string
  target?: string | null
  status: 'pending' | 'in_progress' | 'done'
}

export async function saveMyClassroomPlan(
  stageCode: string,
  type: ClassroomPlanType,
  payload: { title: string; items: PlanEditorItem[] },
): Promise<{ id: string; status: 'pending' }> {
  const result = await request<{
    ok: true
    revision: { id: string; status: 'pending' }
  }>(
    `/me/classroom/plans/${encodeURIComponent(stageCode)}/${encodeURIComponent(type)}`,
    'PUT',
    payload as unknown as WechatMiniprogram.IAnyObject,
  )
  return result.revision
}

export type PlanRevision = {
  id: string
  studentId: string
  stageCode: string
  type: ClassroomPlanType
  title: string
  itemsJson: PlanEditorItem[]
  editorRole: 'student' | 'teacher' | 'staff' | 'admin'
  status: 'pending' | 'approved' | 'rejected'
  reviewNote: string | null
  createdAt: string
  reviewedAt: string | null
}

export async function getMyPlanVersions(
  stageCode: string,
  type: ClassroomPlanType,
): Promise<PlanRevision[]> {
  const result = await request<{ ok: true; revisions: PlanRevision[] }>(
    `/me/classroom/plans/${encodeURIComponent(stageCode)}/${encodeURIComponent(type)}/versions`,
  )
  return result.revisions
}

export type TeacherStudent = {
  assignmentId: string
  relationship: 'primary' | 'support'
  assignedStageCode: string | null
  studentId: string
  name: string
  university: string | null
  major: string | null
  currentStage: string | null
}

export async function getTeacherStudents(): Promise<TeacherStudent[]> {
  const result = await request<{ ok: true; students: TeacherStudent[] }>(
    '/me/teacher/students',
  )
  return result.students
}

export function getTeacherStudentClassroom(
  studentId: string,
  stageCode: string,
): Promise<ClassroomView> {
  return request<ClassroomView>(
    `/me/teacher/students/${encodeURIComponent(studentId)}/classroom?stage=${encodeURIComponent(stageCode)}`,
  )
}

export async function saveTeacherStudentPlan(
  studentId: string,
  stageCode: string,
  type: ClassroomPlanType,
  payload: { title: string; items: PlanEditorItem[] },
): Promise<{ id: string; status: 'approved' }> {
  const result = await request<{
    ok: true
    revision: { id: string; status: 'approved' }
  }>(
    `/me/teacher/students/${encodeURIComponent(studentId)}/plans/${encodeURIComponent(stageCode)}/${encodeURIComponent(type)}`,
    'PUT',
    payload as unknown as WechatMiniprogram.IAnyObject,
  )
  return result.revision
}

export type PendingPlanRevision = {
  id: string
  studentId: string
  studentName: string
  stageCode: string
  type: ClassroomPlanType
  title: string
  itemsJson: PlanEditorItem[]
  createdAt: string
}

export async function getPendingPlanRevisions(): Promise<PendingPlanRevision[]> {
  const result = await request<{ ok: true; revisions: PendingPlanRevision[] }>(
    '/me/teacher/pending-plan-revisions',
  )
  return result.revisions
}

export async function approvePlanRevision(
  revisionId: string,
  note: string | null = null,
): Promise<void> {
  await request<{ ok: true }>(
    `/me/teacher/plan-revisions/${encodeURIComponent(revisionId)}/approve`,
    'POST',
    { note },
  )
}

export async function rejectPlanRevision(
  revisionId: string,
  note: string | null = null,
): Promise<void> {
  await request<{ ok: true }>(
    `/me/teacher/plan-revisions/${encodeURIComponent(revisionId)}/reject`,
    'POST',
    { note },
  )
}

export type ParsedScheduleCourse = {
  name: string
  day: string
  dayIndex: number
  slot: string
  startSection: number | null
  endSection: number | null
  time: string | null
  location: string | null
  teacher: string | null
  weeks: string | null
  raw: string
}

export type ParsedSchedule = {
  sourceType: 'spreadsheet' | 'image'
  courses: ParsedScheduleCourse[]
  warnings: string[]
}

export async function createScheduleImport(payload: {
  fileID: string
  fileName: string
  sourceType: 'spreadsheet' | 'image'
}): Promise<{ importId: string; schedule: ParsedSchedule }> {
  const result = await request<{
    ok: true
    importId: string
    schedule: ParsedSchedule
  }>(
    '/me/classroom/schedule-imports',
    'POST',
    payload as unknown as WechatMiniprogram.IAnyObject,
  )
  return { importId: result.importId, schedule: result.schedule }
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


export type NewsPost = {
  id: string
  title: string
  summary: string | null
  coverUrl: string | null
  articleUrl: string | null
  publishedAt: string | null
  source: 'manual' | 'wechat_official'
}

export async function getNewsPosts(): Promise<NewsPost[]> {
  const result = await request<{ ok: true; posts: NewsPost[] }>('/news')
  return result.posts
}


export type AssessmentEnglishRecord = {
  type: 'cet4' | 'cet6' | 'ielts' | 'toefl' | 'gre' | 'other'
  score: string
  note?: string | null
}

export type AssessmentResearchExperience = {
  title: string
  type?: 'project' | 'paper' | 'patent' | 'lab' | 'other' | null
  role?: string | null
  organization?: string | null
  level?: 'school' | 'provincial' | 'national' | 'international' | 'other' | null
  description?: string | null
  output?: string | null
}

export type AssessmentCompetitionExperience = {
  name: string
  level?: 'school' | 'provincial' | 'national' | 'international' | 'other' | null
  award?: string | null
  role?: string | null
  description?: string | null
}

export type AssessmentTarget = {
  schoolName: string
  programName?: string | null
  researchDirection?: string | null
  note?: string | null
}

export type AssessmentInput = {
  profile: {
    university: string
    major: string
    currentGrade: string
    gpaText?: string | null
    rankText?: string | null
    backgroundNote?: string | null
  }
  english?: AssessmentEnglishRecord[]
  research?: AssessmentResearchExperience[]
  competitions?: AssessmentCompetitionExperience[]
  targets: AssessmentTarget[]
  preferences?: {
    preferredRegions?: string[]
    researchDirection?: string | null
    note?: string | null
  }
}

export type AssessmentRecord = {
  id: string
  status: 'draft' | 'running' | 'succeeded' | 'failed'
  versions: {
    inputSchema: string
    outputSchema: string
    agent: string
    knowledge: string | null
  }
  model: {
    provider: string | null
    name: string | null
  }
  input: AssessmentInput
  evidence: unknown
  output: unknown
  failureCode: string | null
  creditConsumed: boolean
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export async function getAssessmentMeta(): Promise<{
  versions: {
    inputSchema: string
    outputSchema: string
    agent: string
  }
  limits: {
    targets: number
    englishRecords: number
    researchExperiences: number
    competitionExperiences: number
  }
  providerConfigured: boolean
  outputPolicy: {
    preciseAdmissionProbability: false
    evidenceRequiredForClaims: true
  }
}> {
  const result = await request<{
    ok: true
    versions: {
      inputSchema: string
      outputSchema: string
      agent: string
    }
    limits: {
      targets: number
      englishRecords: number
      researchExperiences: number
      competitionExperiences: number
    }
    providerConfigured: boolean
    outputPolicy: {
      preciseAdmissionProbability: false
      evidenceRequiredForClaims: true
    }
  }>('/assessments/meta')
  return result
}

export async function createAssessmentDraft(
  input: AssessmentInput,
): Promise<AssessmentRecord> {
  const result = await request<{ ok: true; assessment: AssessmentRecord }>(
    '/me/assessments',
    'POST',
    { input } as unknown as WechatMiniprogram.IAnyObject,
  )
  return result.assessment
}

export async function updateAssessmentDraft(
  id: string,
  input: AssessmentInput,
): Promise<AssessmentRecord> {
  const result = await request<{ ok: true; assessment: AssessmentRecord }>(
    `/me/assessments/${id}`,
    'PUT',
    { input } as unknown as WechatMiniprogram.IAnyObject,
  )
  return result.assessment
}

export async function getMyAssessments(): Promise<AssessmentRecord[]> {
  const result = await request<{ ok: true; assessments: AssessmentRecord[] }>(
    '/me/assessments',
  )
  return result.assessments
}

export async function getMyAssessment(id: string): Promise<AssessmentRecord> {
  const result = await request<{ ok: true; assessment: AssessmentRecord }>(
    `/me/assessments/${id}`,
  )
  return result.assessment
}

export async function runMyAssessment(id: string): Promise<AssessmentRecord> {
  const result = await request<{ ok: true; assessment: AssessmentRecord }>(
    `/me/assessments/${id}/run`,
    'POST',
    {},
  )
  return result.assessment
}


export type ProductSummary = {
  documentKey: string
  title: string
  productName: string
  sourceDate: string | null
  conversionVersion: string
  source: 'bundled' | 'database'
  product: Record<string, unknown>
  highlights: Array<Record<string, unknown>>
}

export type ProductDetail = {
  documentKey: string
  title: string
  sourceDate: string | null
  conversionVersion: string
  source: 'bundled' | 'database'
  content: {
    document: Record<string, unknown>
    brand: Record<string, unknown>
    product: Record<string, unknown>
    audience: Array<Record<string, unknown>>
    highlights: Array<Record<string, unknown>>
    timeline: Array<Record<string, unknown>>
    modules: Array<Record<string, unknown>>
    core_services: Array<Record<string, unknown>>
    teachers: Array<Record<string, unknown>>
    marketing_claims: Array<Record<string, unknown>>
    contact: Record<string, unknown> | null
    visual_blocks: Array<Record<string, unknown>>
    extensions: Record<string, unknown>
  }
}

export async function getProducts(): Promise<ProductSummary[]> {
  const result = await request<{ ok: true; products: ProductSummary[] }>(
    '/products',
  )
  return result.products
}

export async function getProduct(documentKey: string): Promise<ProductDetail> {
  return request<ProductDetail & { ok: true }>(
    `/products/${encodeURIComponent(documentKey)}`,
  )
}


export type BrandContent = {
  document: Record<string, unknown>
  brand: Record<string, unknown>
  product: Record<string, unknown>
  audience: Array<Record<string, unknown>>
  highlights: Array<Record<string, unknown>>
  timeline: Array<Record<string, unknown>>
  core_services: Array<Record<string, unknown>>
  teacher_summary: {
    source_record_count: number
    verification_status: string
    source_pages: number[]
  }
  office_achievements: Array<Record<string, unknown>>
  marketing_claims: Array<Record<string, unknown>>
}

export async function getBrandContent(): Promise<BrandContent> {
  const result = await request<{ ok: true; content: BrandContent }>('/brand')
  return result.content
}
