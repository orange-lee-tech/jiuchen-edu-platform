import mysql from 'mysql2/promise'
import 'dotenv/config'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const connection = await mysql.createConnection(databaseUrl)

try {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT column_name AS columnName, data_type AS dataType, is_nullable AS isNullable
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'news_posts'
        AND column_name IN ('content_json','tags_json')
      ORDER BY ordinal_position`,
  )

  const columns = rows.map((row) => ({
    columnName: String(row.columnName ?? ''),
    dataType: String(row.dataType ?? ''),
    isNullable: String(row.isNullable ?? ''),
  }))

  const issues: string[] = []
  for (const expected of ['content_json', 'tags_json']) {
    const column = columns.find((item) => item.columnName === expected)
    if (!column) {
      issues.push(`missing_column:${expected}`)
      continue
    }
    if (column.dataType.toLowerCase() !== 'json') {
      issues.push(`unexpected_type:${expected}:${column.dataType}`)
    }
  }

  console.log(JSON.stringify({
    ok: issues.length === 0,
    table: 'news_posts',
    columns,
    issues,
  }, null, 2))

  if (issues.length > 0) process.exitCode = 1
} finally {
  await connection.end()
}
