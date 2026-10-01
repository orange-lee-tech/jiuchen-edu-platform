import Fastify from 'fastify'
import type { AppEnv } from './config/env.js'
import { createDatabaseContext } from './db/client.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerAdminRoutes } from './routes/admin.js'
import { registerStudentRoutes } from './routes/students.js'
import { registerProfileRoutes } from './routes/profile.js'
import { registerTeacherRoutes } from './routes/teacher.js'
import { registerIdentityRoutes } from './routes/identity.js'
import { registerMobileAdminRoutes } from './routes/mobile-admin.js'
import { registerNewsRoutes } from './routes/news.js'
import { registerAssessmentRoutes } from './routes/assessments.js'
import { registerProductRoutes } from './routes/products.js'
import { registerBrandRoutes } from './routes/brand.js'
import { registerClassroomWorkspaceRoutes } from './routes/classroom-workspace.js'
import {
  createCustomerServiceAIProvider,
  createScheduleAIProvider,
} from './services/ai-provider.js'
import { createAssessmentRuntimeFromEnv } from './services/assessment-runtime.js'

const API_RELEASE = '0.3.0-experience'

export function buildApp(env: AppEnv) {
  const app = Fastify({
    logger: true,
  })

  const database = createDatabaseContext(env)
  const assessmentRuntime = createAssessmentRuntimeFromEnv(env)
  const scheduleAI = createScheduleAIProvider(env)
  const customerAI = createCustomerServiceAIProvider(env)
  const cloudbaseCamConfigured = Boolean(
    env.TENCENTCLOUD_SECRETID && env.TENCENTCLOUD_SECRETKEY,
  )
  const cloudbaseExternalConfigured = Boolean(
    env.CLOUDBASE_ENV_ID &&
      (env.CLOUDBASE_APIKEY || cloudbaseCamConfigured),
  )

  app.get('/health/live', async () => ({
    ok: true,
    service: 'jiuchen-api',
    environment: env.NODE_ENV,
    release: API_RELEASE,
  }))

  app.get('/health/config', async () => ({
    ok: true,
    service: 'jiuchen-api',
    environment: env.NODE_ENV,
    release: API_RELEASE,
    config: {
      databaseUrlConfigured: Boolean(env.DATABASE_URL),
      splitDatabaseConfigComplete: Boolean(
        env.DB_HOST && env.DB_USER && env.DB_PASSWORD && env.DB_NAME,
      ),
      wechatAppIdConfigured: Boolean(env.WECHAT_APP_ID),
      wechatAppSecretConfigured: Boolean(env.WECHAT_APP_SECRET),
      officialAccountConfigured: Boolean(env.WECHAT_OA_APP_ID && env.WECHAT_OA_APP_SECRET),
      cloudbaseCamConfigured,
      cloudbaseExternalConfigured,
      assessmentAiConfigured: assessmentRuntime.provider.isConfigured(),
      scheduleAiConfigured: scheduleAI.isConfigured(),
      customerAiConfigured: customerAI.isConfigured(),
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
      const requiredTables = [
        'users',
        'user_profiles',
        'user_sessions',
        'user_agreements',
        'internal_ids',
        'news_posts',
        'students',
        'teachers',
        'student_teacher_assignments',
        'student_plans',
        'plan_items',
        'plan_revisions',
        'schedule_imports',
      ]

      for (const table of requiredTables) {
        await database.pool.query('SELECT 1 FROM ' + String.fromCharCode(96) + table + String.fromCharCode(96) + ' LIMIT 1')
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

      const diagnostic =
        error && typeof error === 'object'
          ? {
              code: 'code' in error ? String(error.code) : undefined,
              errno:
                'errno' in error && typeof error.errno === 'number'
                  ? error.errno
                  : undefined,
              sqlState:
                'sqlState' in error && typeof error.sqlState === 'string'
                  ? error.sqlState
                  : undefined,
              syscall:
                'syscall' in error && typeof error.syscall === 'string'
                  ? error.syscall
                  : undefined,
            }
          : {}

      return reply.code(503).send({
        ok: false,
        service: 'jiuchen-api',
        environment: env.NODE_ENV,
        dependencies: {
          database: 'error',
          databaseDiagnostic: diagnostic,
        },
      })
    }
  })

  registerAuthRoutes(app, database, env)
  registerStudentRoutes(app, database)
  registerProfileRoutes(app, database)
  registerIdentityRoutes(app, database)
  registerTeacherRoutes(app, database)
  registerMobileAdminRoutes(app, database, env)
  registerNewsRoutes(app, database)
  registerAssessmentRoutes(app, database, assessmentRuntime)
  registerProductRoutes(app, database)
  registerBrandRoutes(app)
  registerClassroomWorkspaceRoutes(app, database, env)
  registerAdminRoutes(app, database, env)

  app.addHook('onClose', async () => {
    if (database.configured) {
      await database.pool.end()
    }
  })

  return app
}
