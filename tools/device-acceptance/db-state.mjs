import mysql from '../../services/api/node_modules/mysql2/promise.js'

const url = process.env.DATABASE_URL
if (process.env.NODE_ENV !== 'test' || !url) throw new Error('test database required')
const parsed = new URL(url)
if (parsed.hostname !== '127.0.0.1' || parsed.port !== '33306' ||
    parsed.pathname !== '/jiuchen_device_acceptance') {
  throw new Error('refusing non-acceptance database')
}
const db = await mysql.createConnection(url)
try {
  const [[row]] = await db.query(
    'SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()')
  console.log(Number(row.n))
} finally { await db.end() }
