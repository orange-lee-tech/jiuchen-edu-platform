import test from 'node:test'
import assert from 'node:assert/strict'
import { suggestAcademicStage } from './academic-stage.js'

test('suggestion uses China calendar boundaries and never invents an out-of-range stage', () => {
  const at = (date: string) => new Date(date)
  assert.equal(suggestAcademicStage(2024, at('2026-10-28T16:00:00Z')), 'junior-fall')
  assert.equal(suggestAcademicStage(2024, at('2027-01-10T00:00:00Z')), 'junior-winter')
  assert.equal(suggestAcademicStage(2024, at('2027-03-10T00:00:00Z')), 'junior-spring')
  assert.equal(suggestAcademicStage(2024, at('2027-07-10T00:00:00Z')), 'junior-summer')
  assert.equal(suggestAcademicStage(2026, at('2026-08-31T15:59:59Z')), null)
  assert.equal(suggestAcademicStage(2026, at('2026-08-31T16:00:00Z')), 'freshman-fall')
  assert.equal(suggestAcademicStage(2020, at('2026-10-01T00:00:00Z')), null)
  assert.equal(suggestAcademicStage(2022, at('2026-07-01T00:00:00Z')), null)
  assert.equal(suggestAcademicStage(null, at('2026-10-01T00:00:00Z')), null)
})
