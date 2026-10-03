import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ChatCompletionsJsonModelProvider,
  JsonModelProviderInvalidJsonError,
  createAssessmentAIProvider,
  createCustomerServiceAIProvider,
  createScheduleAIProvider,
  extractJsonObject,
} from './ai-provider.js'

test('extractJsonObject accepts JSON surrounded by model prose', () => {
  assert.deepEqual(
    extractJsonObject('prefix\n{"ok":true,"items":[1,2]}\nsuffix'),
    { ok: true, items: [1, 2] },
  )
})

test('AI provider configuration is isolated by workload', () => {
  const env = {
    NODE_ENV: 'test' as const,
    HOST: '127.0.0.1',
    PORT: 3000,
    ASSESSMENT_AI_BASE_URL: 'https://assessment.example/v1',
    ASSESSMENT_AI_API_KEY: 'assessment-key',
    ASSESSMENT_AI_MODEL: 'assessment-model',
    CUSTOMER_AI_BASE_URL: 'https://customer.example/v1',
    CUSTOMER_AI_API_KEY: 'customer-key',
    CUSTOMER_AI_MODEL: 'customer-model',
  }

  assert.equal(createAssessmentAIProvider(env).isConfigured(), true)
  assert.equal(createCustomerServiceAIProvider(env).isConfigured(), true)
  assert.equal(createScheduleAIProvider(env).isConfigured(), false)
})

test('assessment provider can reproduce evaluated generation contract', async () => {
  const originalFetch = globalThis.fetch
  let capturedBody: Record<string, unknown> | undefined

  globalThis.fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  try {
    const provider = new ChatCompletionsJsonModelProvider({
      provider: 'aliyun-bailian',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'test-key',
      model: 'qwen3.5-27b',
      temperature: 0,
      jsonMode: true,
      extraBody: { enable_thinking: false },
    })

    await provider.generateJson({
      system: 'system',
      user: 'user',
      maxTokens: 100,
    })

    assert.equal(capturedBody?.model, 'qwen3.5-27b')
    assert.equal(capturedBody?.temperature, 0)
    assert.equal(capturedBody?.enable_thinking, false)
    assert.deepEqual(capturedBody?.response_format, { type: 'json_object' })
    assert.equal(capturedBody?.max_tokens, 100)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('assessment provider rejects invalid extra-body JSON at startup', () => {
  assert.throws(
    () =>
      createAssessmentAIProvider({
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: 3000,
        ASSESSMENT_AI_BASE_URL: 'https://assessment.example/v1',
        ASSESSMENT_AI_API_KEY: 'assessment-key',
        ASSESSMENT_AI_MODEL: 'assessment-model',
        ASSESSMENT_AI_EXTRA_BODY_JSON: '{invalid',
      }),
    /ai_provider_extra_body_invalid_json/,
  )
})

test('provider preserves invalid JSON text for bounded assessment repair', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: 'plain text instead of JSON' } }],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )

  try {
    const provider = new ChatCompletionsJsonModelProvider({
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'test-key',
      model: 'test-model',
      jsonMode: true,
    })

    await assert.rejects(
      provider.generateJson({ user: 'Return JSON' }),
      (error: unknown) =>
        error instanceof JsonModelProviderInvalidJsonError &&
        error.rawText === 'plain text instead of JSON',
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
