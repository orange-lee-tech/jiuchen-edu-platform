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

test('extractJsonObject preserves valid JSON primitives for schema validation', () => {
  assert.equal(extractJsonObject('0.999'), 0.999)
  assert.equal(extractJsonObject('"not-an-object"'), 'not-an-object')
  assert.deepEqual(extractJsonObject('[1,2,3]'), [1, 2, 3])
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

test('preset models receive only supported generation parameters', async () => {
  const bodies: Record<string, unknown>[] = []
  const transport = async (_endpoint: string, options: { body: string }) => {
    bodies.push(JSON.parse(options.body) as Record<string, unknown>)
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }) }
  }
  for (const provider of ['deepseek', 'aliyun-bailian']) {
    await createAssessmentAIProvider({ ASSESSMENT_AI_PROVIDER: provider,
      ASSESSMENT_AI_BASE_URL: 'https://example.invalid/v1', ASSESSMENT_AI_API_KEY: 'test-key',
      ASSESSMENT_AI_MODEL: 'text-model', ASSESSMENT_AI_TEMPERATURE: 0.3 } as any,
    transport).generateJson({ user: 'test' })
  }
  assert.equal('temperature' in bodies[0]!, false)
  assert.equal('response_format' in bodies[0]!, false)
  assert.equal(bodies[1]!.temperature, 0.3)
  assert.equal('response_format' in bodies[1]!, false)
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


test('provider can enforce strict JSON Schema response format', async () => {
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
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean' },
      },
      required: ['ok'],
    }

    const provider = new ChatCompletionsJsonModelProvider({
      provider: 'aliyun-bailian',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'test-key',
      model: 'qwen3.8-flash',
      temperature: 0,
      responseFormat: 'json_schema',
      extraBody: { enable_thinking: false },
    })

    await provider.generateJson({
      system: 'system',
      user: 'user',
      jsonSchema: {
        name: 'assessment_output_v1',
        schema,
      },
    })

    assert.equal(capturedBody?.model, 'qwen3.8-flash')
    assert.equal(capturedBody?.temperature, 0)
    assert.equal(capturedBody?.enable_thinking, false)
    assert.deepEqual(capturedBody?.response_format, {
      type: 'json_schema',
      json_schema: {
        name: 'assessment_output_v1',
        strict: true,
        schema,
      },
    })
    assert.equal('max_tokens' in (capturedBody ?? {}), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('strict JSON Schema mode refuses requests without a schema', async () => {
  const provider = new ChatCompletionsJsonModelProvider({
    baseUrl: 'https://example.invalid/v1',
    apiKey: 'test-key',
    model: 'test-model',
    responseFormat: 'json_schema',
  })

  await assert.rejects(
    provider.generateJson({ user: 'user' }),
    /ai_provider_json_schema_required/,
  )
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
