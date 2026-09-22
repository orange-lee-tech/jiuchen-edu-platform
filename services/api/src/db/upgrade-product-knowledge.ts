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

async function tableExists(table: string) {
  const rows = await queryRows(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?
      LIMIT 1`,
    [table],
  )
  return rows.length > 0
}

await queryRows('SELECT 1')
console.log('✓ database connection ok')

if (await tableExists('product_knowledge_documents')) {
  console.log('✓ product_knowledge_documents already exists')
} else {
  await execute(
    `CREATE TABLE IF NOT EXISTS \`product_knowledge_documents\` (
      \`id\` varchar(36) NOT NULL,
      \`document_key\` varchar(160) NOT NULL,
      \`title\` varchar(255) NOT NULL,
      \`product_name\` varchar(255) NOT NULL,
      \`source_file\` varchar(255) NOT NULL,
      \`source_date\` varchar(40) NULL,
      \`conversion_version\` varchar(64) NOT NULL,
      \`status\` enum('draft','active','archived') NOT NULL DEFAULT 'draft',
      \`content_json\` json NOT NULL,
      \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`product_knowledge_documents_document_key_unique\` (\`document_key\`)
    ) ENGINE=InnoDB`,
  )
  console.log('✓ product_knowledge_documents created')
}

if (await tableExists('product_knowledge_chunks')) {
  console.log('✓ product_knowledge_chunks already exists')
} else {
  await execute(
    `CREATE TABLE IF NOT EXISTS \`product_knowledge_chunks\` (
      \`id\` varchar(36) NOT NULL,
      \`document_id\` varchar(36) NOT NULL,
      \`chunk_key\` varchar(220) NOT NULL,
      \`kind\` enum(
        'product',
        'audience',
        'highlight',
        'timeline',
        'module',
        'core_service',
        'teacher',
        'marketing_claim',
        'contact',
        'other'
      ) NOT NULL,
      \`title\` varchar(255) NOT NULL,
      \`text\` varchar(4000) NOT NULL,
      \`source_page\` int NULL,
      \`retrieval_allowed\` boolean NOT NULL DEFAULT true,
      \`assessment_evidence_allowed\` boolean NOT NULL DEFAULT false,
      \`display_allowed\` boolean NOT NULL DEFAULT true,
      \`metadata_json\` json NULL,
      \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`product_knowledge_chunks_chunk_key_unique\` (\`chunk_key\`),
      KEY \`product_knowledge_chunks_document_id_idx\` (\`document_id\`),
      CONSTRAINT \`product_knowledge_chunks_document_id_documents_id_fk\`
        FOREIGN KEY (\`document_id\`) REFERENCES \`product_knowledge_documents\` (\`id\`)
        ON DELETE CASCADE
    ) ENGINE=InnoDB`,
  )
  console.log('✓ product_knowledge_chunks created')
}

console.log('✓ product knowledge schema is ready')
