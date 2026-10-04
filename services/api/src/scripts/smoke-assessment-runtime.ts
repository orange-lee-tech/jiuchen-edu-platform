import { loadEnv } from '../config/env.js'
import { executeAssessment, createAssessmentRuntimeFromEnv } from '../services/assessment-runtime.js'

if (process.env.NODE_ENV === 'production') {
  throw new Error('assessment_runtime_smoke_refuses_production_mode')
}

const env = loadEnv({
  ...process.env,
  NODE_ENV: 'development',
})

const runtime = createAssessmentRuntimeFromEnv(env)

if (!runtime.provider.isConfigured()) {
  throw new Error(
    'assessment_provider_not_configured:set ASSESSMENT_AI_BASE_URL/ASSESSMENT_AI_API_KEY/ASSESSMENT_AI_MODEL',
  )
}

const input = {
  profile: {
    university: '中南大学',
    major: '自动化',
    currentGrade: '大三',
    gpaText: '3.8/4.0',
    rankText: '8/120',
    backgroundNote: '希望申请控制、人工智能相关方向。',
  },
  english: [
    {
      type: 'cet6' as const,
      score: '520',
      note: null,
    },
  ],
  research: [
    {
      title: '智能控制课程科研项目',
      type: 'project' as const,
      role: '主要成员',
      organization: '校内实验室',
      level: 'school' as const,
      description: '负责数据整理、模型实现与实验复现。',
      output: '完成项目报告与实验结果。',
    },
  ],
  competitions: [
    {
      name: '大学生数学建模竞赛',
      level: 'provincial' as const,
      award: '省级二等奖',
      role: '编程成员',
      description: '负责模型实现与结果分析。',
    },
  ],
  targets: [
    {
      schoolName: '浙江大学',
      programName: '控制科学与工程',
      researchDirection: '智能控制',
      note: null,
    },
  ],
  preferences: {
    preferredRegions: ['杭州'],
    researchDirection: '智能控制与人工智能',
    note: null,
  },
}

type ProviderDiagnostic = {
  status?: number
  finishReason?: unknown
  contentType?: string
  contentLength?: number
  startsWithObject?: boolean
  endsWithObject?: boolean
  reasoningContentLength?: number
  messageKeys?: string[]
  usage?: unknown
  responseFormatType?: unknown
  responseFormatStrict?: unknown
  diagnosticError?: string
}

const originalFetch = globalThis.fetch
let providerDiagnostic: ProviderDiagnostic | undefined

globalThis.fetch = async (resource, init) => {
  const response = await originalFetch(resource, init)

  if (String(resource).includes('/chat/completions')) {
    try {
      const requestBody = JSON.parse(String(init?.body ?? '{}')) as {
        response_format?: {
          type?: unknown
          json_schema?: {
            strict?: unknown
          }
        }
      }
      const payload = (await response.clone().json()) as {
        choices?: Array<{
          finish_reason?: unknown
          message?: {
            content?: unknown
            reasoning_content?: unknown
            [key: string]: unknown
          }
        }>
        usage?: unknown
      }
      const choice = payload.choices?.[0]
      const message = choice?.message
      const content = message?.content
      const text =
        typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content
                .map((item) =>
                  item &&
                  typeof item === 'object' &&
                  'text' in item &&
                  typeof item.text === 'string'
                    ? item.text
                    : '',
                )
                .join('')
            : ''
      const trimmed = text.trim()

      providerDiagnostic = {
        status: response.status,
        finishReason: choice?.finish_reason,
        contentType: Array.isArray(content) ? 'array' : typeof content,
        contentLength: text.length,
        startsWithObject: trimmed.startsWith('{'),
        endsWithObject: trimmed.endsWith('}'),
        reasoningContentLength:
          typeof message?.reasoning_content === 'string'
            ? message.reasoning_content.length
            : 0,
        messageKeys: message ? Object.keys(message).sort() : [],
        usage: payload.usage,
        responseFormatType: requestBody.response_format?.type,
        responseFormatStrict: requestBody.response_format?.json_schema?.strict,
      }
    } catch (error) {
      providerDiagnostic = {
        status: response.status,
        diagnosticError:
          error instanceof Error ? error.message : String(error),
      }
    }
  }

  return response
}

const startedAt = Date.now()

try {
  const result = await executeAssessment(runtime, input)

  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: result.provider,
        model: result.model,
        knowledgeVersion: result.knowledgeVersion,
        evidenceCount: result.evidence.length,
        latencyMs: Date.now() - startedAt,
        providerDiagnostic,
        output: result.output,
      },
      null,
      2,
    ),
  )
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startedAt,
        providerDiagnostic,
      },
      null,
      2,
    ),
  )
  throw error
} finally {
  globalThis.fetch = originalFetch
}
