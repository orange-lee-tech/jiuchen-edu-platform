import type mysql from 'mysql2/promise'

export type GrowthProfileSchemaSnapshot = {
  tableExists: boolean
  columns: Array<{ name: string; dataType: string; nullable: boolean }>
  indexes: Array<{ name: string; column: string; sequence: number }>
  foreignKeys: Array<{
    column: string
    referencedTable: string
    referencedColumn: string
  }>
}

const EXPECTED_COLUMNS: Record<string, { dataType: string; nullable: boolean }> = {
  id: { dataType: 'varchar', nullable: false },
  user_id: { dataType: 'varchar', nullable: false },
  type: { dataType: 'enum', nullable: false },
  title: { dataType: 'varchar', nullable: false },
  organization: { dataType: 'varchar', nullable: true },
  role: { dataType: 'varchar', nullable: true },
  start_date: { dataType: 'varchar', nullable: true },
  end_date: { dataType: 'varchar', nullable: true },
  description: { dataType: 'varchar', nullable: true },
  result: { dataType: 'varchar', nullable: true },
  standard_expression: { dataType: 'varchar', nullable: true },
  evidence_json: { dataType: 'json', nullable: true },
  metadata_json: { dataType: 'json', nullable: true },
  source_type: { dataType: 'enum', nullable: false },
  source_record_id: { dataType: 'varchar', nullable: true },
  source_key: { dataType: 'varchar', nullable: false },
  user_confirmed: { dataType: 'tinyint', nullable: false },
  user_confirmed_at: { dataType: 'timestamp', nullable: true },
  teacher_confirmed: { dataType: 'tinyint', nullable: false },
  teacher_confirmed_at: { dataType: 'timestamp', nullable: true },
  admin_confirmed: { dataType: 'tinyint', nullable: false },
  admin_confirmed_at: { dataType: 'timestamp', nullable: true },
  status: { dataType: 'enum', nullable: false },
  created_at: { dataType: 'timestamp', nullable: false },
  updated_at: { dataType: 'timestamp', nullable: false },
}

const EXPECTED_INDEXES: Record<string, string[]> = {
  PRIMARY: ['id'],
  growth_records_source_key_uq: ['source_key'],
  growth_records_user_id_idx: ['user_id'],
  growth_records_type_idx: ['type'],
}

export function validateGrowthProfileSchemaSnapshot(
  snapshot: GrowthProfileSchemaSnapshot,
): string[] {
  const issues: string[] = []
  if (!snapshot.tableExists) return ['missing_table:growth_records']

  const columns = new Map(snapshot.columns.map((column) => [column.name, column]))
  for (const [name, expected] of Object.entries(EXPECTED_COLUMNS)) {
    const actual = columns.get(name)
    if (!actual) {
      issues.push('missing_column:' + name)
      continue
    }
    if (actual.dataType !== expected.dataType) {
      issues.push('column_type_mismatch:' + name + ':expected=' + expected.dataType + ':actual=' + actual.dataType)
    }
    if (actual.nullable !== expected.nullable) {
      issues.push('column_nullability_mismatch:' + name + ':expected=' + String(expected.nullable) + ':actual=' + String(actual.nullable))
    }
  }

  for (const [indexName, expectedColumns] of Object.entries(EXPECTED_INDEXES)) {
    const actualColumns = snapshot.indexes
      .filter((index) => index.name === indexName)
      .sort((left, right) => left.sequence - right.sequence)
      .map((index) => index.column)
    if (JSON.stringify(actualColumns) !== JSON.stringify(expectedColumns)) {
      issues.push('index_mismatch:' + indexName + ':expected=' + expectedColumns.join(',') + ':actual=' + actualColumns.join(','))
    }
  }

  const hasUserForeignKey = snapshot.foreignKeys.some(
    (foreignKey) =>
      foreignKey.column === 'user_id' &&
      foreignKey.referencedTable === 'users' &&
      foreignKey.referencedColumn === 'id',
  )
  if (!hasUserForeignKey) issues.push('foreign_key_missing:user_id->users.id')
  return issues
}

export async function inspectGrowthProfileSchema(
  connection: mysql.Connection,
): Promise<GrowthProfileSchemaSnapshot> {
  const [tableRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'growth_records' LIMIT 1",
  )
  if (tableRows.length === 0) {
    return { tableExists: false, columns: [], indexes: [], foreignKeys: [] }
  }

  const [columnRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'growth_records' ORDER BY ordinal_position",
  )
  const [indexRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT index_name, column_name, seq_in_index FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'growth_records' ORDER BY index_name, seq_in_index",
  )
  const [foreignKeyRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT column_name, referenced_table_name, referenced_column_name FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = 'growth_records' AND referenced_table_name IS NOT NULL",
  )

  return {
    tableExists: true,
    columns: columnRows.map((row) => ({
      name: String(row.column_name),
      dataType: String(row.data_type).toLowerCase(),
      nullable: String(row.is_nullable).toUpperCase() === 'YES',
    })),
    indexes: indexRows.map((row) => ({
      name: String(row.index_name),
      column: String(row.column_name),
      sequence: Number(row.seq_in_index),
    })),
    foreignKeys: foreignKeyRows.map((row) => ({
      column: String(row.column_name),
      referencedTable: String(row.referenced_table_name),
      referencedColumn: String(row.referenced_column_name),
    })),
  }
}
