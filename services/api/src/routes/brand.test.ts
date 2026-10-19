import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPublicBrandContent } from './brand.js'

test('public brand content excludes unverified claims and achievements', () => {
  const content = buildPublicBrandContent()

  assert.equal(content.marketing_claims.length, 0)
  assert.equal(content.office_achievements.length, 0)
  assert.equal(content.teacher_summary.source_record_count, 64)
  assert.equal(content.product.service_scope.length, 10)
})
