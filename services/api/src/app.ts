import Fastify from 'fastify'
import type { AppEnv } from './config/env.js'
import { createDatabaseContext } from './db/client.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerStudentRoutes } from './routes/students.js'

export function buildApp(env: AppEnv) {
  const app = Fastify({
    logger: true,
  })

  const database = createDatabaseContext(env)

  app.get('/health/live', async () => ({
    ok: true,
    service: 'jiuchen-api',
    environment: env.NODE_ENV,
  }))

  app.get('/health/config', async () => ({
    ok: true,
    service: 'jiuchen-api',
    environment: env.NODE_ENV,
    config: {
      databaseUrlConfigured: Boolean(env.DATABASE_URL),
      wechatAppIdConfigured: Boolean(env.WECHAT_APP_ID),
      wechatAppSecretConfigured: Boolean(env.WECHAT_APP_SECRET),
    },
  }))

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
      const requiredTables = ['users', 'students', 'student_plans', 'plan_items']

      for (const table of requiredTables) {
        await database.pool.query(`SELECT 1 FROM \`${table}\` LIMIT 1`)
      }

      return {
        ok: true,
        service: 'jiuchen-api',
        environment: env.NODE_ENV,
        dependencies: {
          database: 'ok',
        },
      }
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : undefined

      if (code === 'ER_NO_SUCH_TABLE') {
        return reply.code(503).send({
          ok: false,
          service: 'jiuchen-api',
          environment: env.NODE_ENV,
          dependencies: {
            database: 'schema_missing',
          },
        })
      }

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

  registerAuthRoutes(app, database, env)
  registerStudentRoutes(app, database)

  app.addHook('onClose', async () => {
    if (database.configured) {
      await database.pool.end()
    }
  })

  return app
}
