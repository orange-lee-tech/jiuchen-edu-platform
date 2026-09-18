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
