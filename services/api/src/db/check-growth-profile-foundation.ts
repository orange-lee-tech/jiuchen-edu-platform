import mysql from 'mysql2/promise'
import 'dotenv/config'
import {
  inspectGrowthProfileSchema,
  validateGrowthProfileSchemaSnapshot,
} from './growth-profile-schema-contract.js'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const connection = await mysql.createConnection(databaseUrl)

try {
  const snapshot = await inspectGrowthProfileSchema(connection)
  const issues = validateGrowthProfileSchemaSnapshot(snapshot)
  console.log(JSON.stringify({
    ok: issues.length === 0,
    table: 'growth_records',
    exists: snapshot.tableExists,
    columnCount: snapshot.columns.length,
    indexNames: [...new Set(snapshot.indexes.map((item) => item.name))].sort(),
    userForeignKeyReady: snapshot.foreignKeys.some(
      (item) =>
        item.column === 'user_id' &&
        item.referencedTable === 'users' &&
        item.referencedColumn === 'id',
    ),
    issues,
  }, null, 2))
  if (issues.length > 0) process.exitCode = 1
} finally {
  await connection.end()
}
