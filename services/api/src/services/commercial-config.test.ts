import assert from 'node:assert/strict'
import test from 'node:test'
import { loadEnv } from '../config/env.js'
import { createCommercialConfig, findCreditSku } from './commercial-config.js'

test('commercial config has no invented grant or SKU defaults', () => {
  const config = createCommercialConfig(loadEnv({}))
  assert.equal(config.creditEnforcementEnabled, false)
  assert.equal(config.freeGrant, null)
  assert.deepEqual(config.paymentSkus, [])
})

test('free grant requires both explicit version and amount', () => {
  assert.throws(
    () =>
      createCommercialConfig(
        loadEnv({
          CREDIT_FREE_GRANT_VERSION: 'launch-v1',
        }),
      ),
    /incomplete_credit_free_grant_config/,
  )
})

test('payment SKU is parsed entirely from server configuration', () => {
  const config = createCommercialConfig(
    loadEnv({
      CREDIT_PAYMENT_SKUS_JSON: JSON.stringify([
        {
          key: 'assessment-5',
          description: 'AI评估额度',
          amountFen: 500,
          creditAmount: 5,
        },
      ]),
    }),
  )

  assert.deepEqual(findCreditSku(config, 'assessment-5'), {
    key: 'assessment-5',
    description: 'AI评估额度',
    amountFen: 500,
    creditAmount: 5,
  })
  assert.equal(findCreditSku(config, 'missing'), null)
})
