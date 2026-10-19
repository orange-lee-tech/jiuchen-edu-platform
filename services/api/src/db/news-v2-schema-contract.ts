import type mysql from 'mysql2/promise'

type ColumnContract = { columnType: string; nullable: boolean }
type IndexContract = { columns: string[]; unique: boolean }
type ForeignKeyContract = { column: string; referencedTable: string; referencedColumn: string }
type TableContract = {
  columns: Record<string, ColumnContract>
  indexes: Record<string, IndexContract>
  foreignKeys: ForeignKeyContract[]
}

export const NEWS_V2_SCHEMA_CONTRACT: Record<string, TableContract> = {
  news_display_states: {
    columns: {
      post_id: { columnType: 'varchar(36)', nullable: false },
      phase: { columnType: "enum('normal','buffering','retired','source_invalid')", nullable: false },
      buffered_at: { columnType: 'timestamp', nullable: true },
      retire_at: { columnType: 'timestamp', nullable: true },
      updated_at: { columnType: 'timestamp', nullable: false },
    },
    indexes: {
      PRIMARY: { columns: ['post_id'], unique: true },
      idx_news_display_phase_retire: { columns: ['phase', 'retire_at'], unique: false },
    },
    foreignKeys: [{ column: 'post_id', referencedTable: 'news_posts', referencedColumn: 'id' }],
  },
  news_favorites: {
    columns: {
      user_id: { columnType: 'varchar(36)', nullable: false },
      post_id: { columnType: 'varchar(36)', nullable: false },
      original_url: { columnType: 'text', nullable: false },
      title: { columnType: 'varchar(255)', nullable: false },
      source_time: { columnType: 'timestamp', nullable: true },
      created_at: { columnType: 'timestamp', nullable: false },
    },
    indexes: {
      PRIMARY: { columns: ['user_id', 'post_id'], unique: true },
      idx_news_fav_user_time: { columns: ['user_id', 'created_at'], unique: false },
    },
    foreignKeys: [
      { column: 'user_id', referencedTable: 'users', referencedColumn: 'id' },
      { column: 'post_id', referencedTable: 'news_posts', referencedColumn: 'id' },
    ],
  },
  news_retirement_batches: {
    columns: {
      id: { columnType: 'varchar(36)', nullable: false },
      entered_json: { columnType: 'json', nullable: false },
      affected_json: { columnType: 'json', nullable: false },
      created_at: { columnType: 'timestamp', nullable: false },
    },
    indexes: { PRIMARY: { columns: ['id'], unique: true } },
    foreignKeys: [],
  },
  news_retirement_tasks: {
    columns: {
      id: { columnType: 'varchar(36)', nullable: false },
      batch_id: { columnType: 'varchar(36)', nullable: false },
      post_id: { columnType: 'varchar(36)', nullable: false },
      state: { columnType: "enum('todo','acknowledged','doing','feedback')", nullable: false },
      note: { columnType: 'text', nullable: true },
      updated_by: { columnType: 'varchar(36)', nullable: true },
      updated_at: { columnType: 'timestamp', nullable: false },
    },
    indexes: {
      PRIMARY: { columns: ['id'], unique: true },
      uq_news_task_batch_post: { columns: ['batch_id', 'post_id'], unique: true },
      idx_news_task_state: { columns: ['state', 'updated_at'], unique: false },
    },
    foreignKeys: [
      { column: 'batch_id', referencedTable: 'news_retirement_batches', referencedColumn: 'id' },
      { column: 'post_id', referencedTable: 'news_posts', referencedColumn: 'id' },
      { column: 'updated_by', referencedTable: 'users', referencedColumn: 'id' },
    ],
  },
  news_retirement_reads: {
    columns: {
      batch_id: { columnType: 'varchar(36)', nullable: false },
      user_id: { columnType: 'varchar(36)', nullable: false },
      read_at: { columnType: 'timestamp', nullable: false },
    },
    indexes: { PRIMARY: { columns: ['batch_id', 'user_id'], unique: true } },
    foreignKeys: [
      { column: 'batch_id', referencedTable: 'news_retirement_batches', referencedColumn: 'id' },
      { column: 'user_id', referencedTable: 'users', referencedColumn: 'id' },
    ],
  },
  news_task_audit: {
    columns: {
      id: { columnType: 'varchar(36)', nullable: false },
      task_id: { columnType: 'varchar(36)', nullable: false },
      actor_id: { columnType: 'varchar(36)', nullable: false },
      from_state: { columnType: 'varchar(20)', nullable: false },
      to_state: { columnType: 'varchar(20)', nullable: false },
      note: { columnType: 'text', nullable: true },
      created_at: { columnType: 'timestamp', nullable: false },
    },
    indexes: {
      PRIMARY: { columns: ['id'], unique: true },
      idx_news_task_audit_task_time: { columns: ['task_id', 'created_at'], unique: false },
    },
    foreignKeys: [
      { column: 'task_id', referencedTable: 'news_retirement_tasks', referencedColumn: 'id' },
      { column: 'actor_id', referencedTable: 'users', referencedColumn: 'id' },
    ],
  },
  news_sync_runs: {
    columns: {
      id: { columnType: 'varchar(36)', nullable: false },
      status: { columnType: "enum('checked','partial','failed')", nullable: false },
      checked_at: { columnType: 'timestamp', nullable: false },
      latest_source_time: { columnType: 'timestamp', nullable: true },
      fetched: { columnType: 'int', nullable: false },
      created_count: { columnType: 'int', nullable: false },
      updated_count: { columnType: 'int', nullable: false },
      failed_count: { columnType: 'int', nullable: false },
      error_code: { columnType: 'varchar(80)', nullable: true },
    },
    indexes: {
      PRIMARY: { columns: ['id'], unique: true },
      idx_news_sync_checked: { columns: ['checked_at'], unique: false },
    },
    foreignKeys: [],
  },
}

export type NewsV2SchemaSnapshot = {
  tables: string[]
  columns: Array<{ table: string; name: string; columnType: string; nullable: boolean }>
  indexes: Array<{ table: string; name: string; column: string; sequence: number; unique: boolean }>
  foreignKeys: Array<{ table: string; column: string; referencedTable: string; referencedColumn: string }>
}

export function validateNewsV2SchemaSnapshot(
  snapshot: NewsV2SchemaSnapshot,
  options: { allowMissingTables?: boolean } = {},
) {
  const issues: string[] = []
  const existing = new Set(snapshot.tables)
  for (const [table, contract] of Object.entries(NEWS_V2_SCHEMA_CONTRACT)) {
    if (!existing.has(table)) {
      if (!options.allowMissingTables) issues.push('missing_table:' + table)
      continue
    }
    for (const [name, expected] of Object.entries(contract.columns)) {
      const actual = snapshot.columns.find((column) => column.table === table && column.name === name)
      if (!actual) {
        issues.push(`missing_column:${table}.${name}`)
        continue
      }
      if (actual.columnType.toLowerCase() !== expected.columnType) {
        issues.push(`column_type_mismatch:${table}.${name}:expected=${expected.columnType}:actual=${actual.columnType}`)
      }
      if (actual.nullable !== expected.nullable) {
        issues.push(`column_nullability_mismatch:${table}.${name}:expected=${expected.nullable}:actual=${actual.nullable}`)
      }
    }
    for (const [name, expected] of Object.entries(contract.indexes)) {
      const rows = snapshot.indexes
        .filter((index) => index.table === table && index.name === name)
        .sort((left, right) => left.sequence - right.sequence)
      const columns = rows.map((index) => index.column)
      if (JSON.stringify(columns) !== JSON.stringify(expected.columns) || rows.some((index) => index.unique !== expected.unique)) {
        issues.push(`index_mismatch:${table}.${name}:expected=${expected.unique ? 'unique:' : ''}${expected.columns.join(',')}:actual=${rows[0]?.unique ? 'unique:' : ''}${columns.join(',')}`)
      }
    }
    for (const expected of contract.foreignKeys) {
      const found = snapshot.foreignKeys.some((foreignKey) =>
        foreignKey.table === table && foreignKey.column === expected.column &&
        foreignKey.referencedTable === expected.referencedTable &&
        foreignKey.referencedColumn === expected.referencedColumn)
      if (!found) issues.push(`foreign_key_missing:${table}.${expected.column}->${expected.referencedTable}.${expected.referencedColumn}`)
    }
  }
  return issues
}

export async function inspectNewsV2Schema(connection: mysql.Connection): Promise<NewsV2SchemaSnapshot> {
  const names = Object.keys(NEWS_V2_SCHEMA_CONTRACT)
  const placeholders = names.map(() => '?').join(',')
  const [tableRows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN (${placeholders})`, names)
  const [columnRows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT table_name AS tableName,column_name AS columnName,column_type AS columnType,is_nullable AS nullableFlag
     FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN (${placeholders})`, names)
  const [indexRows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT table_name AS tableName,index_name AS indexName,column_name AS columnName,seq_in_index AS sequenceNumber,non_unique AS nonUnique
     FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name IN (${placeholders}) ORDER BY table_name,index_name,seq_in_index`, names)
  const [foreignKeyRows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT table_name AS tableName,column_name AS columnName,referenced_table_name AS referencedTableName,referenced_column_name AS referencedColumnName
     FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name IN (${placeholders}) AND referenced_table_name IS NOT NULL`, names)
  return {
    tables: tableRows.map((row) => String(row.tableName)),
    columns: columnRows.map((row) => ({ table: String(row.tableName), name: String(row.columnName), columnType: String(row.columnType).toLowerCase(), nullable: String(row.nullableFlag).toUpperCase() === 'YES' })),
    indexes: indexRows.map((row) => ({ table: String(row.tableName), name: String(row.indexName), column: String(row.columnName), sequence: Number(row.sequenceNumber), unique: Number(row.nonUnique) === 0 })),
    foreignKeys: foreignKeyRows.map((row) => ({ table: String(row.tableName), column: String(row.columnName), referencedTable: String(row.referencedTableName), referencedColumn: String(row.referencedColumnName) })),
  }
}
