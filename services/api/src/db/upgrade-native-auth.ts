import mysql from 'mysql2/promise'
import 'dotenv/config'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')
const connectionUri: string = databaseUrl

const MAX_ATTEMPTS = 5
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

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let connection: mysql.Connection | null = null

    try {
      connection = await mysql.createConnection(connectionUri)
      return await operation(connection)
    } catch (error) {
      lastError = error
      const code = errorCode(error)

      if (!RETRYABLE_CODES.has(code) || attempt === MAX_ATTEMPTS) {
        throw error
      }

      console.warn(
        `! database connection reset (${code}), retrying ${attempt}/${MAX_ATTEMPTS - 1}`,
      )
      await wait(300 * attempt)
    } finally {
      if (connection) {
        try {
          await connection.end()
        } catch {
          // Remote side may already have reset the socket.
        }
      }
    }
  }

  throw lastError
}

async function queryRows(
  sql: string,
  values: unknown[] = [],
): Promise<mysql.RowDataPacket[]> {
  return withFreshConnection(async (connection) => {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(sql, values)
    return rows
  })
}

async function execute(sql: string) {
  await withFreshConnection(async (connection) => {
    await connection.query(sql)
  })
}

async function columnExists(table: string, column: string) {
  const rows = await queryRows(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
      LIMIT 1`,
    [table, column],
  )
  return rows.length > 0
}

async function indexExists(table: string, index: string) {
  const rows = await queryRows(
    `SELECT 1 FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
      LIMIT 1`,
    [table, index],
  )
  return rows.length > 0
}

async function ensureColumn(
  table: string,
  column: string,
  alterSql: string,
) {
  if (await columnExists(table, column)) {
    console.log(`✓ ${table}.${column} already exists`)
    return
  }

  try {
    await execute(alterSql)
  } catch (error) {
    if (await columnExists(table, column)) {
      console.log(`✓ ${table}.${column} added (confirmed after reconnect)`)
      return
    }
    throw error
  }

  console.log(`✓ ${table}.${column} added`)
}

async function ensureIndex(
  table: string,
  index: string,
  alterSql: string,
) {
  if (await indexExists(table, index)) {
    console.log(`✓ ${index} already exists`)
    return
  }

  try {
    await execute(alterSql)
  } catch (error) {
    if (await indexExists(table, index)) {
      console.log(`✓ ${index} added (confirmed after reconnect)`)
      return
    }
    throw error
  }

  console.log(`✓ ${index} added`)
}

await queryRows('SELECT 1')
console.log('✓ database connection ok')

await ensureColumn(
  'users',
  'phone_number',
  'ALTER TABLE `users` ADD COLUMN `phone_number` varchar(32) NULL AFTER `wechat_open_id`',
)

await ensureColumn(
  'users',
  'phone_country_code',
  'ALTER TABLE `users` ADD COLUMN `phone_country_code` varchar(8) NULL AFTER `phone_number`',
)

await ensureIndex(
  'users',
  'users_phone_number_unique',
  'ALTER TABLE `users` ADD UNIQUE KEY `users_phone_number_unique` (`phone_number`)',
)

console.log('✓ native auth schema is ready')
