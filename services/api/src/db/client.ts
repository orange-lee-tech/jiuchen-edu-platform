import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import type { AppEnv } from '../config/env.js'
import * as schema from './schema.js'

export type DatabaseContext = ReturnType<typeof createDatabaseContext>

export function createDatabaseContext(env: AppEnv) {
  if (!env.DATABASE_URL) {
    return {
      configured: false as const,
      pool: null,
      db: null,
    }
  }

  const pool = mysql.createPool({
    uri: env.DATABASE_URL,
    connectionLimit: 5,
    enableKeepAlive: true,
  })

  const db = drizzle(pool, { schema, mode: 'default' })

  return {
    configured: true as const,
    pool,
    db,
  }
}
