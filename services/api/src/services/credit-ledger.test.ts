import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCreditBalance, persistAssessmentFailureAndReleaseCredit,
  persistAssessmentSuccessAndConsumeCredit } from './credit-ledger.js'

test('available credit subtracts held reservations from settled ledger balance', () => {
  assert.deepEqual(buildCreditBalance(5, 2), {
    settledBalance: 5,
    heldBalance: 2,
    availableBalance: 3,
  })
})

test('read model does not silently clamp an inconsistent negative available balance', () => {
  assert.deepEqual(buildCreditBalance(1, 2), {
    settledBalance: 1,
    heldBalance: 2,
    availableBalance: -1,
  })
})

test('terminal persistence consumes once, while failed assessment releases its hold', async () => {
  const state = { status: 'running', consumed: false, reservation: 'held', debit: false,
    debitInserts: 0 }
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql: string) {
      if (sql.startsWith('SELECT id FROM users')) return [[{ id: 'user' }]]
      if (sql.includes('SELECT id, status, credit_consumed AS'))
        return [[{ id: 'assessment', status: state.status, creditConsumed: state.consumed }]]
      if (sql.includes('SELECT credit_consumed AS')) return [[{ creditConsumed: state.consumed }]]
      if (sql.includes('FROM credit_reservations'))
        return [[{ id: 'reservation', status: state.reservation, amount: 1 }]]
      if (sql.includes('FROM credit_ledger_entries'))
        return [state.debit ? [{ id: 'debit', userId: 'user', delta: -1,
          assessmentId: 'assessment' }] : []]
      if (sql.includes("SET status = 'succeeded'")) {
        state.status = 'succeeded'; state.consumed = true
      }
      if (sql.includes('INSERT INTO credit_ledger_entries')) {
        state.debit = true; state.debitInserts += 1
      }
      if (sql.includes("SET status = 'consumed'")) state.reservation = 'consumed'
      if (sql.includes("SET status = 'failed'")) state.status = 'failed'
      if (sql.includes("SET status = 'released'")) state.reservation = 'released'
      return [[]]
    },
  }
  const database = { configured: true, pool: { getConnection: async () => connection } } as any
  const successInput = { database, userId: 'user', assessmentId: 'assessment',
    provider: 'test', model: 'test', knowledgeVersion: 'v1', evidence: [], output: {},
    completedAt: new Date() }
  assert.deepEqual(await persistAssessmentSuccessAndConsumeCredit(successInput),
    { consumed: true, idempotent: false })
  assert.deepEqual(await persistAssessmentSuccessAndConsumeCredit(successInput),
    { consumed: false, idempotent: true })
  assert.equal(state.debitInserts, 1)
  assert.equal(state.reservation, 'consumed')

  state.status = 'running'; state.consumed = false; state.reservation = 'held'; state.debit = false
  await persistAssessmentFailureAndReleaseCredit({ database, userId: 'user',
    assessmentId: 'assessment', failureCode: 'assessment_ai_timeout', completedAt: new Date() })
  assert.equal(state.status, 'failed')
  assert.equal(state.reservation, 'released')
  assert.equal(state.debitInserts, 1)
})
