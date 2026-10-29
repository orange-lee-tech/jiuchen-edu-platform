/** Additive migration. Run explicitly before deploying the API that reads due_date. */
import mysql from 'mysql2/promise'
import 'dotenv/config'

export async function upgradePlanItemDueDate(db: mysql.Connection) {
  const [columns] = await db.query<mysql.RowDataPacket[]>(
    "SELECT DATA_TYPE AS dataType, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS defaultValue FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='plan_items' AND COLUMN_NAME='due_date'",
  )
  if (columns.length) {
    if (columns.length !== 1 || columns[0]?.dataType !== 'date' || columns[0]?.nullable !== 'YES' || columns[0]?.defaultValue !== null)
      throw new Error('unexpected_plan_due_date_schema')
    return
  }
  await db.query('ALTER TABLE plan_items ADD COLUMN due_date DATE NULL DEFAULT NULL AFTER target')
}

// Keep the migration callable by the isolated MySQL gate without connecting on import.
if (process.argv[1]?.replace(/\\/g, '/').match(/\/upgrade-plan-item-due-date\.(ts|js)$/)) {
  const run = async () => {
    if (!process.env.DATABASE_URL) throw new Error('database_configuration_missing')
    const db = await mysql.createConnection(process.env.DATABASE_URL)
    try { await upgradePlanItemDueDate(db); console.log('PLAN_ITEM_DUE_DATE_MIGRATION_PASS') }
    finally { await db.end() }
  }
  run().catch(() => { console.error('Plan due date migration stopped; inspect schema without exposing credentials.'); process.exitCode = 1 })
}
