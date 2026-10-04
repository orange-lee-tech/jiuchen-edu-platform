import assert from 'node:assert/strict'
import test from 'node:test'
import type { PaymentSettlementResult } from './payment-orders.js'

test('payment settlement result contract distinguishes processed and rejected states', () => {
  const processed: PaymentSettlementResult = {
    status: 'processed',
    duplicate: false,
    orderId: 'order-1',
    grantedCredits: 5,
  }
  const rejected: PaymentSettlementResult = {
    status: 'rejected',
    reason: 'payment_amount_mismatch',
  }

  assert.equal(processed.status, 'processed')
  assert.equal(processed.grantedCredits, 5)
  assert.equal(rejected.status, 'rejected')
  assert.equal(rejected.reason, 'payment_amount_mismatch')
})
