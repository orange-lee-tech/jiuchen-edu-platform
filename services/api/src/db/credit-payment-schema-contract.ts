import type mysql from 'mysql2/promise'

export type CommercialTableSnapshot = {
  tableExists: boolean
  columns: Array<{ name: string; dataType: string; nullable: boolean }>
  indexes: Array<{ name: string; column: string; sequence: number }>
  foreignKeys: Array<{
    column: string
    referencedTable: string
    referencedColumn: string
  }>
}

export type CreditPaymentSchemaSnapshot = Record<
  | 'payment_orders'
  | 'credit_ledger_entries'
  | 'credit_reservations'
  | 'payment_notifications',
  CommercialTableSnapshot
>

type TableContract = {
  columns: Record<string, { dataType: string; nullable: boolean }>
  indexes: Record<string, string[]>
  foreignKeys: Array<{
    column: string
    referencedTable: string
    referencedColumn: string
  }>
}

const CONTRACTS: Record<keyof CreditPaymentSchemaSnapshot, TableContract> = {
  payment_orders: {
    columns: {
      id: { dataType: 'varchar', nullable: false },
      user_id: { dataType: 'varchar', nullable: false },
      out_trade_no: { dataType: 'varchar', nullable: false },
      provider: { dataType: 'enum', nullable: false },
      status: { dataType: 'enum', nullable: false },
      amount_fen: { dataType: 'int', nullable: false },
      credit_amount: { dataType: 'int', nullable: false },
      provider_transaction_id: { dataType: 'varchar', nullable: true },
      paid_at: { dataType: 'timestamp', nullable: true },
      expires_at: { dataType: 'timestamp', nullable: true },
      created_at: { dataType: 'timestamp', nullable: false },
      updated_at: { dataType: 'timestamp', nullable: false },
    },
    indexes: {
      PRIMARY: ['id'],
      payment_orders_out_trade_no_uq: ['out_trade_no'],
      payment_orders_provider_transaction_id_uq: ['provider_transaction_id'],
      payment_orders_user_id_idx: ['user_id'],
    },
    foreignKeys: [
      { column: 'user_id', referencedTable: 'users', referencedColumn: 'id' },
    ],
  },
  credit_ledger_entries: {
    columns: {
      id: { dataType: 'varchar', nullable: false },
      user_id: { dataType: 'varchar', nullable: false },
      type: { dataType: 'enum', nullable: false },
      delta: { dataType: 'int', nullable: false },
      assessment_id: { dataType: 'varchar', nullable: true },
      payment_order_id: { dataType: 'varchar', nullable: true },
      idempotency_key: { dataType: 'varchar', nullable: false },
      note: { dataType: 'varchar', nullable: true },
      created_at: { dataType: 'timestamp', nullable: false },
    },
    indexes: {
      PRIMARY: ['id'],
      credit_ledger_entries_idempotency_key_uq: ['idempotency_key'],
      credit_ledger_entries_user_id_idx: ['user_id'],
      credit_ledger_entries_assessment_id_idx: ['assessment_id'],
      credit_ledger_entries_payment_order_id_idx: ['payment_order_id'],
    },
    foreignKeys: [
      { column: 'user_id', referencedTable: 'users', referencedColumn: 'id' },
      {
        column: 'assessment_id',
        referencedTable: 'assessments',
        referencedColumn: 'id',
      },
      {
        column: 'payment_order_id',
        referencedTable: 'payment_orders',
        referencedColumn: 'id',
      },
    ],
  },
  credit_reservations: {
    columns: {
      id: { dataType: 'varchar', nullable: false },
      user_id: { dataType: 'varchar', nullable: false },
      assessment_id: { dataType: 'varchar', nullable: false },
      amount: { dataType: 'int', nullable: false },
      status: { dataType: 'enum', nullable: false },
      expires_at: { dataType: 'timestamp', nullable: false },
      created_at: { dataType: 'timestamp', nullable: false },
      updated_at: { dataType: 'timestamp', nullable: false },
    },
    indexes: {
      PRIMARY: ['id'],
      credit_reservations_assessment_id_uq: ['assessment_id'],
      credit_reservations_user_id_idx: ['user_id'],
    },
    foreignKeys: [
      { column: 'user_id', referencedTable: 'users', referencedColumn: 'id' },
      {
        column: 'assessment_id',
        referencedTable: 'assessments',
        referencedColumn: 'id',
      },
    ],
  },
  payment_notifications: {
    columns: {
      id: { dataType: 'varchar', nullable: false },
      provider: { dataType: 'enum', nullable: false },
      notification_id: { dataType: 'varchar', nullable: false },
      out_trade_no: { dataType: 'varchar', nullable: true },
      provider_transaction_id: { dataType: 'varchar', nullable: true },
      payload_hash: { dataType: 'varchar', nullable: false },
      status: { dataType: 'enum', nullable: false },
      processed_at: { dataType: 'timestamp', nullable: true },
      created_at: { dataType: 'timestamp', nullable: false },
    },
    indexes: {
      PRIMARY: ['id'],
      payment_notifications_notification_id_uq: ['notification_id'],
      payment_notifications_out_trade_no_idx: ['out_trade_no'],
    },
    foreignKeys: [],
  },
}

export function validateCreditPaymentSchemaSnapshot(
  snapshot: CreditPaymentSchemaSnapshot,
): string[] {
  const issues: string[] = []

  for (const [tableName, contract] of Object.entries(CONTRACTS) as Array<
    [keyof CreditPaymentSchemaSnapshot, TableContract]
  >) {
    const table = snapshot[tableName]
    if (!table.tableExists) {
      issues.push(`missing_table:${tableName}`)
      continue
    }

    const columns = new Map(table.columns.map((column) => [column.name, column]))
    for (const [name, expected] of Object.entries(contract.columns)) {
      const actual = columns.get(name)
      if (!actual) {
        issues.push(`missing_column:${tableName}.${name}`)
        continue
      }
      if (actual.dataType !== expected.dataType) {
        issues.push(
          `column_type_mismatch:${tableName}.${name}:expected=${expected.dataType}:actual=${actual.dataType}`,
        )
      }
      if (actual.nullable !== expected.nullable) {
        issues.push(
          `column_nullability_mismatch:${tableName}.${name}:expected=${String(expected.nullable)}:actual=${String(actual.nullable)}`,
        )
      }
    }

    for (const [indexName, expectedColumns] of Object.entries(
      contract.indexes,
    )) {
      const actualColumns = table.indexes
        .filter((index) => index.name === indexName)
        .sort((left, right) => left.sequence - right.sequence)
        .map((index) => index.column)
      if (JSON.stringify(actualColumns) !== JSON.stringify(expectedColumns)) {
        issues.push(
          `index_mismatch:${tableName}.${indexName}:expected=${expectedColumns.join(',')}:actual=${actualColumns.join(',')}`,
        )
      }
    }

    for (const expected of contract.foreignKeys) {
      const found = table.foreignKeys.some(
        (foreignKey) =>
          foreignKey.column === expected.column &&
          foreignKey.referencedTable === expected.referencedTable &&
          foreignKey.referencedColumn === expected.referencedColumn,
      )
      if (!found) {
        issues.push(
          `foreign_key_missing:${tableName}.${expected.column}->${expected.referencedTable}.${expected.referencedColumn}`,
        )
      }
    }
  }

  return issues
}

async function inspectTable(
  connection: mysql.Connection,
  tableName: keyof CreditPaymentSchemaSnapshot,
): Promise<CommercialTableSnapshot> {
  const [tableRows] = await connection.query<mysql.RowDataPacket[]>(
    'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1',
    [tableName],
  )
  if (!tableRows.length) {
    return { tableExists: false, columns: [], indexes: [], foreignKeys: [] }
  }

  const [columnRows] = await connection.query<mysql.RowDataPacket[]>(
    'SELECT column_name AS columnName, data_type AS dataType, is_nullable AS nullableFlag FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position',
    [tableName],
  )
  const [indexRows] = await connection.query<mysql.RowDataPacket[]>(
    'SELECT index_name AS indexName, column_name AS columnName, seq_in_index AS sequenceNumber FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? ORDER BY index_name, seq_in_index',
    [tableName],
  )
  const [foreignKeyRows] = await connection.query<mysql.RowDataPacket[]>(
    'SELECT column_name AS columnName, referenced_table_name AS referencedTableName, referenced_column_name AS referencedColumnName FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND referenced_table_name IS NOT NULL',
    [tableName],
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

export async function inspectCreditPaymentSchema(
  connection: mysql.Connection,
): Promise<CreditPaymentSchemaSnapshot> {
  return {
    payment_orders: await inspectTable(connection, 'payment_orders'),
    credit_ledger_entries: await inspectTable(
      connection,
      'credit_ledger_entries',
    ),
    credit_reservations: await inspectTable(
      connection,
      'credit_reservations',
    ),
    payment_notifications: await inspectTable(
      connection,
      'payment_notifications',
    ),
  }
}
