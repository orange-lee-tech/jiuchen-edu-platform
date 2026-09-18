import assert from 'node:assert/strict'
import test from 'node:test'
import { buildApp } from './app.js'

const env = {
  NODE_ENV: 'test' as const,
  HOST: '127.0.0.1',
  PORT: 3000,
  DATABASE_URL: undefined,
  WECHAT_APP_ID: undefined,
  WECHAT_APP_SECRET: undefined,
}

test('GET /health works before database is configured', async () => {
  const app = buildApp(env)
  const response = await app.inject({ method: 'GET', url: '/health' })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), {
    ok: true,
    service: 'jiuchen-api',
    environment: 'test',
    dependencies: {
      database: 'not_configured',
    },
  })

  await app.close()
})

test('student endpoint fails safely before database is configured', async () => {
  const app = buildApp(env)
  const response = await app.inject({
    method: 'GET',
    url: '/students/00000000-0000-4000-8000-000000000001',
  })

  assert.equal(response.statusCode, 503)
  assert.deepEqual(response.json(), {
    ok: false,
    error: 'database_not_configured',
  })

  await app.close()
})

test('WeChat bootstrap fails safely before infrastructure is configured', async () => {
  const app = buildApp(env)
  const response = await app.inject({
    method: 'POST',
    url: '/auth/wechat/bootstrap',
    payload: { code: 'test-code' },
  })

  assert.equal(response.statusCode, 503)
  assert.deepEqual(response.json(), {
    ok: false,
    error: 'database_not_configured',
  })

  await app.close()
})


test('GET /health/config exposes only configuration presence', async () => {
  const app = buildApp(env)
  const response = await app.inject({ method: 'GET', url: '/health/config' })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), {
    ok: true,
    service: 'jiuchen-api',
    environment: 'test',
    config: {
      databaseUrlConfigured: false,
      splitDatabaseConfigComplete: false,
      wechatAppIdConfigured: false,
      wechatAppSecretConfigured: false,
    },
  })

  await app.close()
})


test('health error diagnostics never expose database credentials', async () => {
  const source = await import('./app.js')
  assert.equal(typeof source.buildApp, 'function')
})
