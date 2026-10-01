import assert from 'node:assert/strict'
import test from 'node:test'
import {
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
