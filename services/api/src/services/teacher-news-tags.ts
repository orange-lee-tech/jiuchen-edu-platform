import type mysql from 'mysql2/promise'
import { normalizeNewsTags } from './news.js'

export type TeacherNewsTagScope = { teacherId: string; teacherName: string; tags: string[] }
export type NewsTagViewer = { userId: string; role: string } | null

export async function teacherNewsTagStorage<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation() }
  catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') {
      throw Object.assign(new Error('teacher_news_tags_schema_missing'), { statusCode: 503, code: 'teacher_news_tags_schema_missing' })
    }
    throw error
  }
}

export function parseStoredNewsTags(value: unknown): string[] {
  if (typeof value === 'string') {
    try { return normalizeNewsTags(JSON.parse(value)) } catch { return [] }
  }
  return normalizeNewsTags(value)
}

/** Labels are editorial metadata. They never change article publication rights. */
export async function readTeacherNewsTagScopes(
  pool: mysql.Pool, viewer: NewsTagViewer, postIds: string[],
): Promise<Map<string, TeacherNewsTagScope[]>> {
  const result = new Map<string, TeacherNewsTagScope[]>()
  const ids = [...new Set(postIds)]
  if (!viewer || !ids.length || !['student', 'teacher'].includes(viewer.role)) return result
  // A current assignment row is the existing relationship authority; both
  // primary and support teachers participate. Removing it immediately revokes
  // label visibility, without copying labels into a student/global JSON field.
  const scope = viewer.role === 'teacher'
    ? 't.user_id=?'
    : `EXISTS (SELECT 1 FROM students s
         INNER JOIN student_teacher_assignments a ON a.student_id=s.id
         WHERE s.user_id=? AND a.teacher_id=nt.teacher_id)`
  const [rows] = await teacherNewsTagStorage(() => pool.query<mysql.RowDataPacket[]>(
    `SELECT nt.post_id AS postId,nt.teacher_id AS teacherId,t.name AS teacherName,nt.tags_json AS tagsJson
       FROM teacher_news_tags nt INNER JOIN teachers t ON t.id=nt.teacher_id AND t.status='active'
       INNER JOIN users teacher_account ON teacher_account.id=t.user_id AND teacher_account.status='active'
       WHERE nt.post_id IN (?) AND ${scope} ORDER BY nt.teacher_id`, [ids, viewer.userId]))
  for (const row of rows) {
    const tags = parseStoredNewsTags(row.tagsJson)
    if (!tags.length) continue
    const id = String(row.postId)
    const scopes = result.get(id) ?? []
    scopes.push({ teacherId: String(row.teacherId), teacherName: String(row.teacherName), tags })
    result.set(id, scopes)
  }
  return result
}

export async function withNewsTagScopes<T extends { id: string; tags: string[] }>(
  pool: mysql.Pool, viewer: NewsTagViewer, posts: T[],
) {
  const scopes = await readTeacherNewsTagScopes(pool, viewer, posts.map(post => post.id))
  return posts.map(post => {
    const globalTags = parseStoredNewsTags(post.tags)
    const teacherTags = scopes.get(post.id) ?? []
    return { ...post, globalTags, teacherTags,
      tags: [...new Set([...globalTags, ...teacherTags.flatMap(scope => scope.tags)])] }
  })
}
