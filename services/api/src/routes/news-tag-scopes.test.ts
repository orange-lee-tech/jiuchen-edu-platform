import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import { newsPosts, userSessions } from '../db/schema.js'
import { loadEnv } from '../config/env.js'
import { registerNewsRoutes } from './news.js'
import { registerTeacherNewsTagRoutes } from './teacher-news-tags.js'
import { registerMobileAdminRoutes } from './mobile-admin.js'

const postId = '00000000-0000-4000-8000-000000000101'
const headers = { authorization: 'Bearer synthetic' }

test('news API keeps two teacher scopes separate, combines only live assignments, and preserves admin global tags', async () => {
  const labels = new Map<string, string[]>()
  const assignments = new Map([['student-a', new Set(['teacher-one', 'teacher-two'])], ['student-b', new Set(['teacher-three'])]])
  const active = new Set(['teacher-one', 'teacher-two', 'teacher-three'])
  const users = new Map([['teacher-one', 'teacher-user-one'], ['teacher-two', 'teacher-user-two'], ['teacher-three', 'teacher-user-three']])
  let globalTags = ['平台分类']
  const post = () => ({ id: postId, title: '合成资讯', source: 'manual', summary: null, coverUrl: null, articleUrl: null,
    publishedAt: null, contentJson: {}, tagsJson: globalTags, status: 'active' })
  function client(userId: string, role: string) {
    const db = { select() {
      let table: unknown
      const query = { from(value: unknown) { table = value; return query }, innerJoin() { return query }, leftJoin() { return query },
        where() { return query }, orderBy() { return query }, async limit() {
          return table === userSessions ? [{ userId, role, status: 'active', internalIdStatus: 'claimed', expiresAt: new Date('2099-01-01') }]
            : table === newsPosts ? [post()] : []
        } }
      return query
    }, update(table: unknown) { assert.equal(table, newsPosts); return { set(value: { tagsJson: string[] }) {
      return { async where() { globalTags = value.tagsJson } }
    } } } }
    const sql = async (statement: string, values: unknown[] = []) => {
      if (statement.includes('FROM teachers')) {
        const owner = statement.includes('id=? AND user_id=?') ? String(values[0]) : [...users].find(([, uid]) => uid === values[0])?.[0]
        return [owner && active.has(owner) ? [{ id: owner }] : []]
      }
      if (statement.includes('SELECT id FROM news_posts')) return [[{ id: postId }]]
      if (statement.includes('FROM news_posts n')) return [[{ id: postId, title: '合成资讯', globalTags,
        teacherTags: labels.get(String(values[0])) ?? [], updatedAt: null }]]
      if (statement.includes('INSERT INTO teacher_news_tags')) {
        labels.set(String(values[1]), JSON.parse(String(values[2]))); return [{ affectedRows: 1 }]
      }
      if (statement.includes('DELETE FROM teacher_news_tags')) { labels.delete(String(values[1])); return [{ affectedRows: 1 }] }
      if (statement.includes('FROM teacher_news_tags nt')) {
        assert.equal(values[1], userId, 'scope is derived from the authenticated subject')
        const visible = role === 'teacher' ? new Set([...users].filter(([, uid]) => uid === userId).map(([id]) => id)) : assignments.get(userId) ?? new Set<string>()
        return [[...labels].filter(([id]) => active.has(id) && visible.has(id)).map(([teacherId, tagsJson]) =>
          ({ postId, teacherId, teacherName: teacherId, tagsJson }))]
      }
      throw new Error('unexpected_sql')
    }
    const pool = { query: sql, async getConnection() { return { query: sql, async beginTransaction() {}, async commit() {}, async rollback() {}, release() {} } } }
    const database = { configured: true, db, pool } as unknown as DatabaseContext
    const app = Fastify({ logger: false })
    const env = loadEnv({ NEWS_V2_ENABLED: 'false' })
    registerNewsRoutes(app, database, env)
    registerTeacherNewsTagRoutes(app, database)
    registerMobileAdminRoutes(app, database, env)
    return app
  }
  const one = client('teacher-user-one', 'teacher'), two = client('teacher-user-two', 'teacher')
  const three = client('teacher-user-three', 'teacher'), studentA = client('student-a', 'student'), studentB = client('student-b', 'student')
  const admin = client('admin', 'admin')
  const all = [one, two, three, studentA, studentB, admin]
  const save = async (app: typeof one, tags: string[]) => {
    const response = await app.inject({ method: 'PUT', url: '/me/teacher/news/' + postId + '/tags', headers, payload: { tags } })
    assert.equal(response.statusCode, 200, response.body)
  }
  const read = async (app: typeof one) => {
    const response = await app.inject({ url: '/news/' + postId, headers })
    assert.equal(response.statusCode, 200, response.body)
    return response.json().post
  }
  try {
    await save(one, ['一号标签']); await save(two, ['协助标签']); await save(three, ['另一学员标签'])
    const own = (await one.inject({ url: '/me/teacher/news', headers })).json().posts[0]
    assert.deepEqual(own.teacherTags, ['一号标签'])
    assert.deepEqual((await two.inject({ url: '/me/teacher/news', headers })).json().posts[0].teacherTags, ['协助标签'])
    assert.deepEqual((await read(studentA)).tags, ['平台分类', '一号标签', '协助标签'])
    assert.deepEqual((await read(studentB)).tags, ['平台分类', '另一学员标签'])
    const list = (await studentA.inject({ url: '/news', headers })).json().posts[0]
    assert.deepEqual(list.teacherTags.map((scope: { teacherId: string }) => scope.teacherId), ['teacher-one', 'teacher-two'])
    assignments.get('student-a')!.delete('teacher-one')
    assert.deepEqual((await read(studentA)).tags, ['平台分类', '协助标签'])
    assert.deepEqual((await read(admin)).teacherTags, [])
    assert.equal((await one.inject({ method: 'PUT', url: '/me/admin/news/' + postId + '/tags', headers, payload: { tags: ['越权'] } })).statusCode, 403)
    const updateGlobal = await admin.inject({ method: 'PUT', url: '/me/admin/news/' + postId + '/tags', headers, payload: { tags: ['管理员新分类'] } })
    assert.equal(updateGlobal.statusCode, 200, updateGlobal.body)
    assert.deepEqual((await read(studentA)).tags, ['管理员新分类', '协助标签'])
    assert.deepEqual(labels.get('teacher-one'), ['一号标签'])
    assert.deepEqual(labels.get('teacher-three'), ['另一学员标签'])
    await save(two, [])
    assert.deepEqual((await read(studentA)).tags, ['管理员新分类'])
    assert.deepEqual((await read(studentB)).tags, ['管理员新分类', '另一学员标签'])
    active.delete('teacher-three')
    assert.deepEqual((await read(studentB)).tags, ['管理员新分类'])
  } finally { await Promise.all(all.map(app => app.close())) }
})
