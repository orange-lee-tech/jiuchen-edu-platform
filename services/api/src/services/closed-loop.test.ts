import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AppEnv } from '../config/env.js'
import { pinDigest } from './admin-control-boxes.js'
import { validateAssessmentApiUrl } from './assessment-key-objects.js'
import { FIXED_ASSESSMENT_SKUS } from './commercial-config.js'
import { DEFAULT_PLAN_COUNTS, validatePlanCost } from './credit-plans.js'
import { buildVirtualPayment, virtualPaymentConfig } from './wechat-virtual-payment.js'

test('four fixed prices are independent from mutable evaluation counts', () => {
  assert.deepEqual(FIXED_ASSESSMENT_SKUS.map(({ key, amountFen }) => [key, amountFen]),
    [['JC000',10],['JC001',190],['JC002',890],['JC003',1690]])
  assert.deepEqual(DEFAULT_PLAN_COUNTS,{ JC000:2,JC001:1,JC002:5,JC003:10 })
  assert.doesNotThrow(() => validatePlanCost(DEFAULT_PLAN_COUNTS,1,new Date()))
  assert.throws(() => validatePlanCost({ ...DEFAULT_PLAN_COUNTS,JC002:100 },10,new Date()))
  assert.throws(() => validatePlanCost(DEFAULT_PLAN_COUNTS,1,new Date(Date.now()-31*86400000)))
})

test('object and control PINs can share digits but have independent salted hashes', () => {
  const first = pinDigest('123456','11111111111111111111111111111111')
  const second = pinDigest('123456','22222222222222222222222222222222')
  assert.notEqual(first,second)
})

test('assessment connection rejects local and metadata addresses before network calls', async () => {
  for (const url of ['http://example.com','https://127.0.0.1/v1',
    'https://169.254.169.254/latest/meta-data','https://localhost/v1',
    'https://user:pass@example.com/v1','https://example.com:8080/v1']) {
    await assert.rejects(() => validateAssessmentApiUrl(url))
  }
})

test('virtual goods use distinct server-side products and test SKU stays closed by default', () => {
  const env = {
    WECHAT_VIRTUAL_PAY_ENABLED:true,WECHAT_VIRTUAL_PAY_APP_KEY:'test-only-key',
    WECHAT_VIRTUAL_PAY_OFFER_ID:'offer',WECHAT_VIRTUAL_PAY_PRODUCT_ONE:'wx-one',
    WECHAT_VIRTUAL_PAY_PRODUCT_FIVE:'wx-five',WECHAT_VIRTUAL_PAY_PRODUCT_TEN:'wx-ten',
    WECHAT_VIRTUAL_PAY_PRODUCT_TEST:'wx-test',WECHAT_VIRTUAL_PAY_ENV:'sandbox',
  } as AppEnv
  const config = virtualPaymentConfig(env)!
  assert.equal(config.products.JC000,undefined)
  assert.notEqual(config.products.JC002,config.products.JC003)
  const signed = buildVirtualPayment({ config,sku:FIXED_ASSESSMENT_SKUS[2]!,
    orderNo:'JC'+'A'.repeat(12),sessionKey:'session-test' })
  assert.equal(JSON.parse(signed.signData).productId,'wx-five')
})
