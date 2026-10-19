import mysql from 'mysql2/promise'
import 'dotenv/config'
import {
  inspectCreditPaymentSchema,
  validateCreditPaymentSchemaSnapshot,
} from './credit-payment-schema-contract.js'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const connection = await mysql.createConnection(databaseUrl)

try {
  const snapshot = await inspectCreditPaymentSchema(connection)
  const issues = validateCreditPaymentSchemaSnapshot(snapshot)
  console.log(JSON.stringify({
    ok: issues.length === 0,
    tables: Object.fromEntries(
      Object.entries(snapshot).map(([name, table]) => [
        name,
        {
          exists: table.tableExists,
          columnCount: table.columns.length,
          indexNames: [...new Set(table.indexes.map((item) => item.name))].sort(),
          foreignKeyCount: table.foreignKeys.length,
        },
      ]),
    ),
    issues,
  }, null, 2))
  if (issues.length > 0) process.exitCode = 1
} finally {
  await connection.end()
}
