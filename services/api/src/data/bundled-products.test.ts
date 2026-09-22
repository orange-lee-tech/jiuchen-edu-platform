import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUNDLED_PRODUCT_HANDBOOKS,
  findBundledProduct,
} from './bundled-products.js'
import { buildPublicProductContent } from '../domain/product-knowledge.js'

const CHONGDING_ID = 'jiuchen-dasan-chongding-product-manual-2026-sample-v1'
const NAVIGATION_ID = 'jiuchen-baoyan-navigation-card-product-manual-2026-v1'
const QINGBEI_ID = 'jiuchen-qingbei-huawu-plan-2026-v1'

test('bundled product catalog contains reviewed handbooks', () => {
  assert.equal(BUNDLED_PRODUCT_HANDBOOKS.length, 3)
  assert.ok(findBundledProduct(CHONGDING_ID))
  assert.ok(findBundledProduct(NAVIGATION_ID))
  assert.ok(findBundledProduct(QINGBEI_ID))
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

    const publicContent = buildPublicProductContent(handbook)
    assert.equal(
      publicContent.marketing_claims.every(
        (claim) =>
          claim.verification_status === 'verified' &&
          claim.display_allowed === true,
      ),
      true,
    )
  }
})

test('chongding handbook keeps the reviewed product structure', () => {
  const handbook = findBundledProduct(CHONGDING_ID)
  assert.ok(handbook)

  assert.equal(handbook.document.source_page_count, 10)
  assert.equal(handbook.audience.length, 4)
  assert.equal(handbook.highlights.length, 8)
  assert.equal(handbook.timeline.length, 6)
  assert.equal(handbook.modules.length, 5)
  assert.equal(handbook.core_services.length, 6)
  assert.equal(handbook.teachers.length, 5)
  assert.equal(handbook.marketing_claims.length, 3)
})

test('navigation card keeps the full converted structure', () => {
  const handbook = findBundledProduct(NAVIGATION_ID)
  assert.ok(handbook)

  assert.equal(handbook.document.source_page_count, 14)
  assert.equal(handbook.highlights.length, 6)
  assert.equal(handbook.timeline.length, 9)
  assert.equal(handbook.modules.length, 9)
  assert.equal(handbook.core_services.length, 9)
  assert.equal(handbook.teachers.length, 41)
  assert.equal(handbook.marketing_claims.length, 4)

  const record = handbook as unknown as Record<string, unknown>
  assert.ok(Array.isArray(record.course_resources))
  assert.equal((record.course_resources as unknown[]).length, 44)
  assert.ok(Array.isArray(record.training_items))
  assert.equal((record.training_items as unknown[]).length, 4)
  assert.ok(
    record.example_plans &&
      typeof record.example_plans === 'object' &&
      !Array.isArray(record.example_plans),
  )
  assert.ok(
    record.internship_plans &&
      typeof record.internship_plans === 'object' &&
      !Array.isArray(record.internship_plans),
  )
})

test('qingbei huawu keeps long-term plan structure and source display values', () => {
  const handbook = findBundledProduct(QINGBEI_ID)
  assert.ok(handbook)

  assert.equal(handbook.document.source_page_count, 12)
  assert.equal(handbook.audience.length, 3)
  assert.equal(handbook.highlights.length, 4)
  assert.equal(handbook.timeline.length, 18)
  assert.equal(handbook.modules.length, 12)
  assert.equal(handbook.core_services.length, 3)
  assert.equal(handbook.teachers.length, 7)
  assert.equal(handbook.marketing_claims.length, 4)

  assert.equal(handbook.product.price?.display, '239800元')
  assert.equal(handbook.product.service_period?.display, '至获取保研offer')

  const record = handbook.product as Record<string, unknown>
  const serviceHours = record.service_hours as Record<string, unknown>
  assert.equal(serviceHours.display, '200+N小时专项课程')
})

test('navigation handbook example module cannot enter the real case dataset', () => {
  const handbook = findBundledProduct(NAVIGATION_ID)
  assert.ok(handbook)

  const exampleModule = handbook.modules
    .map((item) => item as Record<string, unknown>)
    .find((item) => item.example_only === true)

  assert.ok(exampleModule)
  assert.equal(exampleModule.real_case_dataset, false)
})

test('bundled visual asset references stay optional until runtime assets are packaged', () => {
  for (const handbook of BUNDLED_PRODUCT_HANDBOOKS) {
    const product = handbook.product as Record<string, unknown>
    const cover = String(product.cover_asset ?? '')

    if (cover) {
      assert.match(cover, /^\/assets\/products\//)
    }
  }
})
