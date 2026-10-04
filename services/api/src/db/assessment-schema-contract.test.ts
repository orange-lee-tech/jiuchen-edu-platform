import assert from 'node:assert/strict'
import test from 'node:test'
import { validateAssessmentSchemaSnapshot, type AssessmentSchemaSnapshot } from './assessment-schema-contract.js'

function readySnapshot(): AssessmentSchemaSnapshot {
  const required = [
    ['id', 'varchar', false],
    ['user_id', 'varchar', false],
    ['status', 'enum', false],
    ['input_schema_version', 'varchar', false],
    ['output_schema_version', 'varchar', false],
    ['agent_version', 'varchar', false],
    ['provider', 'varchar', true],
    ['model', 'varchar', true],
    ['knowledge_version', 'varchar', true],
    ['input_json', 'json', false],
    ['evidence_json', 'json', true],
    ['output_json', 'json', true],
    ['failure_code', 'varchar', true],
    ['credit_consumed', 'tinyint', false],
    ['started_at', 'timestamp', true],
    ['completed_at', 'timestamp', true],
    ['created_at', 'timestamp', false],
    ['updated_at', 'timestamp', false],
  ] as const
  return {
    tableExists: true,
    columns: required.map(([name, dataType, nullable]) => ({ name, dataType, nullable })),
    indexes: [
      { name: 'PRIMARY', column: 'id', sequence: 1 },
      { name: 'assessments_user_id_idx', column: 'user_id', sequence: 1 },
      { name: 'assessments_status_idx', column: 'status', sequence: 1 },
    ],
    foreignKeys: [{ column: 'user_id', referencedTable: 'users', referencedColumn: 'id' }],
  }
}

test('assessment schema contract accepts the production shape', () => {
  assert.deepEqual(validateAssessmentSchemaSnapshot(readySnapshot()), [])
})

test('assessment schema contract rejects a missing table', () => {
  assert.deepEqual(validateAssessmentSchemaSnapshot({ tableExists: false, columns: [], indexes: [], foreignKeys: [] }), ['missing_table:assessments'])
})

test('assessment schema contract detects drift instead of treating table existence as ready', () => {
  const snapshot = readySnapshot()
  snapshot.columns = snapshot.columns.filter((column) => column.name !== 'output_json')
  snapshot.indexes = snapshot.indexes.filter((index) => index.name !== 'assessments_status_idx')
  snapshot.foreignKeys = []
  const issues = validateAssessmentSchemaSnapshot(snapshot)
  assert.ok(issues.includes('missing_column:output_json'))
  assert.ok(issues.some((issue) => issue.startsWith('index_mismatch:assessments_status_idx')))
  assert.ok(issues.includes('foreign_key_missing:user_id->users.id'))
})
