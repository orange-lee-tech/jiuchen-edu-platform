import assert from 'node:assert/strict'
import test from 'node:test'
import { BUNDLED_BRAND_PUBLIC } from './bundled-brand-public.js'

test('brand bundle keeps reviewed public structure', () => {
  assert.equal(
    BUNDLED_BRAND_PUBLIC.document.document_id,
    'jiuchen-baoyan-brand-manual-2026-v1',
  )
  assert.equal(BUNDLED_BRAND_PUBLIC.document.source_page_count, 24)
  assert.equal(BUNDLED_BRAND_PUBLIC.audience.length, 4)
  assert.equal(BUNDLED_BRAND_PUBLIC.highlights.length, 7)
  assert.equal(BUNDLED_BRAND_PUBLIC.timeline.length, 10)
  assert.equal(BUNDLED_BRAND_PUBLIC.core_services.length, 9)
  assert.equal(BUNDLED_BRAND_PUBLIC.teacher_summary.source_record_count, 64)
})

test('brand bundle keeps unverified marketing claims non-displayable', () => {
  assert.equal(BUNDLED_BRAND_PUBLIC.marketing_claims.length, 7)

  for (const claim of BUNDLED_BRAND_PUBLIC.marketing_claims) {
    assert.notEqual(claim.verification_status, 'verified')
    assert.equal(claim.display_allowed, false)
  }
})

test('brand contact stays outside public product body', () => {
  assert.equal(BUNDLED_BRAND_PUBLIC.contact.include_in_product_body, false)
})
