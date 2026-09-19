export type HealthResponse = {
  ok: boolean
  service: string
  environment: string
  dependencies: {
    database: 'not_configured' | 'schema_missing' | 'ok' | 'error'
  }
}

export type UserRole = 'user' | 'student' | 'teacher' | 'staff' | 'admin'

export type IdentitySummary = {
  id: string
  role: UserRole
  displayName: string | null
  createdAt: string
  student: { id: string; name: string } | null
  teacher: { id: string; name: string } | null
}

export type InternalIdSummary = {
  id: string
  businessId: string
  type: 'student' | 'teacher' | 'admin'
  claimMode: 'self' | 'admin'
  status: 'available' | 'claimed' | 'disabled'
  userId: string | null
  entityId: string | null
  batch: string | null
}

export type TeacherSummary = {
  id: string
  userId: string | null
  name: string
  title: string | null
  bio: string | null
  status: 'active' | 'inactive'
}

export type TeacherAssignment = {
  id: string
  studentId: string
  studentName: string
  teacherId: string
  teacherName: string
  stageCode: string | null
  relationship: 'primary' | 'support'
}

export type StudentSummary = {
  id: string
  name: string
  university: string | null
  major: string | null
  currentStage: string | null
}

export type PlanType = 'gpa' | 'english' | 'competition' | 'research' | 'internship'
export type PlanStatus = 'pending' | 'in_progress' | 'done'

export type ClassroomStage = {
  code: string
  label: string
  mode: 'term' | 'holiday' | 'internship'
  description: string
  planTypes: PlanType[]
}

export type ClassroomPlanItem = {
  id: string
  sortOrder: number
  name: string
  target: string | null
  status: PlanStatus
}

export type ClassroomPlan = {
  id: string | null
  type: PlanType
  title: string
  items: ClassroomPlanItem[]
}

export type ClassroomView = {
  ok: true
  student: StudentSummary
  stage: ClassroomStage
  showGuidance: boolean
  plans: ClassroomPlan[]
}

const DEMO_STUDENT_ID = '00000000-0000-4000-8000-000000000001'

async function requestJson<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...options.headers,
    },
  })

  const result = (await response.json()) as T

  if (!response.ok) {
    const error =
      result && typeof result === 'object' && 'error' in result
        ? String((result as { error: unknown }).error)
        : `Request failed with HTTP ${response.status}`
    throw new Error(error)
  }

  return result
}

export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/api/health')
}

export async function fetchDemoStudent(): Promise<StudentSummary> {
  const result = await requestJson<{ ok: true; student: StudentSummary }>(
    `/api/students/${DEMO_STUDENT_ID}`,
  )

  return result.student
}

export async function fetchClassroomStages(): Promise<ClassroomStage[]> {
  const result = await requestJson<{ ok: true; stages: ClassroomStage[] }>(
    '/api/classroom/stages',
  )
  return result.stages
}

export async function fetchStudents(): Promise<StudentSummary[]> {
  const result = await requestJson<{ ok: true; students: StudentSummary[] }>(
    '/api/admin/students',
  )
  return result.students
}

export async function fetchStudentClassroom(
  studentId: string,
  stageCode: string,
): Promise<ClassroomView> {
  return requestJson<ClassroomView>(
    `/api/students/${studentId}/classroom?stage=${encodeURIComponent(stageCode)}`,
  )
}

export async function updateStudent(
  studentId: string,
  patch: Partial<Pick<StudentSummary, 'name' | 'university' | 'major' | 'currentStage'>>,
): Promise<StudentSummary> {
  const result = await requestJson<{ ok: true; student: StudentSummary }>(
    `/api/admin/students/${studentId}`,
    {
      method: 'PUT',
      body: JSON.stringify(patch),
    },
  )
  return result.student
}

export async function saveClassroomPlan(
  studentId: string,
  stageCode: string,
  plan: {
    type: PlanType
    title: string
    items: Array<{
      name: string
      target: string | null
      status: PlanStatus
    }>
  },
): Promise<void> {
  await requestJson(
    `/api/admin/students/${studentId}/classroom/${stageCode}/${plan.type}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        title: plan.title,
        items: plan.items,
      }),
    },
  )
}


export async function createStudent(payload: {
  name: string
  university: string | null
  major: string | null
  currentStage: string | null
}): Promise<StudentSummary> {
  const result = await requestJson<{ ok: true; student: StudentSummary }>(
    '/api/admin/students',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
  return result.student
}

export async function fetchIdentities(): Promise<IdentitySummary[]> {
  const result = await requestJson<{ ok: true; identities: IdentitySummary[] }>(
    '/api/admin/identities',
  )
  return result.identities
}

export async function fetchTeachers(): Promise<TeacherSummary[]> {
  const result = await requestJson<{ ok: true; teachers: TeacherSummary[] }>(
    '/api/admin/teachers',
  )
  return result.teachers
}

export async function createTeacher(payload: {
  userId: string
  name: string
  title: string | null
  bio: string | null
}): Promise<TeacherSummary> {
  const result = await requestJson<{ ok: true; teacher: TeacherSummary }>(
    '/api/admin/teachers',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
  return result.teacher
}

export async function bindStudentIdentity(
  studentId: string,
  userId: string,
): Promise<void> {
  await requestJson(
    `/api/admin/students/${studentId}/identity`,
    {
      method: 'PUT',
      body: JSON.stringify({ userId }),
    },
  )
}

export async function fetchTeacherAssignments(): Promise<TeacherAssignment[]> {
  const result = await requestJson<{ ok: true; assignments: TeacherAssignment[] }>(
    '/api/admin/student-teacher-assignments',
  )
  return result.assignments
}

export async function createTeacherAssignment(payload: {
  studentId: string
  teacherId: string
  stageCode: string | null
  relationship: 'primary' | 'support'
}): Promise<void> {
  await requestJson(
    '/api/admin/student-teacher-assignments',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}


export async function fetchInternalIds(): Promise<InternalIdSummary[]> {
  const result = await requestJson<{ ok: true; internalIds: InternalIdSummary[] }>(
    '/api/admin/internal-ids',
  )
  return result.internalIds
}

export async function bindInternalId(
  internalId: string,
  userId: string,
): Promise<void> {
  await requestJson(
    `/api/admin/internal-ids/${internalId}/bind`,
    {
      method: 'POST',
      body: JSON.stringify({ userId }),
    },
  )
}
