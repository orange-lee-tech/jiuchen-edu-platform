import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type mysql from 'mysql2/promise'
import { z } from 'zod'
import type { DatabaseContext } from '../db/client.js'
import { resolveSessionUser } from '../services/session.js'
import { parseStoredNewsTags, teacherNewsTagStorage } from '../services/teacher-news-tags.js'

const tagsInput = z.object({ tags: z.array(z.string().trim().min(1).max(40)).max(8) }).strict()
const postIdInput = z.string().uuid()

export function registerTeacherNewsTagRoutes(app: FastifyInstance, database: DatabaseContext) {
  async function owner(request: FastifyRequest, reply: FastifyReply) {
    if (!database.configured) { reply.code(503).send({ ok: false, error: 'database_not_configured' }); return null }
    const user = await resolveSessionUser(request, database)
    if (!user) { reply.code(401).send({ ok: false, error: 'unauthorized' }); return null }
    if (user.role !== 'teacher' || ('readOnly' in user && user.readOnly)) {
      reply.code(403).send({ ok: false, error: 'teacher_news_tags_forbidden' }); return null
    }
    const [teachers] = await database.pool.query<mysql.RowDataPacket[]>(
      "SELECT id FROM teachers WHERE user_id=? AND status='active' LIMIT 1", [user.userId])
    if (!teachers[0]) { reply.code(403).send({ ok: false, error: 'teacher_profile_not_bound' }); return null }
    return { teacherId: String(teachers[0].id), userId: user.userId }
  }

  app.get('/me/teacher/news', async (request, reply) => {
    const teacher = await owner(request, reply)
    if (!teacher || !database.configured) return
    const [rows] = await teacherNewsTagStorage(() => database.pool.query<mysql.RowDataPacket[]>(
      `SELECT n.id,n.title,n.tags_json AS globalTags,nt.tags_json AS teacherTags,nt.updated_at AS updatedAt
       FROM news_posts n LEFT JOIN teacher_news_tags nt ON nt.post_id=n.id AND nt.teacher_id=?
       WHERE n.status='active' ORDER BY n.created_at DESC,n.id LIMIT 200`, [teacher.teacherId]))
    return { ok: true, posts: rows.map(row => ({ id: String(row.id), title: String(row.title),
      globalTags: parseStoredNewsTags(row.globalTags), teacherTags: parseStoredNewsTags(row.teacherTags),
      updatedAt: row.updatedAt ?? null })) }
  })

  app.get<{ Params: { id: string } }>('/me/teacher/news/:id/tags', async (request, reply) => {
    const teacher = await owner(request, reply)
    if (!teacher || !database.configured) return
    if (!postIdInput.safeParse(request.params.id).success)
      return reply.code(400).send({ ok: false, error: 'invalid_news_id' })
    const [rows] = await teacherNewsTagStorage(() => database.pool.query<mysql.RowDataPacket[]>(
      `SELECT n.id,n.title,n.tags_json AS globalTags,nt.tags_json AS teacherTags,nt.updated_at AS updatedAt
       FROM news_posts n LEFT JOIN teacher_news_tags nt ON nt.post_id=n.id AND nt.teacher_id=?
       WHERE n.id=? AND n.status='active' LIMIT 1`, [teacher.teacherId, request.params.id]))
    if (!rows[0]) return reply.code(404).send({ ok: false, error: 'news_post_not_found' })
    const row = rows[0]
    return { ok: true, post: { id: String(row.id), title: String(row.title),
      globalTags: parseStoredNewsTags(row.globalTags), teacherTags: parseStoredNewsTags(row.teacherTags),
      updatedAt: row.updatedAt ?? null } }
  })

  app.put<{ Params: { id: string }; Body: unknown }>('/me/teacher/news/:id/tags', async (request, reply) => {
    const teacher = await owner(request, reply)
    if (!teacher || !database.configured) return
    const parsed = tagsInput.safeParse(request.body)
    if (!postIdInput.safeParse(request.params.id).success || !parsed.success)
      return reply.code(400).send({ ok: false, error: 'invalid_teacher_news_tags' })
    const tags = [...new Set(parsed.data.tags)]
    const connection = await database.pool.getConnection()
    try {
      await connection.beginTransaction()
      const [active] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT id FROM teachers WHERE id=? AND user_id=? AND status='active' FOR SHARE",
        [teacher.teacherId, teacher.userId])
      if (!active.length) { await connection.rollback(); return reply.code(403).send({ ok: false, error: 'teacher_profile_not_bound' }) }
      const [posts] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT id FROM news_posts WHERE id=? AND status='active' FOR SHARE", [request.params.id])
      if (!posts.length) { await connection.rollback(); return reply.code(404).send({ ok: false, error: 'news_post_not_found' }) }
      if (tags.length) {
        await teacherNewsTagStorage(() => connection.query(`INSERT INTO teacher_news_tags(post_id,teacher_id,tags_json) VALUES(?,?,?)
          ON DUPLICATE KEY UPDATE tags_json=VALUES(tags_json),updated_at=CURRENT_TIMESTAMP`,
          [request.params.id, teacher.teacherId, JSON.stringify(tags)]))
      } else {
        await teacherNewsTagStorage(() => connection.query('DELETE FROM teacher_news_tags WHERE post_id=? AND teacher_id=?',
          [request.params.id, teacher.teacherId]))
      }
      await connection.commit()
      return { ok: true, teacherTags: tags }
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  })
}
