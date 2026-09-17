import Fastify from 'fastify'
import type { AppEnv } from './config/env.js'
import { createDatabaseContext } from './db/client.js'

export function buildApp(env: AppEnv) {
  const app = Fastify({
    logger: true,
  })

  const database = createDatabaseContext(env)

  app.get('/health', async (_request, reply) => {
    if (!database.configured) {
      return {
        ok: true,
        service: 'jiuchen-api',
        environment: env.NODE_ENV,
        dependencies: {
          database: 'not_configured',
        },
      }
    }

    try {
      await database.pool.query('SELECT 1')
      return {
        ok: true,
        service: 'jiuchen-api',
        environment: env.NODE_ENV,
        dependencies: {
          database: 'ok',
        },
      }
    } catch (error) {
      app.log.error(error)
      return reply.code(503).send({
        ok: false,
        service: 'jiuchen-api',
        environment: env.NODE_ENV,
        dependencies: {
          database: 'error',
        },
      })
    }
  })

  app.addHook('onClose', async () => {
    if (database.configured) {
      await database.pool.end()
    }
  })

  return app
}
