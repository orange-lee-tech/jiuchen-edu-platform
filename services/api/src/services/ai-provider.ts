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

export type JsonModelRequest = {
  system?: string
  user: JsonModelUserContent
  maxTokens?: number
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
}

export class JsonModelProviderUnavailableError extends Error {
  constructor() {
    super('ai_provider_not_configured')
    this.name = 'JsonModelProviderUnavailableError'
  }
}

export class JsonModelProviderHttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super('ai_provider_http_' + status)
    this.name = 'JsonModelProviderHttpError'
    this.status = status
  }
}

export function extractJsonObject(textValue: string): unknown {
  const trimmed = textValue.trim()
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

  constructor(config: JsonModelProviderConfig) {
    this.provider = config.provider?.trim() || 'openai-compatible'
    this.model = config.model?.trim() || 'unconfigured'
    this.baseUrl = config.baseUrl?.trim()
    this.apiKey = config.apiKey?.trim()
    this.timeoutMs = config.timeoutMs ?? 60_000
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

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.1,
          ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new JsonModelProviderHttpError(response.status)
      }

      const payload = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: unknown
          }
        }>
      }

      const text = responseText(payload.choices?.[0]?.message?.content)
      if (!text) throw new Error('ai_provider_empty_response')

      return extractJsonObject(text)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('ai_provider_timeout')
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

export function createAssessmentAIProvider(env: AppEnv) {
  return createJsonModelProvider({
    provider: env.ASSESSMENT_AI_PROVIDER ?? 'assessment-openai-compatible',
    baseUrl: env.ASSESSMENT_AI_BASE_URL,
    apiKey: env.ASSESSMENT_AI_API_KEY,
    model: env.ASSESSMENT_AI_MODEL,
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
