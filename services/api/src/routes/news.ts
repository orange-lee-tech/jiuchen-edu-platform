import type { FastifyInstance } from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import { listActiveNewsPosts } from '../services/news.js'

export function registerNewsRoutes(
  app: FastifyInstance,
  database: DatabaseContext,
) {
  app.get('/news', async (_request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const posts = await listActiveNewsPosts(database, 50)

    return {
      ok: true,
      posts: posts.map((post) => ({
        ...post,
        publishedAt: post.publishedAt?.toISOString() ?? null,
      })),
    }
  })
}
