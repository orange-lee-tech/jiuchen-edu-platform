import assert from 'node:assert/strict'
import test from 'node:test'
import { buildApp } from './app.js'

const env = {
  NODE_ENV: 'test' as const,
  HOST: '127.0.0.1',
  PORT: 3000,
  DATABASE_URL: undefined,
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
