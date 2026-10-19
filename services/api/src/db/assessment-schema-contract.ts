import type mysql from 'mysql2/promise'

export type AssessmentSchemaSnapshot = {
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
  status: { dataType: 'enum', nullable: false },
  input_schema_version: { dataType: 'varchar', nullable: false },
  output_schema_version: { dataType: 'varchar', nullable: false },
  agent_version: { dataType: 'varchar', nullable: false },
  provider: { dataType: 'varchar', nullable: true },
  model: { dataType: 'varchar', nullable: true },
  knowledge_version: { dataType: 'varchar', nullable: true },
  input_json: { dataType: 'json', nullable: false },
  evidence_json: { dataType: 'json', nullable: true },
  output_json: { dataType: 'json', nullable: true },
  failure_code: { dataType: 'varchar', nullable: true },
  credit_consumed: { dataType: 'tinyint', nullable: false },
  started_at: { dataType: 'timestamp', nullable: true },
  completed_at: { dataType: 'timestamp', nullable: true },
  created_at: { dataType: 'timestamp', nullable: false },
  updated_at: { dataType: 'timestamp', nullable: false },
}

const EXPECTED_INDEXES: Record<string, string[]> = {
  PRIMARY: ['id'],
  assessments_user_id_idx: ['user_id'],
  assessments_status_idx: ['status'],
}

export function validateAssessmentSchemaSnapshot(snapshot: AssessmentSchemaSnapshot): string[] {
  const issues: string[] = []
  if (!snapshot.tableExists) return ['missing_table:assessments']

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
    (foreignKey) => foreignKey.column === 'user_id' && foreignKey.referencedTable === 'users' && foreignKey.referencedColumn === 'id',
  )
  if (!hasUserForeignKey) issues.push('foreign_key_missing:user_id->users.id')
  return issues
}

export async function inspectAssessmentSchema(connection: mysql.Connection): Promise<AssessmentSchemaSnapshot> {
  const [tableRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'assessments' LIMIT 1",
  )
  if (tableRows.length === 0) {
    return { tableExists: false, columns: [], indexes: [], foreignKeys: [] }
  }

  const [columnRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT column_name AS columnName, data_type AS dataType, is_nullable AS nullableFlag FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'assessments' ORDER BY ordinal_position",
  )
  const [indexRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT index_name AS indexName, column_name AS columnName, seq_in_index AS sequenceNumber FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'assessments' ORDER BY index_name, seq_in_index",
  )
  const [foreignKeyRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT column_name AS columnName, referenced_table_name AS referencedTableName, referenced_column_name AS referencedColumnName FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = 'assessments' AND referenced_table_name IS NOT NULL",
  )

  return {
    tableExists: true,
    columns: columnRows.map((row) => ({
      name: String(row.columnName),
      dataType: String(row.dataType).toLowerCase(),
      nullable: String(row.nullableFlag).toUpperCase() === 'YES',
    })),
    indexes: indexRows.map((row) => ({
      name: String(row.indexName),
      column: String(row.columnName),
      sequence: Number(row.sequenceNumber),
    })),
    foreignKeys: foreignKeyRows.map((row) => ({
      column: String(row.columnName),
      referencedTable: String(row.referencedTableName),
      referencedColumn: String(row.referencedColumnName),
    })),
  }
}
