import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'
import type { AppEnv } from '../config/env.js'
import type { DatabaseContext } from '../db/client.js'
import { registerMobileAdminRoutes } from './mobile-admin.js'

function databaseForRole(role: 'teacher' | 'staff') {
  const db = {
    select() {
      const query = {
        from() { return query },
        innerJoin() { return query },
        leftJoin() { return query },
        where() { return query },
        async limit() {
          return [{
            sessionId: 'session',
            userId: 'user',
            role,
            displayName: role,
            status: 'active',
            internalIdStatus: 'claimed',
            expiresAt: new Date('2099-01-01T00:00:00.000Z'),
          }]
        },
      }
      return query
    },
  }
  return { configured: true, db, pool: {} } as unknown as DatabaseContext
}

test('Release A admin reads reject anonymous, teacher and staff sessions', async () => {
  const cases = [
    { url: '/me/admin/assessment-analytics', role: null, expected: 401 },
    { url: '/me/admin/assessment-analytics', role: 'teacher' as const, expected: 403 },
    { url: '/me/admin/internal-ids', role: 'staff' as const, expected: 403 },
  ]

  for (const item of cases) {
    const app = Fastify()
    const database = databaseForRole(item.role ?? 'teacher')
    registerMobileAdminRoutes(app, database, {} as AppEnv)
    const response = await app.inject({
      method: 'GET',
      url: item.url,
      headers: item.role ? { authorization: 'Bearer synthetic' } : {},
    })
    assert.equal(response.statusCode, item.expected)
    await app.close()
  }
})

test('Release A does not allow teachers to trigger the news write endpoint', async () => {
  const app = Fastify()
  registerMobileAdminRoutes(app, databaseForRole('teacher'), {} as AppEnv)
  const response = await app.inject({
    method: 'POST',
    url: '/me/admin/news/sync',
    headers: { authorization: 'Bearer synthetic' },
  })
  assert.equal(response.statusCode, 403)
  assert.equal(response.json().error, 'admin_forbidden')
  await app.close()
})
