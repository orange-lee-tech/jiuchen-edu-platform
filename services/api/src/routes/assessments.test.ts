import assert from 'node:assert/strict'
import test from 'node:test'
import { isMissingTable } from './assessments.js'

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
