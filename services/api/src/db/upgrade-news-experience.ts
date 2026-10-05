import mysql from 'mysql2/promise'
import 'dotenv/config'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')
const connectionUri: string = databaseUrl

const RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'PROTOCOL_CONNECTION_LOST',
])

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : ''
}

async function withFreshConnection<T>(
  operation: (connection: mysql.Connection) => Promise<T>,
): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    let connection: mysql.Connection | null = null

    try {
      connection = await mysql.createConnection(connectionUri)
      return await operation(connection)
    } catch (error) {
      lastError = error
      if (!RETRYABLE_CODES.has(errorCode(error)) || attempt === 5) throw error
      await wait(300 * attempt)
    } finally {
      if (connection) {
        try {
          await connection.end()
        } catch {
          // remote side may already have reset the socket
        }
      }
    }
  }

  throw lastError
}

async function columnExists(column: string) {
  return withFreshConnection(async (connection) => {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT 1
         FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'news_posts'
          AND column_name = ?
        LIMIT 1`,
      [column],
    )
    return rows.length > 0
  })
}

async function ensureColumn(
  column: string,
  sql: string,
) {
  if (await columnExists(column)) {
    console.log(`✓ news_posts.${column} already exists`)
    return
  }

  await withFreshConnection(async (connection) => {
    await connection.query(sql)
  })

  if (!(await columnExists(column))) {
    throw new Error(`news_posts.${column}_not_created`)
  }

  console.log(`✓ news_posts.${column} added`)
}

await ensureColumn(
  'content_json',
  'ALTER TABLE `news_posts` ADD COLUMN `content_json` JSON NULL AFTER `article_url`',
)

await ensureColumn(
  'tags_json',
  'ALTER TABLE `news_posts` ADD COLUMN `tags_json` JSON NULL AFTER `content_json`',
)

console.log('✓ news experience schema is ready')
