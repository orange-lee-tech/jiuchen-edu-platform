import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCreditBalance } from './credit-ledger.js'

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
