import mysql from 'mysql2/promise'
import 'dotenv/config'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')
const connection = await mysql.createConnection(url)
try {
  const [columns] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_orders'
        AND COLUMN_NAME IN ('virtual_delivery_confirmed_at', 'virtual_reconcile_checked_at')`,
  )
  const names = new Set(columns.map((row) => String(row.COLUMN_NAME)))
  if (!names.has('virtual_delivery_confirmed_at')) {
    await connection.query(
      'ALTER TABLE payment_orders ADD COLUMN virtual_delivery_confirmed_at timestamp NULL',
    )
  }
  if (!names.has('virtual_reconcile_checked_at')) {
    await connection.query(
      'ALTER TABLE payment_orders ADD COLUMN virtual_reconcile_checked_at timestamp NULL',
    )
  }
  console.log('VIRTUAL_DELIVERY_SCHEMA_READY')
} finally {
  await connection.end()
}
