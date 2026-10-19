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

const NEWS_TEXT_COLUMNS = [
  'source_key',
  'title',
  'summary',
  'cover_url',
  'article_url',
]

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

async function readNewsCharsetState() {
  return withFreshConnection(async (connection) => {
    const [tableRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT table_collation AS tableCollation
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'news_posts'
        LIMIT 1`,
    )

    const [columnRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT
          column_name AS columnName,
          character_set_name AS characterSetName
         FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'news_posts'
          AND column_name IN (
            'source_key',
            'title',
            'summary',
            'cover_url',
            'article_url'
          )
        ORDER BY ordinal_position`,
    )

    return {
      tableCollation: tableRows[0]?.tableCollation
        ? String(tableRows[0].tableCollation)
        : null,
      columns: columnRows.map((row) => ({
        columnName: String(row.columnName ?? ''),
        characterSetName: row.characterSetName
          ? String(row.characterSetName)
          : null,
      })),
    }
  })
}

function newsCharsetReady(state: Awaited<ReturnType<typeof readNewsCharsetState>>) {
  if (!state.tableCollation?.toLowerCase().startsWith('utf8mb4_')) return false

  return NEWS_TEXT_COLUMNS.every((name) => {
    const column = state.columns.find((item) => item.columnName === name)
    return column?.characterSetName?.toLowerCase() === 'utf8mb4'
  })
}

async function ensureNewsUtf8mb4() {
  const before = await readNewsCharsetState()
  if (newsCharsetReady(before)) {
    console.log('✓ news_posts utf8mb4 charset already ready')
    return
  }

  await withFreshConnection(async (connection) => {
    await connection.query(
      'ALTER TABLE `news_posts` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
    )
  })

  const after = await readNewsCharsetState()
  if (!newsCharsetReady(after)) {
    throw new Error('news_posts_utf8mb4_not_applied')
  }

  console.log('✓ news_posts converted to utf8mb4_unicode_ci')
}

await ensureColumn(
  'content_json',
  'ALTER TABLE `news_posts` ADD COLUMN `content_json` JSON NULL AFTER `article_url`',
)

await ensureColumn(
  'tags_json',
  'ALTER TABLE `news_posts` ADD COLUMN `tags_json` JSON NULL AFTER `content_json`',
)

await withFreshConnection(async (connection) => {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT column_name AS columnName, data_type AS dataType
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'news_posts'
        AND column_name IN ('summary','cover_url','article_url')`,
  )

  const types = new Map(
    rows.map((row) => [
      String(row.columnName ?? ''),
      String(row.dataType ?? '').toLowerCase(),
    ]),
  )

  if (
    types.get('summary') !== 'text' ||
    types.get('cover_url') !== 'text' ||
    types.get('article_url') !== 'text'
  ) {
    await connection.query(
      'ALTER TABLE `news_posts` MODIFY COLUMN `summary` TEXT NULL, MODIFY COLUMN `cover_url` TEXT NULL, MODIFY COLUMN `article_url` TEXT NULL',
    )
    console.log('✓ news_posts summary / URLs widened to TEXT')
  } else {
    console.log('✓ news_posts long text columns already ready')
  }
})

await ensureNewsUtf8mb4()

console.log('✓ news experience schema is ready')
