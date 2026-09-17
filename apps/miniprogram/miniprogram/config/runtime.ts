export type ApiTransport = 'http' | 'cloud'

export const runtimeConfig = {
  apiTransport: 'cloud' as ApiTransport,
  apiBaseUrl: 'http://127.0.0.1:3000',
  cloudEnvId: 'cloud1-d3geim00r03edb212',
  cloudServiceName: 'jiuchen-api',
} as const
