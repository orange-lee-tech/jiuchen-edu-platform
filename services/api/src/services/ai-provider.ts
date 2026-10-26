import type { AppEnv } from '../config/env.js'

export type JsonModelUserContent =
  | string
  | Array<
      | {
          type: 'text'
          text: string
        }
      | {
          type: 'image_url'
          image_url: {
            url: string
          }
        }
    >

export type JsonModelJsonSchema = {
  name: string
  schema: Record<string, unknown>
}

export type JsonModelRequest = {
  system?: string
  user: JsonModelUserContent
  maxTokens?: number
  jsonSchema?: JsonModelJsonSchema
  onUsage?: (usage: ModelTokenUsage | null) => void
  onPrepared?: (promptChars: number, outputBudget: number) => void
}

export type ModelTokenUsage = {
  promptTokens: number | null; completionTokens: number | null
  cacheHitTokens: number | null; cacheMissTokens: number | null
  reasoningTokens: number | null
}

function tokenCount(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null
}

export function parseModelTokenUsage(value: unknown): ModelTokenUsage | null {
  if (!value || typeof value !== 'object') return null
  const usage = value as Record<string, unknown>
  const details = usage.completion_tokens_details && typeof usage.completion_tokens_details === 'object'
    ? usage.completion_tokens_details as Record<string, unknown> : {}
  const parsed = {
    promptTokens: tokenCount(usage.prompt_tokens),
    completionTokens: tokenCount(usage.completion_tokens),
    cacheHitTokens: tokenCount(usage.prompt_cache_hit_tokens),
    cacheMissTokens: tokenCount(usage.prompt_cache_miss_tokens),
    reasoningTokens: tokenCount(details.reasoning_tokens),
  }
  return Object.values(parsed).some(count => count !== null) ? parsed : null
}

export interface JsonModelProvider {
  readonly provider: string
  readonly model: string
  isConfigured(): boolean
  generateJson(request: JsonModelRequest): Promise<unknown>
}

export type JsonModelProviderConfig = {
  provider?: string
  baseUrl?: string
  apiKey?: string
  model?: string
  timeoutMs?: number
  temperature?: number
  sendTemperature?: boolean
  jsonMode?: boolean
  responseFormat?: 'json_object' | 'json_schema'
  extraBody?: Record<string, unknown>
  transport?: (endpoint: string, options: {
    method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal
  }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
}

export class JsonModelProviderUnavailableError extends Error {
  constructor() {
    super('ai_provider_not_configured')
    this.name = 'JsonModelProviderUnavailableError'
  }
}

export class JsonModelProviderHttpError extends Error {
  readonly status: number
  readonly providerCode: string | null

  constructor(status: number, providerCode: string | null = null) {
    super('ai_provider_http_' + status)
    this.name = 'JsonModelProviderHttpError'
    this.status = status
    this.providerCode = providerCode
  }
}

export class JsonModelProviderTimeoutError extends Error {
  constructor() { super('ai_provider_timeout'); this.name = 'JsonModelProviderTimeoutError' }
}

export class JsonModelProviderTruncatedError extends Error {
  constructor() { super('ai_provider_truncated'); this.name = 'JsonModelProviderTruncatedError' }
}

export class JsonModelProviderInvalidJsonError extends Error {
  readonly rawText: string

  constructor(rawText: string) {
    super('ai_provider_invalid_json')
    this.name = 'JsonModelProviderInvalidJsonError'
    this.rawText = rawText
  }
}

export function extractJsonObject(textValue: string): unknown {
  const trimmed = textValue.trim()

  // JSON Object mode should return JSON, but providers/models may still return a
  // valid JSON scalar/array that is wrong for the downstream business schema.
  // Preserve that distinction: parse valid JSON here and let the caller's
  // schema validation decide whether the top-level type is acceptable.
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    // Keep compatibility with providers that wrap an otherwise valid JSON
    // object in short prose or markdown despite JSON mode.
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error('ai_provider_invalid_json')
  }

  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as unknown
  } catch {
    throw new Error('ai_provider_invalid_json')
  }
}

function responseText(value: unknown) {
  if (typeof value === 'string') return value

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item || typeof item !== 'object' || !('text' in item)) return ''
        const itemText = (item as { text?: unknown }).text
        return typeof itemText === 'string' ? itemText : ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

export class ChatCompletionsJsonModelProvider implements JsonModelProvider {
  readonly provider: string
  readonly model: string

  private readonly baseUrl?: string
  private readonly apiKey?: string
  private readonly timeoutMs: number
  private readonly temperature: number
  private readonly sendTemperature: boolean
  private readonly jsonMode: boolean
  private readonly responseFormat?: 'json_object' | 'json_schema'
  private readonly extraBody: Record<string, unknown>
  private readonly transport: NonNullable<JsonModelProviderConfig['transport']>

  constructor(config: JsonModelProviderConfig) {
    this.provider = config.provider?.trim() || 'openai-compatible'
    this.model = config.model?.trim() || 'unconfigured'
    this.baseUrl = config.baseUrl?.trim()
    this.apiKey = config.apiKey?.trim()
    this.timeoutMs = config.timeoutMs ?? 60_000
    this.temperature = config.temperature ?? 0.1
    this.sendTemperature = config.sendTemperature ?? true
    this.jsonMode = config.jsonMode ?? false
    this.responseFormat =
      config.responseFormat ?? (this.jsonMode ? 'json_object' : undefined)
    this.extraBody = { ...(config.extraBody ?? {}) }
    this.transport = config.transport ?? ((endpoint, options) => fetch(endpoint, { ...options, redirect: 'error' }))
  }

  isConfigured() {
    return Boolean(
      this.baseUrl &&
        this.apiKey &&
        this.model &&
        this.model !== 'unconfigured',
    )
  }

  async generateJson(request: JsonModelRequest): Promise<unknown> {
    if (!this.isConfigured()) {
      throw new JsonModelProviderUnavailableError()
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const endpoint = this.baseUrl!.replace(/\/+$/, '') + '/chat/completions'
      const messages = [
        ...(request.system
          ? [
              {
                role: 'system',
                content: request.system,
              },
            ]
          : []),
        {
          role: 'user',
          content: request.user,
        },
      ]
      request.onPrepared?.(JSON.stringify(messages).length, request.maxTokens ?? 0)

      const responseFormat =
        this.responseFormat === 'json_schema'
          ? (() => {
              if (!request.jsonSchema) {
                throw new Error('ai_provider_json_schema_required')
              }
              return {
                type: 'json_schema',
                json_schema: {
                  name: request.jsonSchema.name,
                  strict: true,
                  schema: request.jsonSchema.schema,
                },
              }
            })()
          : this.responseFormat === 'json_object'
            ? { type: 'json_object' }
            : undefined

      const response = await this.transport(endpoint, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...this.extraBody,
          model: this.model,
          messages,
          ...(this.sendTemperature ? { temperature: this.temperature } : {}),
          ...(responseFormat ? { response_format: responseFormat } : {}),
          ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        let providerCode: string | null = null
        try {
          const body = (await response.json()) as { error?: { code?: unknown; type?: unknown } }
          const candidate = body?.error?.code ?? body?.error?.type
          if (typeof candidate === 'string' && /^[a-z0-9_-]{1,80}$/i.test(candidate)) providerCode = candidate
        } catch { /* Error bodies are optional and never logged. */ }
        throw new JsonModelProviderHttpError(response.status, providerCode)
      }

      let payload: {
        usage?: unknown
        choices?: Array<{
          finish_reason?: string
          message?: {
            content?: unknown
          }
        }>
      }
      try { payload = (await response.json()) as typeof payload }
      catch { throw new JsonModelProviderInvalidJsonError('') }
      request.onUsage?.(parseModelTokenUsage(payload.usage))

      if (payload.choices?.[0]?.finish_reason === 'length') {
        throw new JsonModelProviderTruncatedError()
      }

      const text = responseText(payload.choices?.[0]?.message?.content)
      if (!text) throw new Error('ai_provider_empty_response')

      try {
        return extractJsonObject(text)
      } catch {
        throw new JsonModelProviderInvalidJsonError(text)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new JsonModelProviderTimeoutError()
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}

export function createJsonModelProvider(config: JsonModelProviderConfig) {
  return new ChatCompletionsJsonModelProvider(config)
}

// These documented Chat Completions models accept temperature. Other services
// still receive the rigor instruction in the assessment prompt, without an
// unsupported API parameter.
export function assessmentModelSupportsTemperature(provider: string | undefined) {
  return ['aliyun-bailian', 'baidu-qianfan', 'zhipu', 'xfyun-spark', 'baichuan'].includes(provider ?? '')
}

const PRESET_ASSESSMENT_PROVIDERS = new Set([
  'aliyun-bailian', 'deepseek', 'moonshot', 'volc-ark', 'tencent-hunyuan',
  'baidu-qianfan', 'zhipu', 'minimax', 'xfyun-spark', 'baichuan',
])

function parseExtraBodyJson(value?: string) {
  if (!value) return undefined

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('ai_provider_extra_body_invalid_json')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('ai_provider_extra_body_must_be_object')
  }

  return parsed as Record<string, unknown>
}

export function createAssessmentAIProvider(env: AppEnv, transport?: JsonModelProviderConfig['transport']) {
  return createJsonModelProvider({
    provider: env.ASSESSMENT_AI_PROVIDER ?? 'assessment-openai-compatible',
    baseUrl: env.ASSESSMENT_AI_BASE_URL,
    apiKey: env.ASSESSMENT_AI_API_KEY,
    model: env.ASSESSMENT_AI_MODEL,
    temperature: env.ASSESSMENT_AI_TEMPERATURE ?? 0,
    sendTemperature: assessmentModelSupportsTemperature(env.ASSESSMENT_AI_PROVIDER),
    jsonMode: env.ASSESSMENT_AI_PROVIDER === 'deepseek' ? true :
      PRESET_ASSESSMENT_PROVIDERS.has(env.ASSESSMENT_AI_PROVIDER ?? '')
        ? false : env.ASSESSMENT_AI_JSON_MODE ?? true,
    responseFormat: env.ASSESSMENT_AI_PROVIDER === 'deepseek' ? 'json_object' :
      PRESET_ASSESSMENT_PROVIDERS.has(env.ASSESSMENT_AI_PROVIDER ?? '')
        ? undefined : env.ASSESSMENT_AI_RESPONSE_FORMAT,
    extraBody: parseExtraBodyJson(env.ASSESSMENT_AI_EXTRA_BODY_JSON),
    transport,
  })
}

export function createScheduleAIProvider(env: AppEnv) {
  return createJsonModelProvider({
    provider: env.SCHEDULE_AI_PROVIDER ?? 'schedule-openai-compatible',
    baseUrl: env.SCHEDULE_AI_BASE_URL,
    apiKey: env.SCHEDULE_AI_API_KEY,
    model: env.SCHEDULE_AI_MODEL,
  })
}

export function createCustomerServiceAIProvider(env: AppEnv) {
  return createJsonModelProvider({
    provider: env.CUSTOMER_AI_PROVIDER ?? 'customer-openai-compatible',
    baseUrl: env.CUSTOMER_AI_BASE_URL,
    apiKey: env.CUSTOMER_AI_API_KEY,
    model: env.CUSTOMER_AI_MODEL,
  })
}
