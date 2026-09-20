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

async function tableExists(table: string) {
  return withFreshConnection(async (connection) => {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ?
       LIMIT 1`,
      [table],
    )
    return rows.length > 0
  })
}

async function execute(sql: string) {
  await withFreshConnection(async (connection) => {
    await connection.query(sql)
  })
}

if (await tableExists('coaching_records')) {
  console.log('✓ coaching_records already exists')
} else {
  const createSql = `CREATE TABLE IF NOT EXISTS \`coaching_records\` (
    \`id\` varchar(36) NOT NULL,
    \`student_id\` varchar(36) NOT NULL,
    \`teacher_id\` varchar(36) NULL,
    \`stage_code\` varchar(32) NOT NULL,
    \`title\` varchar(160) NOT NULL,
    \`content\` varchar(2000) NOT NULL,
    \`occurred_at\` timestamp NOT NULL,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    KEY \`coaching_records_student_stage_idx\` (\`student_id\`, \`stage_code\`),
    KEY \`coaching_records_teacher_idx\` (\`teacher_id\`),
    CONSTRAINT \`coaching_records_student_id_students_id_fk\`
      FOREIGN KEY (\`student_id\`) REFERENCES \`students\` (\`id\`),
    CONSTRAINT \`coaching_records_teacher_id_teachers_id_fk\`
      FOREIGN KEY (\`teacher_id\`) REFERENCES \`teachers\` (\`id\`)
  ) ENGINE=InnoDB`

  try {
    await execute(createSql)
  } catch (error) {
    if (!(await tableExists('coaching_records'))) throw error
    console.log('✓ coaching_records created (confirmed after reconnect)')
  }

  if (await tableExists('coaching_records')) {
    console.log('✓ coaching_records created')
  }
}

console.log('✓ classroom guidance schema is ready')
