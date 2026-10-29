import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'
import type { AppEnv } from '../config/env.js'
import type { DatabaseContext } from '../db/client.js'
import { registerMobileAdminRoutes } from './mobile-admin.js'

function databaseForRole(role: 'teacher' | 'staff' | 'admin' | 'student') {
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
  const pool={async query(_sql:string,_args:unknown[]){return [[{calls:1,initialCalls:1,
    repairCalls:0,usageReturned:0,awaitingReconciliation:1,promptTokens:0,
    completionTokens:0,avgPromptChars:1000,avgOutputBudget:1000}],null]}}
  return { configured: true, db, pool } as unknown as DatabaseContext
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

test('AI cost routes enforce admin and assigned-teacher boundaries',async()=>{
  for(const item of [
    {role:null,url:'/me/admin/assessment-ai-costs',status:401},
    {role:'teacher' as const,url:'/me/admin/assessment-ai-costs',status:403},
    {role:'student' as const,url:'/me/admin/assessment-ai-balance',status:403},
    {role:'teacher' as const,url:'/me/admin/ai-balance-snapshots?objectId=11111111-1111-4111-8111-111111111111',status:403},
    {role:null,url:'/me/teacher/assessment-ai-costs',status:401},
    {role:'admin' as const,url:'/me/teacher/assessment-ai-costs',status:403},
    {role:'student' as const,url:'/me/teacher/assessment-ai-costs',status:403},
  ]){
    const app=Fastify(),database=databaseForRole(item.role??'teacher')
    registerMobileAdminRoutes(app,database,{} as AppEnv)
    const response=await app.inject({method:'GET',url:item.url,
      headers:item.role?{authorization:'Bearer synthetic'}:{}})
    assert.equal(response.statusCode,item.status)
    await app.close()
  }
  const app=Fastify()
  registerMobileAdminRoutes(app,databaseForRole('teacher'),{} as AppEnv)
  const response=await app.inject({method:'GET',url:'/me/teacher/assessment-ai-costs',
    headers:{authorization:'Bearer synthetic'}})
  assert.equal(response.statusCode,200)
  assert.equal(response.json().costs.scope,'assigned_students')
  assert.equal(response.json().costs.providerBalance,'forbidden')
  await app.close()
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

test('manual supplier balance accepts only administrator writes and validates amounts and time', async () => {
  for (const role of ['teacher', 'student'] as const) {
    const app=Fastify();registerMobileAdminRoutes(app,databaseForRole(role),{} as AppEnv)
    const response=await app.inject({method:'POST',url:'/me/admin/ai-balance-snapshots',headers:{authorization:'Bearer synthetic'},payload:{}})
    assert.equal(response.statusCode,403);await app.close()
  }
  const app=Fastify();registerMobileAdminRoutes(app,databaseForRole('admin'),{} as AppEnv)
  try {
    const response=await app.inject({method:'POST',url:'/me/admin/ai-balance-snapshots',headers:{authorization:'Bearer synthetic'},
      payload:{objectId:'11111111-1111-4111-8111-111111111111',currency:'CNY',balance:'-1',warningThreshold:'0',verifiedAt:'2099-01-01T00:00:00.000Z'}})
    assert.equal(response.statusCode,400)
  } finally {await app.close()}
})
