import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import type { AppEnv } from '../config/env.js'
import * as schema from './schema.js'

export type DatabaseContext = ReturnType<typeof createDatabaseContext>

function hasSplitDatabaseConfig(env: AppEnv) {
  return Boolean(env.DB_HOST && env.DB_USER && env.DB_PASSWORD && env.DB_NAME)
}

export function createDatabaseContext(env: AppEnv) {
  if (!env.DATABASE_URL && !hasSplitDatabaseConfig(env)) {
    return {
      configured: false as const,
      pool: null,
      db: null,
    }
  }

  const common = {
    connectionLimit: 5,
    connectTimeout: 3000,
    enableKeepAlive: true,
  }

  const pool = env.DATABASE_URL
    ? mysql.createPool({
        uri: env.DATABASE_URL,
        ...common,
      })
    : mysql.createPool({
        host: env.DB_HOST!,
        port: env.DB_PORT ?? 3306,
        user: env.DB_USER!,
        password: env.DB_PASSWORD!,
        database: env.DB_NAME!,
        ...common,
      })

  const db = drizzle(pool, { schema, mode: 'default' })

  return {
    configured: true as const,
    pool,
    db,
  }
}
