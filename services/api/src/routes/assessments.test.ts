import assert from 'node:assert/strict'
import test from 'node:test'
import { isMissingTable, serializeAssessment } from './assessments.js'

test('isMissingTable detects direct mysql missing-table errors', () => {
  assert.equal(isMissingTable({ code: 'ER_NO_SUCH_TABLE' }), true)
})

test('isMissingTable detects Drizzle/mysql2 errors wrapped in cause', () => {
  assert.equal(
    isMissingTable({
      name: 'DrizzleQueryError',
      cause: {
        message: 'query failed',
        cause: {
          code: 'ER_NO_SUCH_TABLE',
          errno: 1146,
          sqlState: '42S02',
        },
      },
    }),
    true,
  )
})

test('isMissingTable accepts mysql errno/sqlState fallbacks', () => {
  assert.equal(isMissingTable({ errno: 1146 }), true)
  assert.equal(isMissingTable({ sqlState: '42S02' }), true)
})

test('isMissingTable does not classify unrelated database errors as schema missing', () => {
  assert.equal(isMissingTable({ code: 'ER_DUP_ENTRY', errno: 1062 }), false)
  assert.equal(
    isMissingTable({
      cause: { code: 'ER_ACCESS_DENIED_ERROR', errno: 1045 },
    }),
    false,
  )
})

test('isMissingTable stops safely on cyclic causes', () => {
  const error: { cause?: unknown } = {}
  error.cause = error
  assert.equal(isMissingTable(error), false)
})


test('assessment timestamps use MySQL epochs, not the UTC-shifted ORM Date', () => {
  // Evidence: 2026-11-01 MySQL epoch is 02:39Z, Drizzle Date is 10:39Z.
  const row = {
    id: 'synthetic', status: 'succeeded' as const,
    inputSchemaVersion: 'assessment-input-v1',
    outputSchemaVersion: 'assessment-output-v1',
    agentVersion: 'test', provider: 'deepseek', model: 'deepseek-v4-pro',
    knowledgeVersion: null, inputJson: {}, evidenceJson: null, outputJson: {},
    failureCode: null, creditConsumed: true,
    createdAt: new Date('2026-11-01T10:39:26.000Z'),
    startedAt: new Date('2026-11-01T10:39:27.000Z'),
    completedAt: new Date('2026-11-01T10:40:21.000Z'),
    updatedAt: new Date('2026-11-01T10:40:20.000Z'),
    createdEpoch: 1793500766, startedEpoch: 1793500767,
    completedEpoch: 1793500821, updatedEpoch: 1793500820,
  }
  const result = serializeAssessment(row)
  assert.equal(result.createdAt, '2026-11-01T02:39:26.000Z')
  assert.equal(result.startedAt, '2026-11-01T02:39:27.000Z')
  assert.equal(result.completedAt, '2026-11-01T02:40:21.000Z')
  assert.equal(result.updatedAt, '2026-11-01T02:40:20.000Z')
  assert.equal(result.creditConsumed, true)
})

test('draft assessment timestamps preserve null run times', () => {
  const row = {
    id: 'synthetic-draft', status: 'draft' as const,
    inputSchemaVersion: 'assessment-input-v1',
    outputSchemaVersion: 'assessment-output-v1',
    agentVersion: 'test', provider: null, model: null,
    knowledgeVersion: null, inputJson: {}, evidenceJson: null, outputJson: null,
    failureCode: null, creditConsumed: false,
    createdAt: new Date('2026-11-01T10:39:26.000Z'),
    updatedAt: new Date('2026-11-01T10:39:26.000Z'),
    startedAt: null, completedAt: null,
    createdEpoch: 1793500766, updatedEpoch: 1793500766,
    startedEpoch: null, completedEpoch: null,
  }
  const result = serializeAssessment(row)
  assert.equal(result.createdAt, '2026-11-01T02:39:26.000Z')
  assert.equal(result.startedAt, null)
  assert.equal(result.completedAt, null)
  assert.equal(result.creditConsumed, false)
})
