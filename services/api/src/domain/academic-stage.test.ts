import test from 'node:test'
import assert from 'node:assert/strict'
import { suggestAcademicStage } from './academic-stage.js'

test('suggestion uses China calendar boundaries and never invents an out-of-range stage', () => {
  const at = (date: string) => new Date(date)
  assert.equal(suggestAcademicStage(2024, at('2026-10-28T16:00:00Z'), '大三'), 'junior-fall')
  assert.equal(suggestAcademicStage(2024, at('2027-01-10T00:00:00Z'), '大三'), 'junior-winter')
  assert.equal(suggestAcademicStage(2024, at('2027-03-10T00:00:00Z'), '大三'), 'junior-spring')
  assert.equal(suggestAcademicStage(2024, at('2027-07-10T00:00:00Z'), '大三'), 'junior-summer')
  assert.equal(suggestAcademicStage(2026, at('2026-08-31T15:59:59Z'), '大一'), null)
  assert.equal(suggestAcademicStage(2026, at('2026-08-31T16:00:00Z'), '大一'), 'freshman-fall')
  assert.equal(suggestAcademicStage(2020, at('2026-10-01T00:00:00Z')), null)
  assert.equal(suggestAcademicStage(2022, at('2026-07-01T00:00:00Z')), null)
  assert.equal(suggestAcademicStage(null, at('2026-10-01T00:00:00Z')), null)
  assert.equal(suggestAcademicStage(2024, at('2026-10-01T00:00:00Z'), '休学'), null)
  assert.equal(suggestAcademicStage(2025, at('2026-10-01T00:00:00Z'), null), 'sophomore-fall')
  assert.equal(suggestAcademicStage(2026, at('2026-10-01T00:00:00Z'), null), 'freshman-fall')
  assert.equal(suggestAcademicStage(2024, at('2026-10-01T00:00:00Z'), '大二'), 'junior-fall')
})
