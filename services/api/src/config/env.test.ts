import assert from 'node:assert/strict'
import test from 'node:test'
import { loadEnv } from './env.js'

test('blank optional env values are treated as unset', () => {
  const env = loadEnv({
    NODE_ENV: 'development',
    DATABASE_URL: 'mysql://user:pass@localhost:3306/test',
    WECHAT_APP_ID: '',
    WECHAT_APP_SECRET: '',
  })

  assert.equal(env.DATABASE_URL, 'mysql://user:pass@localhost:3306/test')
  assert.equal(env.WECHAT_APP_ID, undefined)
  assert.equal(env.WECHAT_APP_SECRET, undefined)
})

test('CAM and AI product credentials remain independently configurable', () => {
  const env = loadEnv({
    NODE_ENV: 'production',
    CLOUDBASE_ENV_ID: 'cloud-env',
    TENCENTCLOUD_SECRETID: 'cam-id',
    TENCENTCLOUD_SECRETKEY: 'cam-key',
    ASSESSMENT_AI_BASE_URL: 'https://assessment.example/v1',
    ASSESSMENT_AI_API_KEY: 'assessment-key',
    ASSESSMENT_AI_MODEL: 'assessment-model',
    CUSTOMER_AI_BASE_URL: 'https://customer.example/v1',
    CUSTOMER_AI_API_KEY: 'customer-key',
    CUSTOMER_AI_MODEL: 'customer-model',
  })

  assert.equal(env.TENCENTCLOUD_SECRETID, 'cam-id')
  assert.equal(env.TENCENTCLOUD_SECRETKEY, 'cam-key')
  assert.equal(env.ASSESSMENT_AI_MODEL, 'assessment-model')
  assert.equal(env.CUSTOMER_AI_MODEL, 'customer-model')
  assert.equal(env.SCHEDULE_AI_MODEL, undefined)
})

test('assessment AI generation options are parsed explicitly', () => {
  const env = loadEnv({
    NODE_ENV: 'production',
    ASSESSMENT_AI_TEMPERATURE: '0',
    ASSESSMENT_AI_JSON_MODE: 'true',
    ASSESSMENT_AI_EXTRA_BODY_JSON: '{"enable_thinking":false}',
  })

  assert.equal(env.ASSESSMENT_AI_TEMPERATURE, 0)
  assert.equal(env.ASSESSMENT_AI_JSON_MODE, true)
  assert.equal(
    env.ASSESSMENT_AI_EXTRA_BODY_JSON,
    '{"enable_thinking":false}',
  )
})
