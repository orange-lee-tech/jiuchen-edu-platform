import { randomBytes, randomUUID } from 'node:crypto'
import mysql from 'mysql2/promise'
import 'dotenv/config'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const connection = await mysql.createConnection(databaseUrl)
const batch = 'dev-seed-v1'
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

function token(length = 10) {
  const bytes = randomBytes(length)
  let result = ''
  for (let index = 0; index < length; index += 1) {
    result += alphabet[bytes[index] % alphabet.length]
  }
  return result
}

function makeBusinessId(prefix: string) {
  const raw = token(8)
  return `${prefix}-${raw.slice(0, 4)}-${raw.slice(4)}`
}

async function uniqueBusinessId(prefix: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const businessId = makeBusinessId(prefix)
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT 1 FROM internal_ids WHERE business_id = ? LIMIT 1',
      [businessId],
    )
    if (rows.length === 0) return businessId
  }
  throw new Error('Unable to generate unique business id')
}

async function printExisting() {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT business_id, type, status
       FROM internal_ids
      WHERE batch = ?
      ORDER BY type, business_id`,
    [batch],
  )

  if (rows.length === 0) return false

  console.log(`✓ test internal ids already exist (${rows.length})`)
  for (const row of rows) {
    console.log(`${row.type}\t${row.business_id}\t${row.status}`)
  }
  return true
}

try {
  await connection.query('SELECT 1')

  if (await printExisting()) {
    process.exitCode = 0
  } else {
    const created: Array<{ type: string; businessId: string }> = []

    for (let index = 1; index <= 10; index += 1) {
      const studentId = randomUUID()
      const businessId = await uniqueBusinessId('JCS')

      await connection.beginTransaction()
      try {
        await connection.query(
          `INSERT INTO students
            (id, user_id, name, university, major, current_stage)
           VALUES (?, NULL, ?, ?, ?, ?)`,
          [
            studentId,
            `测试学员${String(index).padStart(2, '0')}`,
            '测试大学',
            '测试专业',
            'freshman-fall',
          ],
        )

        await connection.query(
          `INSERT INTO internal_ids
            (id, business_id, type, claim_mode, status, user_id, entity_id, batch)
           VALUES (?, ?, 'student', 'self', 'available', NULL, ?, ?)`,
          [randomUUID(), businessId, studentId, batch],
        )

        await connection.commit()
        created.push({ type: 'student', businessId })
      } catch (error) {
        await connection.rollback()
        throw error
      }
    }

    for (let index = 1; index <= 10; index += 1) {
      const teacherId = randomUUID()
      const businessId = await uniqueBusinessId('JCT')

      await connection.beginTransaction()
      try {
        await connection.query(
          `INSERT INTO teachers
            (id, user_id, name, title, bio, status)
           VALUES (?, NULL, ?, ?, ?, 'active')`,
          [
            teacherId,
            `测试老师${String(index).padStart(2, '0')}`,
            '测试辅导老师',
            '用于内部测试的老师档案',
          ],
        )

        await connection.query(
          `INSERT INTO internal_ids
            (id, business_id, type, claim_mode, status, user_id, entity_id, batch)
           VALUES (?, ?, 'teacher', 'self', 'available', NULL, ?, ?)`,
          [randomUUID(), businessId, teacherId, batch],
        )

        await connection.commit()
        created.push({ type: 'teacher', businessId })
      } catch (error) {
        await connection.rollback()
        throw error
      }
    }

    for (let index = 1; index <= 5; index += 1) {
      const businessId = await uniqueBusinessId('JCA')
      await connection.query(
        `INSERT INTO internal_ids
          (id, business_id, type, claim_mode, status, user_id, entity_id, batch)
         VALUES (?, ?, 'admin', 'admin', 'available', NULL, NULL, ?)`,
        [randomUUID(), businessId, batch],
      )
      created.push({ type: 'admin', businessId })
    }

    console.log('✓ generated 10 student ids, 10 teacher ids and 5 admin ids')
    for (const row of created) {
      console.log(`${row.type}\t${row.businessId}`)
    }
    console.log('注意：admin ID 不允许用户自助认领，必须由已有管理员或本地后台绑定。')
  }
} finally {
  await connection.end()
}
