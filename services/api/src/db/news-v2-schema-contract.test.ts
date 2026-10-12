import assert from 'node:assert/strict'
import test from 'node:test'
import {
  NEWS_V2_SCHEMA_CONTRACT,
  validateNewsV2SchemaSnapshot,
  type NewsV2SchemaSnapshot,
} from './news-v2-schema-contract.js'

function readySnapshot(): NewsV2SchemaSnapshot {
  const snapshot: NewsV2SchemaSnapshot = { tables: [], columns: [], indexes: [], foreignKeys: [] }
  for (const [table, contract] of Object.entries(NEWS_V2_SCHEMA_CONTRACT)) {
    snapshot.tables.push(table)
    for (const [name, column] of Object.entries(contract.columns)) snapshot.columns.push({ table, name, ...column })
    for (const [name, index] of Object.entries(contract.indexes)) index.columns.forEach((column, offset) =>
      snapshot.indexes.push({ table, name, column, sequence: offset + 1, unique: index.unique }))
    contract.foreignKeys.forEach((foreignKey) => snapshot.foreignKeys.push({ table, ...foreignKey }))
  }
  return snapshot
}

test('News V2 schema contract accepts all seven exact tables', () => {
  assert.deepEqual(validateNewsV2SchemaSnapshot(readySnapshot()), [])
})

test('News V2 preflight permits absent tables but rejects an incompatible existing table', () => {
  assert.deepEqual(validateNewsV2SchemaSnapshot({ tables: [], columns: [], indexes: [], foreignKeys: [] }, { allowMissingTables: true }), [])
  const snapshot = readySnapshot()
  snapshot.tables = ['news_retirement_tasks']
  snapshot.columns = snapshot.columns.filter((column) => column.table === 'news_retirement_tasks' && column.name !== 'post_id')
  snapshot.indexes = snapshot.indexes.filter((index) => index.table === 'news_retirement_tasks')
  snapshot.foreignKeys = snapshot.foreignKeys.filter((foreignKey) => foreignKey.table === 'news_retirement_tasks')
  assert.ok(validateNewsV2SchemaSnapshot(snapshot, { allowMissingTables: true }).includes('missing_column:news_retirement_tasks.post_id'))
})

test('News V2 schema contract detects type, unique-index and foreign-key drift', () => {
  const snapshot = readySnapshot()
  snapshot.columns.find((column) => column.table === 'news_sync_runs' && column.name === 'fetched')!.columnType = 'bigint'
  snapshot.indexes.find((index) => index.table === 'news_retirement_tasks' && index.name === 'uq_news_task_batch_post')!.unique = false
  snapshot.foreignKeys = snapshot.foreignKeys.filter((foreignKey) => !(foreignKey.table === 'news_favorites' && foreignKey.column === 'user_id'))
  const issues = validateNewsV2SchemaSnapshot(snapshot)
  assert.ok(issues.some((issue) => issue.startsWith('column_type_mismatch:news_sync_runs.fetched')))
  assert.ok(issues.some((issue) => issue.startsWith('index_mismatch:news_retirement_tasks.uq_news_task_batch_post')))
  assert.ok(issues.includes('foreign_key_missing:news_favorites.user_id->users.id'))
})
