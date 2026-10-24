import { clearApiSessionToken, getApiSessionToken } from './session'
import { runtimeConfig } from '../config/runtime'
import {getReadOnlyContext,readOnlyVersion,clearReadOnlyContext} from './read-only-context'

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
  createdAt?: string
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
  guidanceRecordsReady: boolean
  mentors: ClassroomMentor[]
  records: ClassroomCoachingRecord[]
  plans: ClassroomPlan[]
}

export type AcademicProfile = {
  university: string | null
  major: string | null
  currentGrade: string | null
  enrollmentYear: number | null
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

  const applicationError =
    /^[a-z][a-z0-9_]+$/.test(apiError) ? apiError : ''

  const code =
    applicationError
      ? applicationError
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
    session_changed: '登录账号已变化，请从“我的”重新打开页面',
    wechat_login_failed: '微信登录服务暂不可用，请稍后重试',
    phone_login_failed: '手机号登录暂不可用，请稍后重试',
    database_not_configured: '测试数据库尚未配置完成',
    schema_missing: '测试数据库正在升级，请稍后重试',
    assessment_schema_not_ready: 'AI评估服务正在准备中，请稍后重试',
    assessment_academic_profile_outdated: '评估学业资料已变化，请前往“我的→编辑个人资料”核对，再重新打开草稿',
    assessment_credit_insufficient: '本次评估额度已用尽，请先充值评估次数',
    credit_payment_schema_not_ready: '充值系统正在准备中，请稍后再试',
    wechat_pay_not_configured: '微信支付尚未开通，请联系九辰客服',
    commercial_checkout_not_enabled: '充值尚未开放，请稍后再试',
    wechat_virtual_payment_not_ready: '虚拟支付尚未开通，请联系九辰客服',
    wechat_virtual_code_expired: '微信登录凭据已失效，请重新发起支付',
    wechat_identity_mismatch: '当前微信与登录账号不一致',
    virtual_payment_query_unavailable: '支付结果尚未核实，请稍后重试',
    growth_profile_schema_not_ready: '成长履历服务正在准备中，请稍后重试',
    assessment_or_growth_schema_not_ready: '成长履历与评估数据正在准备中，请稍后重试',
    assessment_provider_not_configured: 'AI模型尚未接入，暂时不能运行评估',
    assessment_import_provider_not_configured: '材料结构化模型尚未配置',
    assessment_import_parser_not_configured: '材料解析服务尚未配置',
    assessment_import_parser_not_enabled: '腾讯云文档解析服务尚未开通，请联系管理员开通后重试',
    assessment_import_parser_billing_unavailable: '材料解析服务当前无可用额度，请联系管理员',
    assessment_import_parser_permission_denied: '腾讯云账号尚未授予文档解析权限，请联系管理员配置 OCR 权限',
    assessment_import_parser_timeout: '材料解析超时，请稍后重试或换一份更精简的文件',
    assessment_import_parser_internal_error: '腾讯云文档解析返回内部错误，本次未完成；请重试一次，持续失败请换一份文件',
    assessment_import_parser_failed: '腾讯云材料解析暂时失败，请稍后重试',
    assessment_import_parser_result_too_large: '解析结果过大，请使用更精简的材料',
    assessment_import_source_download_failed: '上传文件暂时无法读取，请重新选择文件',
    assessment_import_document_text_empty: '没有识别到可用文字，请换清晰文件或图片重试',
    assessment_import_file_too_large: '材料文件过大，请压缩后重试',
    assessment_import_file_type_not_allowed: '暂不支持该材料格式，请使用 Word、PDF 或常见图片',
    assessment_import_ai_failed: '材料已读取，但结构化失败，请稍后重试',

    schedule_ai_provider_not_configured: '图片课表识别服务尚未接入，当前请先使用表格导入',
    schedule_spreadsheet_invalid: '未识别出有效课表结构，请检查星期表头与课程单元格布局',
    schedule_weekday_header_not_found: '未找到周一至周日表头，请检查课表格式',
    schedule_spreadsheet_empty: '课表文件为空或没有可读取内容',
    schedule_file_type_not_allowed: '暂不支持该文件类型，请使用 xlsx、xls 或 csv',
    schedule_first_monday_required: '请选择教务日历上本学期第一周的周一（不能选周日或其他日期）',
    invalid_schedule_edit_payload: '课表数据未通过服务器校验，请不要重新上传；请记录错误码并联系管理员核对数据格式',
    schedule_stage_selection_required: '请先确认课表的归属学期再保存',
    schedule_import_not_found: '当前课表记录已不存在或账号已变更，请重新进入课表页核对',
    schedule_not_parsed: '课表尚未完成解析，请重新进入课表页核对',
    service_unavailable: '服务暂不可用，请稍后重试',
    invalid_internal_id: '内部ID不正确，请核对后重试',
    internal_id_locked: '内部ID已绑定，如需变更请联系管理员',
    internal_id_not_ready: '内部ID尚未准备完成，请联系九辰工作人员',
    internal_id_not_available: '该编号已被认领、暂停或撤销，无法重复绑定',
    internal_id_restricted: '该编号需要由管理员进行绑定',
    internal_id_suspended: '内部ID已暂停，暂时无法访问',
    internal_id_not_disabled: '编号并非暂停或撤销状态',
    internal_id_not_active: '编号并非可用状态',
    internal_id_state_changed: '编号状态已变化，请刷新后重试',
    cannot_modify_own_admin_id: '不能暂停或撤销自己的管理员ID',
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
  const view=getReadOnlyContext()
  if(view&&method!=='GET')return Promise.reject(new ApiRequestError(403,'read_only_write_forbidden'))
  const scoped=view&&!path.startsWith('/auth/')&&!path.startsWith('/me/read-only/')
  const version=readOnlyVersion()
  const bearer=scoped?view.readToken:sessionToken
  const viewHeader=scoped?{'X-Jiuchen-Read-Only-Target':`${view.kind}:${view.id}`}:{ }

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
          ...viewHeader,
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
        data,
        success(response) {
          if(scoped&&version!==readOnlyVersion()){reject(new ApiRequestError(409,'session_changed'));return}
          if (sessionToken && sessionToken !== getApiSessionToken()) {
            reject(new ApiRequestError(409, 'session_changed'))
            return
          }
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(response.data as T)
            return
          }

          if(response.statusCode===401&&scoped)clearReadOnlyContext()
          else if (response.statusCode === 401 && sessionToken) clearApiSessionToken(sessionToken)
          if(scoped&&response.statusCode===403&&/^read_only_(target|invalid)/.test(String(asErrorRecord(response.data).code||asErrorRecord(response.data).error||'')))clearReadOnlyContext()
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
      header: {...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),...viewHeader},
      success(response) {
        if(scoped&&version!==readOnlyVersion()){reject(new ApiRequestError(409,'session_changed'));return}
        if (sessionToken && sessionToken !== getApiSessionToken()) {
          reject(new ApiRequestError(409, 'session_changed'))
          return
        }
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data as T)
          return
        }

        if(response.statusCode===401&&scoped)clearReadOnlyContext()
        else if (response.statusCode === 401 && sessionToken) clearApiSessionToken(sessionToken)
        if(scoped&&response.statusCode===403&&/^read_only_(target|invalid)/.test(String(asErrorRecord(response.data).code||asErrorRecord(response.data).error||'')))clearReadOnlyContext()
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
  termStartDate?: string | null
  stageCode?: string | null
  editedAt?: string | null
}

export type ScheduleImportView = {
  id: string
  sourceType: 'spreadsheet' | 'image'
  fileName: string
  status: 'parsed'
  errorCode: string | null
  updatedAt: string
  schedule: ParsedSchedule | null
}

export async function createScheduleImport(payload: {
  fileID: string
  fileName: string
  sourceType: 'spreadsheet' | 'image'
  stageCode: string
}): Promise<{ importId: string; schedule: ParsedSchedule; fallbackReason?: string }> {
  const result = await request<{
    ok: true
    importId: string
    schedule: ParsedSchedule
    fallbackReason?: string
  }>(
    '/me/classroom/schedule-imports',
    'POST',
    payload as unknown as WechatMiniprogram.IAnyObject,
  )
  return {
    importId: result.importId,
    schedule: result.schedule,
    fallbackReason: result.fallbackReason,
  }
}

export async function getLatestScheduleImport(stageCode?: string): Promise<ScheduleImportView | null> {
  const result = await request<{ ok: true; import: ScheduleImportView | null }>(
    '/me/classroom/schedule-imports/latest' + (stageCode ? '?stageCode=' + encodeURIComponent(stageCode) : ''),
  )
  return result.import
}

export async function updateScheduleImport(
  id: string,
  schedule: ParsedSchedule,
): Promise<ParsedSchedule> {
  const result = await request<{
    ok: true
    importId: string
    schedule: ParsedSchedule
  }>(
    `/me/classroom/schedule-imports/${encodeURIComponent(id)}/schedule`,
    'PUT',
    {
      courses: schedule.courses,
      warnings: schedule.warnings,
      termStartDate: schedule.termStartDate ?? null,
      stageCode: schedule.stageCode ?? null,
    } as unknown as WechatMiniprogram.IAnyObject,
  )
  return result.schedule
}


/** Change one schedule date without roundtripping an entire AI-extracted timetable. */
export async function updateScheduleFirstMonday(id: string, termStartDate: string): Promise<string> {
  const result = await request<{ok:true;termStartDate:string}>(
    `/me/classroom/schedule-imports/${encodeURIComponent(id)}/term-start-date`,
    'PUT', {termStartDate},
  )
  return result.termStartDate
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

export async function updateMyDisplayName(displayName:string):Promise<string>{
  const result=await request<{ok:true;displayName:string}>('/me/display-name','PUT',{displayName})
  return result.displayName
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
  role: 'student' | 'teacher' | 'admin'
  locked: true
}> {
  const result = await request<{
    ok: true
    identity: InternalIdentity
    role: 'student' | 'teacher' | 'admin'
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
  name?:string|null;university?:string|null;major?:string|null;currentStage?:string|null;nameLabel?:string;schoolLabel?:string|null
  displayName?:string|null;userStatus?:string|null;accountRole?:string|null;teacherStatus?:string|null
  assignmentCount?:number|null;assignmentState?:'unclaimed'|'assigned'|'unassigned'|'not_recorded'
  assignmentLabel?:string;profileState?:'unclaimed'|'incomplete'|'recorded'
  auditCategory?:'test_named_bound'|'test_named_unclaimed'|'no_test_name';nameVerification?:'not_recorded'

}

export type AdminTeacher = {
  id: string
  name: string
  title: string | null
  status: 'active' | 'inactive'
  createdAt?: string
  stateLabel?:string;canView?:boolean;businessId?:string|null
}

export async function getAdminReadOnlyRoster():Promise<{students:Array<StudentSummary&{stateLabel?:string;canView?:boolean;businessId?:string|null}>;teachers:AdminTeacher[];isolatedUnclaimedSeedCount:number}>{
 return request('/me/admin/read-only-directory')
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
  lifecycle?:{phase:string;phaseChangedAt:string|null;bufferedAt:string|null;retireAt:string|null}|null
  id: string
  title: string
  summary: string | null
  coverUrl: string | null
  articleUrl: string | null
  tags: string[]
  publishedAt: string | null
  sourceUpdatedAt?: string | null
  publicationTimeSource?: 'manual' | 'explicit_publish_time' | 'admin_verified_publish_record' | 'unverified'
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

export async function pauseAdminInternalId(id: string): Promise<void> {
  await request<{ ok: true }>(`/me/admin/internal-ids/${id}/pause`, 'POST', {})
}

export async function restoreAdminInternalId(id: string): Promise<void> {
  await request<{ ok: true }>(`/me/admin/internal-ids/${id}/restore`, 'POST', {})
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
  return (await getAdminNewsData()).posts
}
export type NewsSyncHistory={lastCheckedAt:string|null;lastFailedAt:string|null;latestSourceUpdatedAt:string|null;fetched:number;created:number;updated:number;failed:number;lastError:string|null}
export async function getAdminNewsData():Promise<{posts:AdminNewsPost[];newsV2Enabled:boolean;syncHistory:NewsSyncHistory|null}>{
  const result = await request<{ ok: true; posts: AdminNewsPost[];newsV2Enabled?:boolean;syncHistory?:NewsSyncHistory|null }>(
    '/me/admin/news',
  )
  return {posts:result.posts,newsV2Enabled:Boolean(result.newsV2Enabled),syncHistory:result.syncHistory??null}
}
export type NewsRetirementTask={taskId:string;batchId:string;state:'todo'|'acknowledged'|'doing'|'feedback';note:string|null;updatedAt:string;title:string;sourceTime:string|null;retireAt:string|null;phase:string;operatorSuffix:string|null}
export type NewsRetirementBatch={id:string;createdAt:string;entered:string[];affected:Array<{postId:string;retireAt:string}>}
export async function getNewsRetirements():Promise<{tasks:NewsRetirementTask[];unreadBatches:NewsRetirementBatch[]}>{
  return request<{ok:true;tasks:NewsRetirementTask[];unreadBatches:NewsRetirementBatch[]}>('/me/news-retirements')
}
export async function readNewsRetirement(id:string):Promise<void>{await request('/me/news-retirements/'+encodeURIComponent(id)+'/read','POST',{})}
export async function updateNewsRetirementTask(id:string,state:NewsRetirementTask['state'],note:string):Promise<void>{
  await request('/me/news-retirement-tasks/'+encodeURIComponent(id),'PUT',{state,note})
}

export type NewsSyncResult={synced:number;created:number;updated:number;unchanged:number;failed:number;
  errors:Array<{sourceKey:string;reason:string}>;checkedAt:string;latestSourcePublishedAt:string|null;
  latestSourceUpdatedAt:string|null;groupsFetched:number;totalGroups:number|null;maxGroups:number;truncated:boolean;message:string;
  pagesFetched?:number;uniqueGroups?:number;latestArticles?:Array<{title:string;articleUrl:string|null;sourceUpdatedAt:string|null;publishedAt:string|null}>}
export type VerifiedOfficialPost = { title:string;articleUrl:string;summary:string|null;coverUrl:string|null;publishedAt:string|null;tags:string[];mediaType:'article'|'image'|'video';body:string }
export async function addVerifiedOfficialPost(post:VerifiedOfficialPost):Promise<{id:string;created:boolean}>{
  return request('/me/admin/news/verified-official','POST',post as unknown as WechatMiniprogram.IAnyObject)
}
export async function syncOfficialAccountNews():Promise<NewsSyncResult>{
  return request<{ok:true}&NewsSyncResult>('/me/admin/news/sync','POST',{})
}

export async function updateAdminNewsTags(
  id: string,
  tags: string[],
): Promise<string[]> {
  const result = await request<{ ok: true; tags: string[] }>(
    `/me/admin/news/${encodeURIComponent(id)}/tags`,
    'PUT',
    { tags } as unknown as WechatMiniprogram.IAnyObject,
  )
  return result.tags
}


export type AdminUser = {
  id: string
  role: 'user' | 'student' | 'teacher' | 'staff' | 'admin'
  status: 'active' | 'deleted'
  displayName: string | null
  createdAt: string
}

export type CreditSkuInfo = { key: string; description: string; amountFen: number; creditAmount: number }
export type CommercialMeta = {
  policy: { assessmentCreditCost: number; enforcementEnabled: boolean }
  freeGrant: { configured: boolean; version?: string; amount?: number }
  rolePolicy: { guestFree: number; studentTotalFree: number }
  payment: { providerConfigured: boolean; checkoutEnabled: boolean; catalog: CreditSkuInfo[]; skus: CreditSkuInfo[] }
}
export type CreditAccount = { settledBalance: number; heldBalance: number; availableBalance: number }
export type PaymentOrderStatus = 'pending' | 'paid' | 'closed' | 'refunded'
export type AssessmentPaymentOrder = { id: string; status: PaymentOrderStatus; amountFen: number; creditAmount: number }
export type AssessmentPaymentParams = { timeStamp: string; nonceStr: string; package: string; signType: 'RSA'; paySign: string }
export async function getCommercialMeta(): Promise<CommercialMeta> {
  const result = await request<{ ok: true } & CommercialMeta>('/commercial/meta')
  return result
}
export async function grantMyFreeCredits(): Promise<CreditAccount> {
  const result = await request<{ ok: true; account: CreditAccount }>('/me/credits/free-grant', 'POST', {})
  return result.account
}
export async function getMyCreditAccount(): Promise<CreditAccount> {
  const result = await request<{ ok: true; account: CreditAccount }>('/me/credits')
  return result.account
}
export type VirtualPaymentArgs = {mode:'goods';signData:string;paySig:string;signature:string}
export async function createVirtualAssessmentOrder(skuKey:string,wechatCode:string):Promise<{order:{id:string;status:'pending';amountFen:number;creditAmount:number};payment:VirtualPaymentArgs}> {
  return request('/me/virtual-payment-orders','POST',{skuKey,wechatCode})
}
export async function reconcileVirtualAssessmentOrder(id:string):Promise<{ok:boolean;state:'paid'|'pending'|'refunded'|'closed';credited:boolean;deliveryPending?:boolean}> {
  return request('/me/virtual-payment-orders/'+encodeURIComponent(id)+'/reconcile','POST',{})
}
export async function createAssessmentPaymentOrder(skuKey: string): Promise<{ order: AssessmentPaymentOrder; payment: AssessmentPaymentParams }> {
  const result = await request<{ ok: true; order: AssessmentPaymentOrder; payment: AssessmentPaymentParams }>(
    '/me/payment-orders', 'POST', { skuKey },
  )
  return { order: result.order, payment: result.payment }
}
export async function getAssessmentPaymentOrder(id: string): Promise<AssessmentPaymentOrder> {
  const result = await request<{ ok: true; order: AssessmentPaymentOrder }>(
    '/me/payment-orders/' + encodeURIComponent(id),
  )
  return result.order
}

export type AdminAnalyticsPeriod = 'week' | 'month' | 'year'
export type AdminAnalytics = {
  period: AdminAnalyticsPeriod
  buckets:Array<{key:string;label:string;assessmentCount:number;createdCount:number;startedTaskCount:number;failedCount:number;runningCount:number;rechargeCount:number|null;rechargeCreditCount:number|null;rechargeAmountFen:number|null;consumptionCount:number|null;releasedCount:number|null}>
  summary:{assessmentCount:number;createdCount:number;startedTaskCount:number;failedCount:number;runningCount:number;assessmentUserCount?:number;rechargeCount:number|null;rechargeCreditCount:number|null;rechargeAmountFen:number|null;consumptionCount:number|null;releasedCount:number|null}
  range:{from:string;before:string;timezone:string;basis:string}
  sources:Record<'assessments'|'payments'|'ledger'|'reservations',{status:'ok'|'error';error:string|null}>
  ledger:{freeGranted:number|null;paidGranted:number|null;debitedCredits:number|null;balance:number|null;unallocatedConsumption:number|null;freeUsed:null;paidUsed:null;sourceAllocationStatus:'not_recorded';correctionCredits:number|null}
  reservations:{held:number|null;released:number|null}
  gaps:{successWithoutCompletedAt:number;successWithoutDebit:number|null;suspectEightHourCompletionCount:number;runRequestHistory:'not_recorded';actualApiCost:'not_recorded'}
  supplier: {
    status: 'missing' | 'stale' | 'critical' | 'warning' | 'normal' | 'early_stage'
    message: string
    availableFen: number | null
    observedAt: string | null
    estimatedDailyFen: number | null
    estimatedRunwayDays: number | null
    sampleRuns7Days: number
    forecastBasedOn: 'manual_estimate' | 'unavailable'
  }
  payers: Array<{ userIdSuffix: string; displayName: string; rechargeCount: number; amountFen: number }>
}
export async function getAdminAnalytics(period: AdminAnalyticsPeriod): Promise<AdminAnalytics> {
  const result = await request<{ ok: true; analytics: AdminAnalytics }>('/me/admin/assessment-analytics?period=' + period)
  return result.analytics
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const result = await request<{ ok: true; users: AdminUser[] }>(
    '/me/admin/users',
  )
  return result.users
}

export type AdminControlBox = {
  configured: boolean; version: number; ownerUserId: string | null
  settings: { singleFen: number; tenFen: number; guestFree: number;
    studentTotalFree: number; platformPriceConfirmed: boolean;
    estimatedCostFen: number | null } | null
}
export type AdminControlDraft = { saved: boolean; basedOnVersion: number | null; settings: AdminControlBox['settings'] }
export async function getAdminControls(): Promise<{ settings: AdminControlBox; assessmentKey: AdminControlBox;
  drafts: { settings: AdminControlDraft; assessmentKey: AdminControlDraft } }> {
  return request('/me/admin/controls')
}
export async function saveAdminControl(box: 'settings' | 'assessment_key', payload: {
  expectedVersion: number; currentPin?: string; newPin: string;
  settings?: AdminControlBox['settings']; apiKey?: string
}): Promise<void> {
  await request('/me/admin/controls/' + box, 'POST', payload)
}
export async function saveAdminControlDraft(box: 'settings' | 'assessment_key', payload: {
  expectedVersion: number; settings?: AdminControlBox['settings']; apiKey?: string
}): Promise<void> {
  await request('/me/admin/controls/' + box + '/draft', 'POST', payload)
}
export async function activateAdminControlDraft(box: 'settings' | 'assessment_key', payload: {
  expectedVersion: number; currentPin?: string; newPin: string
}): Promise<void> {
  await request('/me/admin/controls/' + box + '/activate-draft', 'POST', payload)
}
export async function testAdminAssessmentKey(pin: string): Promise<void> {
  await request('/me/admin/controls/assessment-key/test', 'POST', { pin })
}

export type AssessmentKeyObject = {
  id: string; label: string; provider: string | null; apiBaseUrl: string | null
  model: string | null; temperature: number | null; creatorUserId: string
  note: string | null; status: 'candidate' | 'active' | 'disabled' | 'archived'
  version: number; hasObjectPin: boolean; lastTestResult: string | null
  lastTestAt: string | null; createdAt: string
}
export type AssessmentKeyHead = { initialized: boolean; version: number; activeObjectId: string | null }
export async function getAssessmentKeyObjects(): Promise<{
  head: AssessmentKeyHead; objects: AssessmentKeyObject[]
}> {
  return request('/me/admin/assessment-keys')
}
export async function createAssessmentKeyObject(payload: {
  label: string; provider: string; apiBaseUrl: string; model: string
  temperature: number; apiKey: string; note: string; pin: string
}) {
  return request<{ ok: true; id: string; active: boolean; version: number }>(
    '/me/admin/assessment-keys', 'POST', payload)
}
export async function activateAssessmentKeyObject(id: string, payload: {
  expectedVersion: number; currentPin: string; targetPin: string
}) {
  return request('/me/admin/assessment-keys/' + encodeURIComponent(id) + '/activate', 'POST', payload)
}
export async function disableActiveAssessmentKey(payload: { expectedVersion: number; currentPin: string }) {
  return request('/me/admin/assessment-keys/disable', 'POST', payload)
}
export async function archiveAssessmentKeyObject(id: string, payload: {
  expectedVersion: number; currentPin: string
}) {
  return request('/me/admin/assessment-keys/' + encodeURIComponent(id) + '/archive', 'POST', payload)
}
export async function testAssessmentKeyObject(id: string): Promise<{ ok: true; reachable: boolean; mayIncurCost: true }> {
  return request('/me/admin/assessment-keys/' + encodeURIComponent(id) + '/test', 'POST', {})
}
export async function revealAssessmentKeyObject(id: string, pin: string): Promise<{ ok: true; apiKey: string }> {
  return request('/me/admin/assessment-keys/' + encodeURIComponent(id) + '/reveal', 'POST', { pin })
}
export async function setupLegacyAssessmentKeyPin(id: string, currentPin: string, newPin: string) {
  return request('/me/admin/assessment-keys/' + encodeURIComponent(id) + '/setup-pin', 'POST', { currentPin, newPin })
}

export type MyIdentity = { id: string; businessId: string; type: 'admin' | 'teacher' | 'student'; status: 'claimed' }
export async function getMyIdentities(): Promise<{ activeRole: string; identities: MyIdentity[] }> {
  return request('/me/identities')
}
export async function bindMyAdditionalIdentity(businessId: string) {
  return request('/me/identities/bind', 'POST', { businessId })
}
export async function switchMyIdentityRole(role: MyIdentity['type']) {
  return request('/me/identities/switch', 'POST', { role })
}
export async function unbindMyIdentityId(id: string) {
  return request('/me/identities/' + encodeURIComponent(id) + '/unbind', 'POST', {})
}

export type CreditPlan = { id: string; name: string; version: number; note: string | null;
  creatorUserId: string; hasObjectPin: boolean; status: string; createdAt: string;
  counts: { JC000: number; JC001: number; JC002: number; JC003: number };
  estimatedCostFen: number | null; costVerifiedAt: string | null }
export type CreditPlanHead = { initialized: boolean; version: number; activePlanId: string | null }
export async function getCreditPlans(): Promise<{ head: CreditPlanHead; plans: CreditPlan[];
  prices: Array<{ key: string; amountFen: number; creditAmount: number }> }> {
  return request('/me/admin/credit-plans')
}
export async function createCreditPlanObject(payload: { name: string; note: string;
  counts: CreditPlan['counts']; estimatedCostFen: number | null; costConfirmed: boolean; pin: string }) {
  return request<{ ok: true; id: string; active: boolean; version: number }>('/me/admin/credit-plans', 'POST', payload)
}
export async function activateCreditPlanObject(id: string, payload: {
  expectedVersion: number; currentPin: string; targetPin: string }) {
  return request('/me/admin/credit-plans/' + encodeURIComponent(id) + '/activate', 'POST', payload)
}
export async function disableCurrentCreditPlan(payload: { expectedVersion: number; currentPin: string }) {
  return request('/me/admin/credit-plans/disable', 'POST', payload)
}
export async function archiveCreditPlanObject(id: string, payload: { expectedVersion: number; currentPin: string }) {
  return request('/me/admin/credit-plans/' + encodeURIComponent(id) + '/archive', 'POST', payload)
}
export async function setupLegacyCreditPlanPin(id: string, currentPin: string, newPin: string) {
  return request('/me/admin/credit-plans/' + encodeURIComponent(id) + '/setup-pin', 'POST', { currentPin, newPin })
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
  mediaType?: 'article' | 'image' | 'video'
  id: string
  title: string
  summary: string | null
  coverUrl: string | null
  articleUrl: string | null
  tags: string[]
  publishedAt: string | null
  sourceUpdatedAt?: string | null
  publicationTimeSource?: 'manual' | 'explicit_publish_time' | 'admin_verified_publish_record' | 'unverified'
  source: 'manual' | 'wechat_official'
  retireAt?:string|null
}

export type NewsPostDetail = NewsPost & {
  favoritesEnabled?:boolean
  content: {
    mediaType?: 'article' | 'image' | 'video'
    html: string | null
    blocks?: Array<{type:'text';text:string}|{type:'image';url:string}>
    author: string | null
    contentSourceUrl: string | null
  }
}

export async function getNewsPosts(): Promise<NewsPost[]> {
  return (await getNewsListing()).posts
}
export async function getNewsListing():Promise<{v2:boolean;posts:NewsPost[];retiring:NewsPost[]}>{
  const result=await request<{ok:true;v2?:boolean;posts:NewsPost[];retiring?:NewsPost[]}>('/news')
  return {v2:Boolean(result.v2),posts:result.posts,retiring:result.retiring||[]}
}
export type NewsFavorite={postId:string;title:string;articleUrl:string;favoritedAt:string;phase:string|null}
export async function getMyNewsFavorites():Promise<NewsFavorite[]>{
  const result=await request<{ok:true;favorites:NewsFavorite[]}>('/me/news-favorites')
  return result.favorites
}
export async function saveNewsFavorite(id:string):Promise<void>{await request('/me/news-favorites/'+encodeURIComponent(id),'PUT',{})}
export async function removeNewsFavorite(id:string):Promise<void>{await request('/me/news-favorites/'+encodeURIComponent(id)+'/remove','POST',{})}

export async function getNewsPost(id: string): Promise<NewsPostDetail> {
  const result = await request<{ ok: true; post: NewsPostDetail }>(
    `/news/${encodeURIComponent(id)}`,
  )
  return result.post
}


export type AssessmentEnglishRecord = {
  type: 'cet4' | 'cet6' | 'ielts' | 'toefl' | 'gre' | 'other'
  score: string
  note?: string | null
}

export type AssessmentResearchExperience = {
  title: string
  type?: 'project' | 'paper' | 'patent' | 'lab' | 'other' | null
  achievementTier?: 'Nature' | 'Science' | 'SCI/SSCI' | 'EI' | '普通期刊' | '科研项目' | '专利/软著' | '其他' | null
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
  contextOptions?: {
    includePlanning?: boolean
    includeRecentAssessments?: boolean
  }
  preferences?: {
    preferredRegions?: string[]
    researchDirection?: string | null
    note?: string | null
  }
}

export type AssessmentEvidence = {
  ref: string
  kind: 'school' | 'program' | 'case' | 'policy' | 'other'
  sourceType: 'jiuchen' | 'external' | 'official' | 'internal'
  sourceId?: string | null
  title: string
  sourceLabel: string
  sourceUrl?: string | null
  year?: number | null
  excerpt?: string | null
}

export type AssessmentFinding = {
  title: string
  detail: string
  evidenceRefs: string[]
}

export type AssessmentOutput = {
  profileSummary: string
  strengths: AssessmentFinding[]
  risks: AssessmentFinding[]
  targetAssessments: Array<{
    schoolName: string
    programName?: string | null
    tier: 'reach' | 'match' | 'conservative' | 'insufficient_data'
    rationale: string
    gapItems: string[]
    actions: string[]
    evidenceRefs: string[]
  }>
  recommendedActions: Array<{
    priority: 'high' | 'medium' | 'low'
    title: string
    rationale: string
    timeframe?: string | null
  }>
  similarCases: Array<{
    caseId: string
    sourceType: 'jiuchen' | 'external'
    similarityReason: string
    resultSummary: string
    evidenceRef: string
  }>
  uncertainties: string[]
  disclaimer: string
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
  evidence: AssessmentEvidence[] | null
  output: AssessmentOutput | null
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
  backgroundExecution: {
    enabled: boolean
    stateStore: 'assessments'
    terminalStates: Array<'succeeded' | 'failed'>
  }
  completionNotification: {
    channel: 'none' | 'wechat_subscribe'
    configured: boolean
  }
  outputPolicy: {
    preciseAdmissionProbability: false
    evidenceRequiredForClaims: true
  }
  materialImport: {
    enabled: boolean
    documentFormats: string[]
    imageFormats: string[]
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
    backgroundExecution: {
      enabled: boolean
      stateStore: 'assessments'
      terminalStates: Array<'succeeded' | 'failed'>
    }
    completionNotification: {
      channel: 'none' | 'wechat_subscribe'
      configured: boolean
    }
    outputPolicy: {
      preciseAdmissionProbability: false
      evidenceRequiredForClaims: true
    }
    materialImport: {
      enabled: boolean
      documentFormats: string[]
      imageFormats: string[]
    }
  }>('/assessments/meta')
  return result
}

export type AssessmentImportCandidate = {
  profile: {
    university: string | null
    major: string | null
    currentGrade: string | null
    gpaText: string | null
    rankText: string | null
    backgroundNote: string | null
  }
  english: AssessmentEnglishRecord[]
  research: AssessmentResearchExperience[]
  competitions: AssessmentCompetitionExperience[]
  targets: AssessmentTarget[]
  warnings: string[]
}

export async function importAssessmentProfileMaterial(payload: {
  fileID: string
  fileName: string
  sourceType: 'document' | 'image'
}): Promise<{
  candidate: AssessmentImportCandidate
  summary: string
}> {
  const result = await request<{
    ok: true
    candidate: AssessmentImportCandidate
    summary: string
  }>(
    '/me/assessments/import-profile',
    'POST',
    payload as unknown as WechatMiniprogram.IAnyObject,
  )
  return {
    candidate: result.candidate,
    summary: result.summary,
  }
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


export type GrowthRecordType =
  | 'course'
  | 'language'
  | 'research'
  | 'publication'
  | 'competition'
  | 'project'
  | 'internship'
  | 'campus'
  | 'award'
  | 'skill'
  | 'other'

export type CanonicalGrowthRecord = {
  id: string
  type: GrowthRecordType
  title: string
  organization?: string | null
  role?: string | null
  startDate?: string | null
  endDate?: string | null
  description?: string | null
  result?: string | null
  standardExpression: string
  source: {
    type: 'manual' | 'assessment' | 'classroom' | 'admin'
    recordId: string | null
    key: string
  }
  confirmations: {
    user: boolean
    teacher: boolean
    admin: boolean
  }
  updatedAt: string
}

export type CanonicalGrowthProfile = {
  schemaVersion: 'growth-profile-v1'
  identity: {
    displayName: string | null
    university: string | null
    major: string | null
    currentGrade: string | null
    gpaText: string | null
    rankText: string | null
  }
  records: CanonicalGrowthRecord[]
}

export type ResumeProjection = {
  version: 'resume-projection-v1'
  options: {
    target: 'general' | 'technical' | 'academic'
    language: 'zh-CN'
    length: 'one-page' | 'detailed'
  }
  identity: CanonicalGrowthProfile['identity']
  education: {
    school: string
    major: string | null
    grade: string | null
    gpa: string | null
    rank: string | null
    sourceRefs: string[]
  } | null
  entries: Array<{
    id: string
    type: GrowthRecordType
    title: string
    organization: string | null
    role: string | null
    startDate: string | null
    endDate: string | null
    text: string
    sourceRefs: string[]
  }>
}

export type ApplicationProjection = {
  version: 'application-projection-v1'
  schemaKey: 'generic-recruitment-v1'
  fields: Array<{
    key: string
    label: string
    status: 'matched' | 'needs_confirmation' | 'missing'
    value: string | string[] | null
    sourceRefs: string[]
  }>
}

export async function getMyGrowthProfile(): Promise<{
  profile: CanonicalGrowthProfile
  growthSchemaReady: boolean
}> {
  const result = await request<{
    ok: true
    profile: CanonicalGrowthProfile
    growthSchemaReady: boolean
  }>('/me/growth-profile')
  return {
    profile: result.profile,
    growthSchemaReady: result.growthSchemaReady,
  }
}

export async function getMyResumeProjection(
  target: 'general' | 'technical' | 'academic' = 'general',
): Promise<{
  projection: ResumeProjection
  growthSchemaReady: boolean
}> {
  const result = await request<{
    ok: true
    projection: ResumeProjection
    growthSchemaReady: boolean
  }>(
    '/me/resume-projection',
    'POST',
    {
      target,
      language: 'zh-CN',
      length: 'one-page',
    },
  )
  return {
    projection: result.projection,
    growthSchemaReady: result.growthSchemaReady,
  }
}

export async function getMyApplicationProjection(): Promise<{
  projection: ApplicationProjection
  growthSchemaReady: boolean
}> {
  const result = await request<{
    ok: true
    projection: ApplicationProjection
    growthSchemaReady: boolean
  }>(
    '/me/application-projection',
    'POST',
    { schemaKey: 'generic-recruitment-v1' },
  )
  return {
    projection: result.projection,
    growthSchemaReady: result.growthSchemaReady,
  }
}


export type GrowthImportCandidate = {
  candidateKey: string
  record: {
    type: GrowthRecordType
    title: string
    organization?: string | null
    role?: string | null
    startDate?: string | null
    endDate?: string | null
    description?: string | null
    result?: string | null
  }
  standardExpression: string
}

export async function previewAssessmentGrowthRecords(
  assessmentId: string,
): Promise<GrowthImportCandidate[]> {
  const result = await request<{
    ok: true
    candidates: GrowthImportCandidate[]
  }>(
    '/me/growth-records/assessment-preview',
    'POST',
    { assessmentId },
  )
  return result.candidates
}

export async function confirmAssessmentGrowthImport(
  assessmentId: string,
  candidateKeys: string[],
): Promise<{ imported: number; recordIds: string[] }> {
  const result = await request<{
    ok: true
    imported: number
    recordIds: string[]
  }>(
    '/me/growth-records/import-assessment',
    'POST',
    { assessmentId, candidateKeys },
  )
  return {
    imported: result.imported,
    recordIds: result.recordIds,
  }
}


export type GrowthProfileBootstrap = {
  generatedAt: string
  revision: string
  growthSchemaReady: boolean
  assessmentSchemaReady: boolean
  profile: CanonicalGrowthProfile
  resumeProjections: {
    general: ResumeProjection
    technical: ResumeProjection
    academic: ResumeProjection
  }
  applicationProjection: ApplicationProjection
  pendingAssessmentImport: {
    assessmentId: string
    candidates: GrowthImportCandidate[]
  } | null
}

export async function getMyGrowthProfileBootstrap(): Promise<GrowthProfileBootstrap> {
  const result = await request<
    { ok: true } & GrowthProfileBootstrap
  >(
    '/me/growth-profile/bootstrap',
    'POST',
    {
      language: 'zh-CN',
      length: 'one-page',
    },
  )
  return result
}

/** These are read projections; they never change the operator's auth/session. */
export type ReadOnlyStudentResponse = {
  ok:true;readOnly:true;targetType:'student'
  student:StudentSummary
  profile:AcademicProfile | null
  stages:ClassroomStage[]
  classroom:ClassroomView
  latestSchedule:{id:string;fileName:string;status:string;parsedJson:unknown} | null
  schedules:Array<{id:string;fileName:string;status:string;parsedJson:unknown}>
  revisions:Array<{id:string;title:string;stageCode:string;type:string;status:string;itemsJson:unknown}>
  growth:Array<{id:string;type:string;title:string;organization:string|null;role:string|null;
    startDate:string|null;endDate:string|null;description:string|null;result:string|null;
    standardExpression:string|null}>
  assessments:Array<{id:string;status:string;createdAt:string;completedAt:string|null;outputJson:unknown}>
}
export type ReadOnlyTeacherResponse = {
  ok:true;readOnly:true;targetType:'teacher'
  teacher:{id:string;name:string;title:string|null;bio:string|null;status:string}
  assigned:Array<{studentId:string;studentName:string;university:string|null;major:string|null;
    relationship:string;stageCode:string|null}>
  pending:Array<{id:string;studentId:string;stageCode:string;type:string;
    title:string;itemsJson:unknown;createdAt:string}>
}
export function getReadOnlyStudent(id:string,stage?:string):Promise<ReadOnlyStudentResponse>{
  return request<ReadOnlyStudentResponse>(
    '/me/read-only/students/'+encodeURIComponent(id)+(stage?'?stage='+encodeURIComponent(stage):''),
  )
}
export function getReadOnlyStudentStage(id:string,stage:string):Promise<{
  ok:true;readOnly:true;classroom:ClassroomView
}>{
  return request('/me/read-only/students/'+encodeURIComponent(id)+'?stage='+
    encodeURIComponent(stage)+'&only=classroom')
}
export function getReadOnlyTeacher(id:string):Promise<ReadOnlyTeacherResponse>{
  return request<ReadOnlyTeacherResponse>('/me/read-only/teachers/'+encodeURIComponent(id))
}
