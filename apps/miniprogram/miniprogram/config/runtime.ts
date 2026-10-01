export type ApiTransport = 'ecs' | 'cloudrun' | 'local'

export const LOCAL_API_DEBUG_STORAGE_KEY = 'jiuchen-use-local-api'
export const CLOUDRUN_API_DEBUG_STORAGE_KEY = 'jiuchen-use-cloudrun-api'

const DEFAULT_REMOTE_API_TRANSPORT: Exclude<ApiTransport, 'local'> = 'ecs'
const ECS_API_BASE_URL = 'https://api.jiuchenedu.com'
const LOCAL_API_BASE_URL = 'http://127.0.0.1:3000'

type MiniProgramEnvVersion = 'develop' | 'trial' | 'release'

function getMiniProgramEnvVersion(): MiniProgramEnvVersion {
  try {
    const envVersion = wx.getAccountInfoSync().miniProgram.envVersion
    if (envVersion === 'develop' || envVersion === 'trial') {
      return envVersion
    }
  } catch {
    // Fall through to the safest production-like behavior.
  }

  return 'release'
}

function readBooleanFlag(key: string): boolean {
  try {
    return wx.getStorageSync(key) === true
  } catch {
    return false
  }
}

function resolveApiTransport(): ApiTransport {
  const envVersion = getMiniProgramEnvVersion()

  if (
    envVersion === 'develop' &&
    readBooleanFlag(LOCAL_API_DEBUG_STORAGE_KEY)
  ) {
    return 'local'
  }

  if (
    envVersion !== 'release' &&
    readBooleanFlag(CLOUDRUN_API_DEBUG_STORAGE_KEY)
  ) {
    return 'cloudrun'
  }

  return DEFAULT_REMOTE_API_TRANSPORT
}

const apiTransport = resolveApiTransport()

export const runtimeConfig = {
  apiTransport,
  apiBaseUrl:
    apiTransport === 'local' ? LOCAL_API_BASE_URL : ECS_API_BASE_URL,
  cloudEnvId: 'cloud1-d3geim00r03edb212',
  cloudServiceName: 'jiuchen-api',
} as const
