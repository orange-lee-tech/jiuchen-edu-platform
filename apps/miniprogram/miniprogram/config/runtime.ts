export type ApiTransport = 'http' | 'cloud'

export const runtimeConfig = {
  apiTransport: 'http' as ApiTransport,
  apiBaseUrl: 'http://127.0.0.1:3000',
  cloudEnvId: '',
  cloudServiceName: 'jiuchen-api',
} as const
