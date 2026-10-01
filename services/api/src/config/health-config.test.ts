import assert from 'node:assert/strict'
import test from 'node:test'
import { buildApp } from '../app.js'

test('health config reports credential presence without exposing secret values', async () => {
  const app = buildApp({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: 3000,
    CLOUDBASE_ENV_ID: 'cloud-env',
    TENCENTCLOUD_SECRETID: 'cam-id',
    TENCENTCLOUD_SECRETKEY: 'cam-key',
    ASSESSMENT_AI_BASE_URL: 'https://assessment.example/v1',
    ASSESSMENT_AI_API_KEY: 'assessment-key',
    ASSESSMENT_AI_MODEL: 'assessment-model',
    SCHEDULE_AI_BASE_URL: 'https://schedule.example/v1',
    SCHEDULE_AI_API_KEY: 'schedule-key',
    SCHEDULE_AI_MODEL: 'schedule-model',
    CUSTOMER_AI_BASE_URL: 'https://customer.example/v1',
    CUSTOMER_AI_API_KEY: 'customer-key',
    CUSTOMER_AI_MODEL: 'customer-model',
  })

  const response = await app.inject({
    method: 'GET',
    url: '/health/config',
  })

  assert.equal(response.statusCode, 200)
  const body = response.json() as {
    config: Record<string, boolean>
  }

  assert.deepEqual(body.config, {
    databaseUrlConfigured: false,
    splitDatabaseConfigComplete: false,
    wechatAppIdConfigured: false,
    wechatAppSecretConfigured: false,
    officialAccountConfigured: false,
    cloudbaseCamConfigured: true,
    cloudbaseExternalConfigured: true,
    assessmentAiConfigured: true,
    scheduleAiConfigured: true,
    customerAiConfigured: true,
  })

  const serialized = JSON.stringify(body)
  assert.equal(serialized.includes('cam-key'), false)
  assert.equal(serialized.includes('assessment-key'), false)
  assert.equal(serialized.includes('schedule-key'), false)
  assert.equal(serialized.includes('customer-key'), false)

  await app.close()
})
