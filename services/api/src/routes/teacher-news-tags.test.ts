import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import { registerTeacherNewsTagRoutes } from './teacher-news-tags.js'

const postId = '00000000-0000-4000-8000-000000000101'
function fixture(role: string | null = 'teacher', teacherId = 'teacher-one', active = true, storageAvailable = true) {
  const calls: Array<{ sql: string; values: unknown[] }> = []
  const labels = new Map<string, string[]>([['teacher-two', ['其他老师']]])
  const globalTags = ['平台标签']
  let committed = 0, rolledBack = 0, connections = 0
  const query = { from() { return this }, innerJoin() { return this }, leftJoin() { return this }, where() { return this },
    async limit() { return role ? [{ userId: 'user-' + teacherId, role, status: 'active', internalIdStatus: 'claimed', expiresAt: new Date('2099-01-01') }] : [] } }
  const sql = async (statement: string, values: unknown[] = []) => {
    calls.push({ sql: statement, values })
    if (!storageAvailable && statement.includes('teacher_news_tags'))
      throw Object.assign(new Error('synthetic missing schema'), { code: 'ER_NO_SUCH_TABLE' })
    if (statement.includes('FROM teachers')) return [active ? [{ id: teacherId }] : []]
    if (statement.includes('SELECT id FROM news_posts')) return [[{ id: postId }]]
    if (statement.includes('FROM news_posts n')) return [[{ id: postId, title: '合成资讯', globalTags, teacherTags: labels.get(String(values[0])) ?? [], updatedAt: null }]]
    if (statement.includes('INSERT INTO teacher_news_tags')) { labels.set(String(values[1]), JSON.parse(String(values[2]))); return [{ affectedRows: 1 }] }
    if (statement.includes('DELETE FROM teacher_news_tags')) { labels.delete(String(values[1])); return [{ affectedRows: 1 }] }
    throw new Error('unexpected_sql')
  }
  const database = { configured: true, db: { select() { return query } }, pool: {
    query: sql, async getConnection() { connections++; return { query: sql,
      async beginTransaction() {}, async commit() { committed++ }, async rollback() { rolledBack++ }, release() {} } },
  } } as unknown as DatabaseContext
  const app = Fastify({ logger: false })
  registerTeacherNewsTagRoutes(app, database)
  return { app, calls, labels, globalTags, stats: () => ({ committed, rolledBack, connections }) }
}
const headers = { authorization: 'Bearer synthetic' }

test('teacher tag management requires the active teacher identity; students, admins and guests cannot write', async () => {
  for (const role of [null, 'student', 'admin', 'staff', 'user']) {
    const f = fixture(role)
    for (const method of ['GET', 'PUT'] as const) {
      const response = await f.app.inject({ method, url: '/me/teacher/news/' + postId + '/tags',
        headers: role ? headers : {}, ...(method === 'PUT' ? { payload: { tags: ['标签'] } } : {}) })
      assert.equal(response.statusCode, role ? 403 : 401)
    }
    assert.equal(f.calls.length, 0)
    await f.app.close()
  }
  const inactive = fixture('teacher', 'teacher-inactive', false)
  assert.equal((await inactive.app.inject({ url: '/me/teacher/news', headers })).statusCode, 403)
  assert.equal(inactive.stats().connections, 0)
  await inactive.app.close()
})

test('teacher saves, rereads and removes only their own labels; platform and other teacher labels survive', async () => {
  const f = fixture()
  for (let i = 0; i < 2; i++) {
    const result = await f.app.inject({ method: 'PUT', url: '/me/teacher/news/' + postId + '/tags', headers,
      payload: { tags: [' 夏令营 ', '夏令营', '英语'] } })
    assert.equal(result.statusCode, 200)
    assert.deepEqual(result.json().teacherTags, ['夏令营', '英语'])
  }
  const read = (await f.app.inject({ url: '/me/teacher/news/' + postId + '/tags', headers })).json().post
  assert.deepEqual(read.teacherTags, ['夏令营', '英语'])
  assert.deepEqual(read.globalTags, ['平台标签'])
  const list = (await f.app.inject({ url: '/me/teacher/news', headers })).json().posts
  assert.deepEqual(list[0].teacherTags, ['夏令营', '英语'])
  assert.deepEqual(f.labels.get('teacher-two'), ['其他老师'])
  assert.equal((await f.app.inject({ method: 'PUT', url: '/me/teacher/news/' + postId + '/tags', headers, payload: { tags: [] } })).statusCode, 200)
  assert.equal(f.labels.has('teacher-one'), false)
  assert.deepEqual(f.labels.get('teacher-two'), ['其他老师'])
  assert.deepEqual(f.globalTags, ['平台标签'])
  assert.equal(f.stats().committed, 3)
  assert.equal(f.calls.some(call => /UPDATE news_posts|UPDATE teachers/.test(call.sql)), false)
  for (const call of f.calls.filter(call => /INSERT INTO teacher_news_tags|DELETE FROM teacher_news_tags/.test(call.sql)))
    assert.equal(call.values[1], 'teacher-one')
  await f.app.close()
})

test('tag write rejects another teacher scope, invalid IDs and unbounded labels before a transaction', async () => {
  const f = fixture()
  for (const payload of [{ teacherId: 'teacher-two', tags: ['篡改'] }, { tags: [''] }, { tags: ['a'.repeat(41)] }, { tags: Array.from({ length: 9 }, (_, i) => String(i)) }]) {
    assert.equal((await f.app.inject({ method: 'PUT', url: '/me/teacher/news/' + postId + '/tags', headers, payload })).statusCode, 400)
  }
  assert.equal((await f.app.inject({ method: 'PUT', url: '/me/teacher/news/not-a-uuid/tags', headers, payload: { tags: [] } })).statusCode, 400)
  assert.equal(f.stats().connections, 0)
  assert.deepEqual(f.labels.get('teacher-two'), ['其他老师'])
  await f.app.close()
})

test('missing tag migration returns actionable 503 and rolls back a write instead of reporting empty/success', async () => {
  const f = fixture('teacher', 'teacher-one', true, false)
  const list = await f.app.inject({ url: '/me/teacher/news', headers })
  assert.equal(list.statusCode, 503)
  assert.equal(list.json().code, 'teacher_news_tags_schema_missing')
  const save = await f.app.inject({ method: 'PUT', url: '/me/teacher/news/' + postId + '/tags', headers, payload: { tags: ['标签'] } })
  assert.equal(save.statusCode, 503)
  assert.equal(save.json().code, 'teacher_news_tags_schema_missing')
  assert.equal(f.stats().rolledBack, 1)
  assert.equal(f.stats().committed, 0)
  await f.app.close()
})

test('read-only capability headers cannot write teacher labels', async () => {
  const f = fixture()
  const result = await f.app.inject({ method: 'PUT', url: '/me/teacher/news/' + postId + '/tags',
    headers: { ...headers, 'x-jiuchen-read-only-target': 'teacher:' + postId }, payload: { tags: ['标签'] } })
  assert.equal(result.statusCode, 403)
  assert.equal(f.stats().connections, 0)
  assert.equal(f.calls.length, 0)
  await f.app.close()
})
