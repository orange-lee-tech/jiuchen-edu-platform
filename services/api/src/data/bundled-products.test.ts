import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUNDLED_PRODUCT_HANDBOOKS,
  findBundledProduct,
} from './bundled-products.js'

const CHONGDING_ID = 'jiuchen-dasan-chongding-product-manual-2026-sample-v1'
const NAVIGATION_ID = 'jiuchen-baoyan-navigation-card-product-manual-2026-v1'

test('bundled product catalog contains both reviewed handbooks', () => {
  assert.equal(BUNDLED_PRODUCT_HANDBOOKS.length, 2)
  assert.ok(findBundledProduct(CHONGDING_ID))
  assert.ok(findBundledProduct(NAVIGATION_ID))
})

test('bundled handbooks use normalized product_handbook contract', () => {
  for (const handbook of BUNDLED_PRODUCT_HANDBOOKS) {
    assert.equal(handbook.document.document_type, 'product_handbook')
    assert.equal(handbook.document.conversion_version, 'handbook-v1')
    assert.equal(handbook.document.dataset_scope, 'jiuchen_product_knowledge')
  }
})

test('bundled handbooks keep unverified marketing claims hidden', () => {
  for (const handbook of BUNDLED_PRODUCT_HANDBOOKS) {
    for (const claim of handbook.marketing_claims) {
      if (claim.verification_status !== 'verified') {
        assert.equal(claim.display_allowed, false)
      }
    }
  }
})

test('bundled products contain local cover asset references', () => {
  for (const handbook of BUNDLED_PRODUCT_HANDBOOKS) {
    const product = handbook.product as Record<string, unknown>
    assert.match(String(product.cover_asset ?? ''), /^\/assets\/products\//)
  }
})

test('navigation card keeps rich supplemental content and example safeguards', () => {
  const handbook = findBundledProduct(NAVIGATION_ID)
  assert.ok(handbook)

  const record = handbook as unknown as Record<string, unknown>
  assert.ok(Array.isArray(record.course_resources))
  assert.ok(Array.isArray(record.training_items))
  assert.ok(record.example_plans && typeof record.example_plans === 'object' && !Array.isArray(record.example_plans))

  const serialized = JSON.stringify(record.example_plans)
  assert.match(serialized, /real_case_dataset/)
  assert.match(serialized, /false/)
})
