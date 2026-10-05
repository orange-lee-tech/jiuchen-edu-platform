import mysql from 'mysql2/promise'
import 'dotenv/config'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const connection = await mysql.createConnection(databaseUrl)

try {
  const [tableRows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT table_collation AS tableCollation
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'news_posts'
      LIMIT 1`,
  )

  const tableCollation = tableRows[0]?.tableCollation
    ? String(tableRows[0].tableCollation)
    : null

  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT
        column_name AS columnName,
        data_type AS dataType,
        is_nullable AS isNullable,
        character_set_name AS characterSetName,
        collation_name AS collationName
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'news_posts'
      ORDER BY ordinal_position`,
  )

  const columns = rows.map((row) => ({
    columnName: String(row.columnName ?? ''),
    dataType: String(row.dataType ?? ''),
    isNullable: String(row.isNullable ?? ''),
    characterSetName: row.characterSetName
      ? String(row.characterSetName)
      : null,
    collationName: row.collationName
      ? String(row.collationName)
      : null,
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

  for (const expected of ['summary', 'cover_url', 'article_url']) {
    const column = columns.find((item) => item.columnName === expected)
    if (!column) {
      issues.push(`missing_column:${expected}`)
      continue
    }
    if (column.dataType.toLowerCase() !== 'text') {
      issues.push(`unexpected_type:${expected}:${column.dataType}`)
    }
  }

  for (const column of columns) {
    if (
      column.characterSetName &&
      column.characterSetName.toLowerCase() !== 'utf8mb4'
    ) {
      issues.push(
        `unsupported_charset:${column.columnName}:${column.characterSetName}`,
      )
    }
  }

  if (!tableCollation) {
    issues.push('missing_table:news_posts')
  } else if (!tableCollation.toLowerCase().startsWith('utf8mb4_')) {
    issues.push(`unsupported_table_collation:${tableCollation}`)
  }

  console.log(JSON.stringify({
    ok: issues.length === 0,
    table: 'news_posts',
    tableCollation,
    columns,
    issues,
  }, null, 2))

  if (issues.length > 0) process.exitCode = 1
} finally {
  await connection.end()
}
