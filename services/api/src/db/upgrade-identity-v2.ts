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
          // The remote side may already have reset the socket.
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

async function tableExists(table: string) {
  const rows = await queryRows(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?
      LIMIT 1`,
    [table],
  )
  return rows.length > 0
}

async function ensureColumn(
  table: string,
  column: string,
  alterSql: string,
  successMessage: string,
) {
  if (await columnExists(table, column)) {
    console.log(`✓ ${table}.${column} already exists`)
    return
  }

  try {
    await execute(alterSql)
  } catch (error) {
    // A reset can happen after MySQL committed the ALTER but before the
    // client received the response. Re-check before treating it as failure.
    if (await columnExists(table, column)) {
      console.log(`✓ ${table}.${column} added (confirmed after reconnect)`)
      return
    }
    throw error
  }

  console.log(successMessage)
}

async function ensureTable(
  table: string,
  createSql: string,
  successMessage: string,
) {
  if (await tableExists(table)) {
    console.log(`✓ ${table} already exists`)
    return
  }

  try {
    await execute(createSql)
  } catch (error) {
    if (await tableExists(table)) {
      console.log(`✓ ${table} created (confirmed after reconnect)`)
      return
    }
    throw error
  }

  console.log(successMessage)
}

await queryRows('SELECT 1')
console.log('✓ database connection ok')

await ensureColumn(
  'users',
  'status',
  "ALTER TABLE `users` ADD COLUMN `status` ENUM('active','deleted') NOT NULL DEFAULT 'active' AFTER `role`",
  '✓ users.status added',
)

await ensureColumn(
  'users',
  'deleted_at',
  'ALTER TABLE `users` ADD COLUMN `deleted_at` TIMESTAMP NULL AFTER `display_name`',
  '✓ users.deleted_at added',
)

await ensureTable(
  'internal_ids',
  `CREATE TABLE IF NOT EXISTS \`internal_ids\` (
    \`id\` varchar(36) NOT NULL,
    \`business_id\` varchar(40) NOT NULL,
    \`type\` enum('student','teacher','admin') NOT NULL,
    \`claim_mode\` enum('self','admin') NOT NULL DEFAULT 'self',
    \`status\` enum('available','claimed','disabled') NOT NULL DEFAULT 'available',
    \`user_id\` varchar(36) NULL,
    \`entity_id\` varchar(36) NULL,
    \`batch\` varchar(40) NULL,
    \`claimed_at\` timestamp NULL,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`internal_ids_business_id_unique\` (\`business_id\`),
    UNIQUE KEY \`internal_ids_user_id_unique\` (\`user_id\`),
    KEY \`internal_ids_entity_id_idx\` (\`entity_id\`),
    CONSTRAINT \`internal_ids_user_id_users_id_fk\`
      FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)
  ) ENGINE=InnoDB`,
  '✓ internal_ids created',
)

await ensureTable(
  'news_posts',
  `CREATE TABLE IF NOT EXISTS \`news_posts\` (
    \`id\` varchar(36) NOT NULL,
    \`source\` enum('manual','wechat_official') NOT NULL,
    \`source_key\` varchar(160) NOT NULL,
    \`title\` varchar(255) NOT NULL,
    \`summary\` text NULL,
    \`cover_url\` text NULL,
    \`article_url\` text NULL,
    \`content_json\` json NULL,
    \`tags_json\` json NULL,
    \`published_at\` timestamp NULL,
    \`status\` enum('active','hidden') NOT NULL DEFAULT 'active',
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`news_posts_source_key_unique\` (\`source_key\`)
  ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  '✓ news_posts created',
)

console.log('✓ identity v2 schema is ready')
