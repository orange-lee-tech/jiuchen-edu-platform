import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ASSESSMENT_CREDIT_COST,
  assessmentChargeOutcome,
  assessmentDebitIdempotencyKey,
  freeGrantIdempotencyKey,
  paymentGrantIdempotencyKey,
  validateAmountFen,
  validateCreditAmount,
} from './credit-policy.js'

test('one successful persisted assessment consumes exactly one credit', () => {
  assert.equal(ASSESSMENT_CREDIT_COST, 1)
  assert.equal(
    assessmentChargeOutcome({
      runtimeSucceeded: true,
      resultPersisted: true,
      terminalFailure: false,
    }),
    'consume',
  )
})

test('runtime success without persisted result does not finalize a charge', () => {
  assert.equal(
    assessmentChargeOutcome({
      runtimeSucceeded: true,
      resultPersisted: false,
      terminalFailure: false,
    }),
    'keep_held',
  )
})

test('terminal provider/system failure releases the reservation', () => {
  assert.equal(
    assessmentChargeOutcome({
      runtimeSucceeded: false,
      resultPersisted: false,
      terminalFailure: true,
    }),
    'release',
  )
})

test('idempotency keys are stable for the same trusted business event', () => {
  assert.equal(
    freeGrantIdempotencyKey('user-1', 'launch-v1'),
    'free-assessment:launch-v1:user-1',
  )
  assert.equal(
    assessmentDebitIdempotencyKey('assessment-1'),
    'assessment-debit:assessment-1',
  )
  assert.equal(
    paymentGrantIdempotencyKey('JC202610040001'),
    'payment-grant:JC202610040001',
  )
})

test('money and credit quantities must be positive integers', () => {
  assert.equal(validateCreditAmount(1), true)
  assert.equal(validateCreditAmount(0), false)
  assert.equal(validateCreditAmount(1.5), false)
  assert.equal(validateAmountFen(100), true)
  assert.equal(validateAmountFen(-1), false)
})
