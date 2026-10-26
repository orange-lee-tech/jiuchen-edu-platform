import assert from 'node:assert/strict'
import test from 'node:test'
import { loadEnv } from '../config/env.js'
import {
  FIXED_ASSESSMENT_SKUS,
  canPurchaseTestSku,
  createCommercialConfig,
  findCreditSku,
  freeGrantsForRole,
} from './commercial-config.js'

test('default commercial gate is disabled', () => {
  const config = createCommercialConfig(loadEnv({}))
  assert.equal(config.creditEnforcementEnabled, false)
  assert.equal(config.freeGrant, null)
  assert.equal(config.studentBonusGrant, null)
  assert.deepEqual(config.paymentSkus, [])
})

test('free credit grant requires explicit matching version and amount', () => {
  assert.throws(() => createCommercialConfig(loadEnv({
    CREDIT_FREE_GRANT_VERSION: 'v1',
  })), /incomplete_credit_free_grant_config/)
})

test('guest grant one and student total grant five are role scoped', () => {
  const config = createCommercialConfig(loadEnv({
    CREDIT_ENFORCEMENT_ENABLED: 'true',
    CREDIT_FREE_GRANT_VERSION: '2026-10-v1',
    CREDIT_FREE_GRANT_AMOUNT: '1',
  }))
  assert.deepEqual(freeGrantsForRole(config, 'user').map(g => g.amount), [1])
  assert.deepEqual(freeGrantsForRole(config, 'student').map(g => g.amount), [1, 4])
  assert.deepEqual(freeGrantsForRole(config, 'admin'), [])
  assert.deepEqual(freeGrantsForRole(config, 'teacher'), [])
  assert.notEqual(config.freeGrant?.version, config.studentBonusGrant?.version)
})

test('only the approved assessment credit catalog is available', () => {
  const config = createCommercialConfig(loadEnv({
    CREDIT_ENFORCEMENT_ENABLED: 'true',
    CREDIT_FREE_GRANT_VERSION: '2026-10-v1',
    CREDIT_FREE_GRANT_AMOUNT: '1',
  }))
  assert.deepEqual(config.paymentSkus, FIXED_ASSESSMENT_SKUS.slice(1))
  assert.equal(findCreditSku(config, 'JC001')?.amountFen, 190)
  assert.equal(findCreditSku(config, 'JC002')?.amountFen, 890)
  assert.equal(findCreditSku(config, 'JC003')?.amountFen, 1690)
  assert.equal(findCreditSku(config, 'assessment-1'), null)
  assert.equal(findCreditSku(config, 'course'), null)
})

test('JC000 is available only to explicitly listed user IDs and retains two credits', () => {
  const env=loadEnv({ CREDIT_ENFORCEMENT_ENABLED:'true',CREDIT_FREE_GRANT_VERSION:'v1',
    CREDIT_FREE_GRANT_AMOUNT:'1',WECHAT_VIRTUAL_PAY_TEST_SKU_ENABLED:'true',
    WECHAT_VIRTUAL_PAY_TEST_USER_IDS:'user-a,user-b' })
  const config=createCommercialConfig(env)
  assert.equal(findCreditSku(config,'JC000')?.creditAmount,2)
  assert.equal(canPurchaseTestSku('user-a',env),true)
  assert.equal(canPurchaseTestSku('user-c',env),false)
  assert.equal(canPurchaseTestSku('user-a',loadEnv({})),false)
})

test('reject unapproved guest grant size or course checkout', () => {
  assert.throws(() => createCommercialConfig(loadEnv({
    CREDIT_ENFORCEMENT_ENABLED: 'true',
    CREDIT_FREE_GRANT_VERSION: 'v1',
    CREDIT_FREE_GRANT_AMOUNT: '5',
  })), /approved_guest_free_grant_required/)
  assert.throws(() => createCommercialConfig(loadEnv({
    CREDIT_ENFORCEMENT_ENABLED: 'true',
    CREDIT_FREE_GRANT_VERSION: 'v1',
    CREDIT_FREE_GRANT_AMOUNT: '1',
    CREDIT_PAYMENT_SKUS_JSON: JSON.stringify([
      { key: 'course', description: '课程费', amountFen: 190, creditAmount: 1 },
    ]),
  })), /unapproved_assessment_payment_sku/)
})
