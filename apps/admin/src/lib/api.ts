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

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Request failed with HTTP ${response.status}`)
  }

  return response.json() as Promise<T>
}

export function fetchHealth(): Promise<HealthResponse> {
  return getJson<HealthResponse>('/api/health')
}

export async function fetchDemoStudent(): Promise<StudentSummary> {
  const result = await getJson<{ ok: true; student: StudentSummary }>(
    `/api/students/${DEMO_STUDENT_ID}`,
  )

  return result.student
}
