import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'
import { growthRecords, scheduleImports, userSessions } from '../db/schema.js'
import type { DatabaseContext } from '../db/client.js'
import { registerCourseAcademicFactRoutes } from './course-academic-facts.js'
import { registerGrowthProfileRoutes } from './growth-profile.js'

const courseKey = '6b1db1b5-0c1c-438d-a317-66a1d4e72c18'
const otherKey = '6b1db1b5-0c1c-438d-a317-66a1d4e72c19'
const scheduleCourse = (dayIndex: number) => ({ courseKey, name: '工程热力学', day: `周${dayIndex === 1 ? '一' : '三'}`, dayIndex,
  slot: '第1-2节', startSection: 1, endSection: 2, time: null, location: null, teacher: null, weeks: null, raw: '工程热力学' })

function fixture() {
  let role = 'student', writes = 0
  const rows: Array<Record<string, any>> = []
  const db = {
    select() {
      let table: unknown
      const q = { from(value: unknown) { table = value; return q }, innerJoin() { return q }, leftJoin() { return q }, where() { return q }, orderBy() { return q },
        async limit() {
          if (table === userSessions) return [{ userId: 'student-a', role, status: 'active', internalIdStatus: 'claimed', expiresAt: new Date('2099-01-01') }]
          if (table === scheduleImports) return [{ parsedJson: { sourceType: 'spreadsheet', stageCode: 'junior-fall', warnings: [], courses: [scheduleCourse(1), scheduleCourse(3)] } }]
          if (table === growthRecords) return rows.slice(0, 1)
          return []
        },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve(table === growthRecords ? rows : []).then(resolve, reject) },
      }
      return q
    },
    insert(table: unknown) {
      assert.equal(table, growthRecords)
      return {
        values(value: Record<string, any>) {
          return {
            async onDuplicateKeyUpdate(args: { set: Record<string, any> }) {
              const existing = rows.find(row => row.sourceKey === value.sourceKey)
              if (existing) Object.assign(existing, args.set, { updatedAt: new Date() })
              else rows.push({ ...value, updatedAt: new Date() })
              writes += 1
            },
          }
        },
      }
    },
  }
  const app = Fastify()
  registerCourseAcademicFactRoutes(app, { configured: true, db } as unknown as DatabaseContext)
  registerGrowthProfileRoutes(app, { configured: true, db } as unknown as DatabaseContext)
  return { app, rows, headers: { authorization: 'Bearer synthetic' }, get writes() { return writes }, setRole(value: string) { role = value } }
}

test('course facts require ownership and valid grades; same key across two periods saves once', async () => {
  const env = fixture(), { app, headers } = env
  const payload = { stageCode: 'junior-fall', credits: 3.5, gradeScale: 'percentage', gradeValue: '92' }
  try {
    assert.equal((await app.inject({ url: '/me/course-academic-facts?stageCode=junior-fall' })).statusCode, 401)
    env.setRole('teacher')
    assert.equal((await app.inject({ method: 'PUT', url: `/me/course-academic-facts/${courseKey}`, headers, payload })).statusCode, 403)
    env.setRole('student')
    assert.equal((await app.inject({ method: 'PUT', url: `/me/course-academic-facts/${courseKey}`, headers, payload: { ...payload, credits: -1 } })).statusCode, 400)
    assert.equal((await app.inject({ method: 'PUT', url: `/me/course-academic-facts/${otherKey}`, headers, payload })).statusCode, 404)
    const first = await app.inject({ method: 'PUT', url: `/me/course-academic-facts/${courseKey}`, headers, payload })
    assert.equal(first.statusCode, 200)
    const repeated = await app.inject({ method: 'PUT', url: `/me/course-academic-facts/${courseKey}`, headers, payload })
    assert.equal(repeated.statusCode, 200)
    assert.equal(first.json().fact.recordId, repeated.json().fact.recordId)
    const concurrent = await Promise.all([0, 1].map(() => app.inject({ method: 'PUT', url: `/me/course-academic-facts/${courseKey}`, headers, payload })))
    assert.deepEqual(concurrent.map(response => response.statusCode), [200, 200])
    assert.equal(env.rows.length, 1)
    const listed = await app.inject({ url: '/me/course-academic-facts?stageCode=junior-fall', headers })
    assert.equal(listed.statusCode, 200)
    assert.equal(listed.json().facts.length, 1)
    assert.equal(listed.json().facts[0].credits, 3.5)
    assert.equal((await app.inject({ url: '/me/course-academic-facts?stageCode=senior-fall', headers })).json().facts.length, 0)
  } finally { await app.close() }
})

test('generic growth edit and delete cannot erase confirmed course metadata', async () => {
  const env = fixture(), { app, headers } = env
  try {
    const saved = await app.inject({ method: 'PUT', url: `/me/course-academic-facts/${courseKey}`, headers,
      payload: { stageCode: 'junior-fall', credits: 0, gradeScale: 'unset', gradeValue: null } })
    assert.equal(saved.statusCode, 200)
    const id = saved.json().fact.recordId as string
    const generic = { type: 'course', title: '工程热力学' }
    assert.equal((await app.inject({ method: 'PUT', url: `/me/growth-records/${id}`, headers, payload: generic })).statusCode, 409)
    assert.equal((await app.inject({ method: 'DELETE', url: `/me/growth-records/${id}`, headers })).statusCode, 409)
    assert.equal(env.rows[0]?.metadataJson?.schemaVersion, 'course-academic-fact-v1')
  } finally { await app.close() }
})
