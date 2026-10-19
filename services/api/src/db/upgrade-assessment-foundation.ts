import mysql from 'mysql2/promise'
import 'dotenv/config'
import { inspectAssessmentSchema, validateAssessmentSchemaSnapshot } from './assessment-schema-contract.js'

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

if (await tableExists('assessments')) {
  console.log('✓ assessments already exists')
} else {
  const createSql = `CREATE TABLE IF NOT EXISTS \`assessments\` (
    \`id\` varchar(36) NOT NULL,
    \`user_id\` varchar(36) NOT NULL,
    \`status\` enum('draft','running','succeeded','failed') NOT NULL DEFAULT 'draft',
    \`input_schema_version\` varchar(64) NOT NULL,
    \`output_schema_version\` varchar(64) NOT NULL,
    \`agent_version\` varchar(64) NOT NULL,
    \`provider\` varchar(80) NULL,
    \`model\` varchar(160) NULL,
    \`knowledge_version\` varchar(120) NULL,
    \`input_json\` json NOT NULL,
    \`evidence_json\` json NULL,
    \`output_json\` json NULL,
    \`failure_code\` varchar(120) NULL,
    \`credit_consumed\` boolean NOT NULL DEFAULT false,
    \`started_at\` timestamp NULL,
    \`completed_at\` timestamp NULL,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    KEY \`assessments_user_id_idx\` (\`user_id\`),
    KEY \`assessments_status_idx\` (\`status\`),
    CONSTRAINT \`assessments_user_id_users_id_fk\`
      FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)
  ) ENGINE=InnoDB`

  try {
    await execute(createSql)
  } catch (error) {
    if (!(await tableExists('assessments'))) throw error
    console.log('✓ assessments created (confirmed after reconnect)')
  }

  if (await tableExists('assessments')) {
    console.log('✓ assessments created')
  }
}

const verification = await withFreshConnection(async (connection) => inspectAssessmentSchema(connection))
const issues = validateAssessmentSchemaSnapshot(verification)

if (issues.length > 0) {
  throw new Error('assessment_schema_contract_failed:' + issues.join('|'))
}

console.log('✓ assessment foundation schema is ready and contract-verified')
