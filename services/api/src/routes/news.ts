import type { FastifyInstance } from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import {
  getActiveNewsPost,
  listActiveNewsPosts,
} from '../services/news.js'

import { resolveSessionUser } from '../services/session.js'

export function registerNewsRoutes(
  app: FastifyInstance,
  database: DatabaseContext,
) {
  app.get('/news', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const user=await resolveSessionUser(request,database)
    const reviewer=Boolean(user&&['admin','teacher','staff'].includes(user.role))
    const posts = await listActiveNewsPosts(database, 50, reviewer)

    return {
      ok: true,
      posts: posts.map((post) => ({
        ...post,
        publishedAt: post.publishedAt?.toISOString() ?? null,
      })),
    }
  })

  app.get<{ Params: { id: string } }>('/news/:id', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const user=await resolveSessionUser(request,database)
    const reviewer=Boolean(user&&['admin','teacher','staff'].includes(user.role))
    const post = await getActiveNewsPost(database, request.params.id, reviewer)
    if (!post) {
      return reply.code(404).send({
        ok: false,
        error: 'news_post_not_found',
      })
    }

    return {
      ok: true,
      post: {
        ...post,
        publishedAt: post.publishedAt?.toISOString() ?? null,
      },
    }
  })
}
