import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AppEnv } from '../config/env.js'
import type { DatabaseContext } from '../db/client.js'
import {
  internalIds,
  newsPosts,
  studentTeacherAssignments,
  students,
  teachers,
  users,
} from '../db/schema.js'
import { canAccessAdminWorkspace } from '../domain/auth-policy.js'
import {
  bindInternalIdentity,
  createInternalIdentity,
  unbindInternalIdentity,
} from '../services/internal-identities.js'
import { fetchLatestOfficialAccountPosts } from '../services/official-account.js'
import { resolveSessionUser } from '../services/session.js'

const createIdSchema = z.object({
  type: z.enum(['student', 'teacher', 'admin']),
  name: z.string().trim().max(80).nullable().optional(),
})

const bindSchema = z.object({
  userId: z.string().uuid(),
})

const assignmentSchema = z.object({
  studentId: z.string().uuid(),
  teacherId: z.string().uuid(),
  stageCode: z.string().trim().max(32).nullable().optional(),
  relationship: z.enum(['primary', 'support']).default('primary'),
})

async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  database: DatabaseContext,
) {
  if (!database.configured) {
    reply.code(503).send({
      ok: false,
      error: 'database_not_configured',
    })
    return null
  }

  const user = await resolveSessionUser(request, database)
  if (!user) {
    reply.code(401).send({
      ok: false,
      error: 'unauthorized',
    })
    return null
  }

  if (!canAccessAdminWorkspace(user.role)) {
    reply.code(403).send({
      ok: false,
      error: 'admin_forbidden',
    })
    return null
  }

  return user
}

export function registerMobileAdminRoutes(
  app: FastifyInstance,
  database: DatabaseContext,
  env: AppEnv,
) {
  app.get('/me/admin/internal-ids', async (request, reply) => {
    if (!(await requireAdmin(request, reply, database))) return

    const rows = await database.db
      .select({
        id: internalIds.id,
        businessId: internalIds.businessId,
        type: internalIds.type,
        claimMode: internalIds.claimMode,
        status: internalIds.status,
        userId: internalIds.userId,
        entityId: internalIds.entityId,
        batch: internalIds.batch,
        claimedAt: internalIds.claimedAt,
      })
      .from(internalIds)
      .orderBy(asc(internalIds.createdAt))

    return {
      ok: true,
      internalIds: rows,
    }
  })

  app.post<{ Body: unknown }>('/me/admin/internal-ids', async (request, reply) => {
    if (!(await requireAdmin(request, reply, database))) return

    const parsed = createIdSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_internal_id_payload',
      })
    }

    const identity = await createInternalIdentity(database, {
      type: parsed.data.type,
      name: parsed.data.name ?? null,
    })

    return {
      ok: true,
      identity,
    }
  })

  app.post<{
    Params: { id: string }
    Body: unknown
  }>('/me/admin/internal-ids/:id/bind', async (request, reply) => {
    if (!(await requireAdmin(request, reply, database))) return

    const parsed = bindSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_bind_payload',
      })
    }

    try {
      const identity = await bindInternalIdentity(
        database,
        request.params.id,
        parsed.data.userId,
      )

      return {
        ok: true,
        identity,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'bind_failed'
      return reply.code(409).send({
        ok: false,
        error: message,
      })
    }
  })

  app.post<{ Params: { id: string } }>(
    '/me/admin/internal-ids/:id/unbind',
    async (request, reply) => {
      if (!(await requireAdmin(request, reply, database))) return

      try {
        await unbindInternalIdentity(database, request.params.id)
        return { ok: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unbind_failed'
        return reply.code(409).send({
          ok: false,
          error: message,
        })
      }
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/me/admin/internal-ids/:id',
    async (request, reply) => {
      if (!(await requireAdmin(request, reply, database))) return

      const [identity] = await database.db
        .select({
          status: internalIds.status,
          userId: internalIds.userId,
          entityId: internalIds.entityId,
          type: internalIds.type,
        })
        .from(internalIds)
        .where(eq(internalIds.id, request.params.id))
        .limit(1)

      if (!identity) {
        return reply.code(404).send({
          ok: false,
          error: 'internal_id_not_found',
        })
      }

      if (identity.status === 'claimed' || identity.userId) {
        return reply.code(409).send({
          ok: false,
          error: 'claimed_internal_id_must_unbind_first',
        })
      }

      await database.db.transaction(async (tx) => {
        await tx.delete(internalIds).where(eq(internalIds.id, request.params.id))

        if (identity.type === 'student' && identity.entityId) {
          await tx.delete(students).where(eq(students.id, identity.entityId))
        } else if (identity.type === 'teacher' && identity.entityId) {
          await tx.delete(teachers).where(eq(teachers.id, identity.entityId))
        }
      })

      return { ok: true }
    },
  )

  app.get('/me/admin/users', async (request, reply) => {
    if (!(await requireAdmin(request, reply, database))) return

    const rows = await database.db
      .select({
        id: users.id,
        role: users.role,
        status: users.status,
        displayName: users.displayName,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.createdAt))

    return {
      ok: true,
      users: rows,
    }
  })

  app.get('/me/admin/assignments', async (request, reply) => {
    if (!(await requireAdmin(request, reply, database))) return

    const rows = await database.db
      .select({
        id: studentTeacherAssignments.id,
        studentId: students.id,
        studentName: students.name,
        teacherId: teachers.id,
        teacherName: teachers.name,
        stageCode: studentTeacherAssignments.stageCode,
        relationship: studentTeacherAssignments.relationship,
      })
      .from(studentTeacherAssignments)
      .innerJoin(students, eq(studentTeacherAssignments.studentId, students.id))
      .innerJoin(teachers, eq(studentTeacherAssignments.teacherId, teachers.id))
      .orderBy(asc(studentTeacherAssignments.createdAt))

    return {
      ok: true,
      assignments: rows,
    }
  })

  app.post<{ Body: unknown }>('/me/admin/assignments', async (request, reply) => {
    if (!(await requireAdmin(request, reply, database))) return

    const parsed = assignmentSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: 'invalid_assignment_payload',
      })
    }

    const [student] = await database.db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, parsed.data.studentId))
      .limit(1)

    const [teacher] = await database.db
      .select({ id: teachers.id })
      .from(teachers)
      .where(eq(teachers.id, parsed.data.teacherId))
      .limit(1)

    if (!student || !teacher) {
      return reply.code(404).send({
        ok: false,
        error: 'student_or_teacher_not_found',
      })
    }

    const id = randomUUID()
    await database.db.insert(studentTeacherAssignments).values({
      id,
      studentId: parsed.data.studentId,
      teacherId: parsed.data.teacherId,
      stageCode: parsed.data.stageCode ?? null,
      relationship: parsed.data.relationship,
    })

    return {
      ok: true,
      assignment: {
        id,
        ...parsed.data,
      },
    }
  })

  app.delete<{ Params: { id: string } }>(
    '/me/admin/assignments/:id',
    async (request, reply) => {
      if (!(await requireAdmin(request, reply, database))) return

      await database.db
        .delete(studentTeacherAssignments)
        .where(eq(studentTeacherAssignments.id, request.params.id))

      return { ok: true }
    },
  )

  app.get('/me/admin/news', async (request, reply) => {
    if (!(await requireAdmin(request, reply, database))) return

    const rows = await database.db
      .select({
        id: newsPosts.id,
        title: newsPosts.title,
        summary: newsPosts.summary,
        coverUrl: newsPosts.coverUrl,
        articleUrl: newsPosts.articleUrl,
        publishedAt: newsPosts.publishedAt,
        source: newsPosts.source,
        status: newsPosts.status,
      })
      .from(newsPosts)
      .orderBy(desc(newsPosts.publishedAt), desc(newsPosts.createdAt))
      .limit(50)

    return {
      ok: true,
      posts: rows,
    }
  })

  app.post('/me/admin/news/sync', async (request, reply) => {
    if (!(await requireAdmin(request, reply, database))) return

    if (!env.WECHAT_OA_APP_ID || !env.WECHAT_OA_APP_SECRET) {
      return reply.code(503).send({
        ok: false,
        error: 'official_account_not_configured',
      })
    }

    try {
      const posts = await fetchLatestOfficialAccountPosts(env)

      for (const post of posts) {
        const [existing] = await database.db
          .select({ id: newsPosts.id })
          .from(newsPosts)
          .where(eq(newsPosts.sourceKey, post.sourceKey))
          .limit(1)

        if (existing) {
          await database.db
            .update(newsPosts)
            .set({
              title: post.title,
              summary: post.summary,
              coverUrl: post.coverUrl,
              articleUrl: post.articleUrl,
              publishedAt: post.publishedAt,
              status: 'active',
            })
            .where(eq(newsPosts.id, existing.id))
        } else {
          await database.db.insert(newsPosts).values({
            id: randomUUID(),
            source: 'wechat_official',
            sourceKey: post.sourceKey,
            title: post.title,
            summary: post.summary,
            coverUrl: post.coverUrl,
            articleUrl: post.articleUrl,
            publishedAt: post.publishedAt,
            status: 'active',
          })
        }
      }

      return {
        ok: true,
        synced: posts.length,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'official_account_sync_failed'
      app.log.warn({ err: error }, 'Official account sync failed')
      return reply.code(502).send({
        ok: false,
        error: message,
      })
    }
  })
}
