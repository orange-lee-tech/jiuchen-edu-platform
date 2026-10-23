import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { sealKey, settingsSchema, sixDigitPin, unsealKey } from './admin-control-boxes.js'

test('settings PIN shape, numerical policy and isolated key encryption', () => {
  assert.equal(sixDigitPin.safeParse('012345').success, true)
  assert.equal(sixDigitPin.safeParse('12345').success, false)
  assert.equal(sixDigitPin.safeParse('abcdef').success, false)
  assert.equal(settingsSchema.safeParse({
    singleFen: 190, tenFen: 1690, guestFree: 1, studentTotalFree: 5,
    platformPriceConfirmed: false, estimatedCostFen: null,
  }).success, true)
  assert.equal(settingsSchema.safeParse({
    singleFen: 0, tenFen: 1690, guestFree: 5, studentTotalFree: 1,
    platformPriceConfirmed: true, estimatedCostFen: 100,
  }).success, false)

  const masterKey = randomBytes(32).toString('base64')
  const ciphertext = sealKey('private-test-key', masterKey)
  assert.equal(ciphertext.includes('private-test-key'), false)
  assert.equal(unsealKey(ciphertext, masterKey), 'private-test-key')
  assert.throws(() => unsealKey(ciphertext, randomBytes(32).toString('base64')))
})
