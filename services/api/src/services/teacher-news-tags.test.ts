import test from 'node:test'
import assert from 'node:assert/strict'
import type mysql from 'mysql2/promise'
import { readTeacherNewsTagScopes, withNewsTagScopes } from './teacher-news-tags.js'

test('student combines multiple assigned teachers while unrelated, removed and inactive teachers stay invisible', async () => {
  const assignments = new Set(['one', 'support'])
  const teachers = [
    { teacherId: 'one', teacherName: '一号', tagsJson: ['夏令营'], active: true },
    { teacherId: 'support', teacherName: '协助', tagsJson: ['英语'], active: true },
    { teacherId: 'unrelated', teacherName: '无关', tagsJson: ['不能看到'], active: true },
    { teacherId: 'inactive', teacherName: '停用', tagsJson: ['停用标签'], active: false },
  ]
  assignments.add('inactive')
  const pool = { async query(sql: string, params: unknown[]) {
    assert.match(sql, /EXISTS \(SELECT 1 FROM students s/)
    assert.match(sql, /a\.teacher_id=nt\.teacher_id/)
    assert.match(sql, /t\.status='active'/)
    assert.match(sql, /teacher_account\.status='active'/)
    assert.deepEqual(params, [['post'], 'student-one'])
    return [teachers.filter(teacher => assignments.has(teacher.teacherId) && teacher.active).map(teacher => ({ ...teacher, postId: 'post' }))]
  } } as unknown as mysql.Pool
  const original = [{ id: 'post', tags: ['平台分类'], title: '资讯' }]
  let posts = await withNewsTagScopes(pool, { userId: 'student-one', role: 'student' }, original)
  assert.deepEqual(posts[0].tags, ['平台分类', '夏令营', '英语'])
  assert.deepEqual(posts[0].globalTags, ['平台分类'])
  assert.deepEqual(posts[0].teacherTags.map(scope => scope.teacherId), ['one', 'support'])
  assert.deepEqual(original[0].tags, ['平台分类'])
  assignments.delete('one')
  posts = await withNewsTagScopes(pool, { userId: 'student-one', role: 'student' }, original)
  assert.deepEqual(posts[0].tags, ['平台分类', '英语'])
})

test('guest and admin public reads contain only platform labels and do not query teacher scopes', async () => {
  const pool = { query() { throw new Error('must_not_read_teacher_scope') } } as unknown as mysql.Pool
  for (const viewer of [null, { userId: 'admin', role: 'admin' }, { userId: 'unbound-user', role: 'user' }]) {
    const [post] = await withNewsTagScopes(pool, viewer, [{ id: 'post', tags: ['平台'] }])
    assert.deepEqual(post.teacherTags, [])
    assert.deepEqual(post.globalTags, ['平台'])
    assert.deepEqual(post.tags, ['平台'])
  }
})

test('missing teacher-scope migration is explicit service failure rather than empty labels', async () => {
  const pool = { async query() { throw Object.assign(new Error('synthetic schema absent'), { code: 'ER_NO_SUCH_TABLE' }) } } as unknown as mysql.Pool
  await assert.rejects(() => readTeacherNewsTagScopes(pool, { userId: 'student', role: 'student' }, ['post']),
    (error: unknown) => Boolean(error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 503 && 'code' in error && error.code === 'teacher_news_tags_schema_missing'))
})

test('teacher preview uses their server identity instead of student assignments or caller scope', async () => {
  const pool = { async query(sql: string, params: unknown[]) {
    assert.match(sql, /AND t\.user_id=\?/)
    assert.doesNotMatch(sql, /student_teacher_assignments/)
    assert.deepEqual(params, [['post'], 'teacher-user'])
    return [[{ postId: 'post', teacherId: 'teacher-id', teacherName: '老师', tagsJson: '["本人标签"]' }]]
  } } as unknown as mysql.Pool
  const scopes = await readTeacherNewsTagScopes(pool, { userId: 'teacher-user', role: 'teacher' }, ['post', 'post'])
  assert.deepEqual(scopes.get('post')?.[0].tags, ['本人标签'])
})
