import assert from 'node:assert/strict'
import test from 'node:test'
import { courseAssociationOptions, factDraftFrom, parseCredits, saveCourseSteps } from '../miniprogram/pages/schedule-import/course-editor'
import type { CourseAcademicFact, ParsedScheduleCourse } from '../miniprogram/utils/request'

const slot = (name: string, courseKey?: string) => ({ name, courseKey }) as ParsedScheduleCourse
const fact = (title: string, courseKey: string) => ({ title, courseKey, credits: 3.5, gradeScale: 'percentage', gradeValue: '89' }) as CourseAcademicFact

test('association candidates retain distinct same-name keys and old confirmed facts', () => {
  const options = courseAssociationOptions([slot('数学', 'a'), slot('数学', 'b'), slot('物理')], [fact('旧课程', 'old')], 'a')
  assert.deepEqual(options, [{ key: 'old', label: '旧课程' }, { key: 'b', label: '数学' }])
})

test('fact draft reads confirmed values and empty values', () => {
  assert.deepEqual(factDraftFrom(fact('数学', 'a')), { credits: '3.5', gradeScale: 'percentage', gradeValue: '89' })
  assert.deepEqual(factDraftFrom(), { credits: '', gradeScale: 'unset', gradeValue: '' })
})

test('credits accept null, zero and two decimal places; reject invalid values', () => {
  assert.equal(parseCredits(''), null)
  assert.equal(parseCredits('0'), 0)
  assert.equal(parseCredits('2.25'), 2.25)
  for (const invalid of ['-1', '30.01', '1.234', 'abc']) assert.equal(parseCredits(invalid), undefined)
})

test('half-success preserves course key for an idempotent fact retry', async () => {
  let scheduleWrites = 0, factWrites = 0
  const saveSchedule = async () => { scheduleWrites++; return true }
  const saveFact = async (key: string) => {
    factWrites++
    assert.equal(key, 'stable-key')
    if (factWrites === 1) throw new Error('network')
    return { courseKey: key }
  }
  const first = await saveCourseSteps(saveSchedule, () => 'stable-key', saveFact)
  assert.equal(first.status, 'fact-failed')
  const retry = await saveCourseSteps(saveSchedule, () => 'stable-key', saveFact)
  assert.equal(retry.status, 'saved')
  assert.equal(scheduleWrites, 2)
  assert.equal(factWrites, 2)
})

test('a failed schedule write never sends a course fact', async () => {
  let factWrites = 0
  const result = await saveCourseSteps(async () => false, () => 'stable-key', async () => { factWrites++ })
  assert.equal(result.status, 'schedule-failed')
  assert.equal(factWrites, 0)
})
