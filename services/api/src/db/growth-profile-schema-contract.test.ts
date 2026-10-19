import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateGrowthProfileSchemaSnapshot,
  type GrowthProfileSchemaSnapshot,
} from './growth-profile-schema-contract.js'

function readySnapshot(): GrowthProfileSchemaSnapshot {
  const columns = [
    ['id', 'varchar', false],
    ['user_id', 'varchar', false],
    ['type', 'enum', false],
    ['title', 'varchar', false],
    ['organization', 'varchar', true],
    ['role', 'varchar', true],
    ['start_date', 'varchar', true],
    ['end_date', 'varchar', true],
    ['description', 'varchar', true],
    ['result', 'varchar', true],
    ['standard_expression', 'varchar', true],
    ['evidence_json', 'json', true],
    ['metadata_json', 'json', true],
    ['source_type', 'enum', false],
    ['source_record_id', 'varchar', true],
    ['source_key', 'varchar', false],
    ['user_confirmed', 'tinyint', false],
    ['user_confirmed_at', 'timestamp', true],
    ['teacher_confirmed', 'tinyint', false],
    ['teacher_confirmed_at', 'timestamp', true],
    ['admin_confirmed', 'tinyint', false],
    ['admin_confirmed_at', 'timestamp', true],
    ['status', 'enum', false],
    ['created_at', 'timestamp', false],
    ['updated_at', 'timestamp', false],
  ] as const

  return {
    tableExists: true,
    columns: columns.map(([name, dataType, nullable]) => ({ name, dataType, nullable })),
    indexes: [
      { name: 'PRIMARY', column: 'id', sequence: 1 },
      { name: 'growth_records_source_key_uq', column: 'source_key', sequence: 1 },
      { name: 'growth_records_user_id_idx', column: 'user_id', sequence: 1 },
      { name: 'growth_records_type_idx', column: 'type', sequence: 1 },
    ],
    foreignKeys: [
      { column: 'user_id', referencedTable: 'users', referencedColumn: 'id' },
    ],
  }
}

test('growth profile schema contract accepts the production shape', () => {
  assert.deepEqual(validateGrowthProfileSchemaSnapshot(readySnapshot()), [])
})

test('growth profile schema contract rejects missing table', () => {
  assert.deepEqual(
    validateGrowthProfileSchemaSnapshot({
      tableExists: false,
      columns: [],
      indexes: [],
      foreignKeys: [],
    }),
    ['missing_table:growth_records'],
  )
})

test('growth profile schema contract detects drift', () => {
  const snapshot = readySnapshot()
  snapshot.columns = snapshot.columns.filter((column) => column.name !== 'source_key')
  snapshot.indexes = snapshot.indexes.filter(
    (index) => index.name !== 'growth_records_user_id_idx',
  )
  snapshot.foreignKeys = []
  const issues = validateGrowthProfileSchemaSnapshot(snapshot)
  assert.ok(issues.includes('missing_column:source_key'))
  assert.ok(
    issues.some((issue) =>
      issue.startsWith('index_mismatch:growth_records_user_id_idx'),
    ),
  )
  assert.ok(issues.includes('foreign_key_missing:user_id->users.id'))
})
