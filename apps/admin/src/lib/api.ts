export type HealthResponse = {
  ok: boolean
  service: string
  environment: string
  dependencies: {
    database: 'not_configured' | 'ok' | 'error'
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health')

  if (!response.ok) {
    throw new Error(`API health check failed with HTTP ${response.status}`)
  }

  return response.json() as Promise<HealthResponse>
}
