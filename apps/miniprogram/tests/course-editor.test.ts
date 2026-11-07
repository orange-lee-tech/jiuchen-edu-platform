import assert from 'node:assert/strict'
import test from 'node:test'
import { courseAssociationOptions, courseFactFromGrowthRecord, factDraftFrom, factDraftError, parseCredits, sameCourseContext, saveCourseSteps } from '../miniprogram/pages/schedule-import/course-editor'
import type { CanonicalGrowthRecord, CourseAcademicFact, ParsedScheduleCourse } from '../miniprogram/utils/request'

const slot = (name: string, courseKey?: string) => ({ name, courseKey }) as ParsedScheduleCourse
const fact = (title: string, courseKey: string, stageCode = 'freshman-fall') => ({ title, courseKey, stageCode, credits: 3.5, gradeScale: 'percentage', gradeValue: '89' }) as CourseAcademicFact

test('association candidates retain distinct same-name keys and old confirmed facts', () => {
  const options = courseAssociationOptions([slot('数学', 'a'), slot('数学', 'b'), slot('物理')], [fact('旧课程', 'old'), fact('另学期', 'other', 'sophomore-fall')], 'a', 'freshman-fall')
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

test('growth record exposes only confirmed structured course facts for dedicated editing', () => {
  const record = {
    id: 'record', type: 'course', title: '数学', updatedAt: '2026-11-07',
    source: { type: 'classroom', recordId: null, key: 'source' },
    confirmations: { user: true, teacher: false, admin: false },
    metadata: { schemaVersion: 'course-academic-fact-v1', stageCode: 'freshman-fall',
      courseKey: '3ba737aa-5af4-42ca-b24e-b85e56d9bb85', credits: 0,
      gradeScale: 'percentage', gradeValue: '100' },
  } as CanonicalGrowthRecord
  assert.equal(courseFactFromGrowthRecord(record)?.credits, 0)
  assert.equal(courseFactFromGrowthRecord({ ...record, confirmations: { ...record.confirmations, user: false } }), null)
  assert.equal(courseFactFromGrowthRecord({ ...record, metadata: { ...record.metadata, courseKey: 'wrong' } }), null)
  assert.equal(courseFactFromGrowthRecord({ ...record, source: { ...record.source, type: 'manual' } }), null)
})


test('grade validation matches strict API boundaries before writing the timetable', () => {
  const base = { credits: '3', gradeScale: 'percentage', gradeValue: '89' } as const
  assert.equal(factDraftError(base), null)
  assert.equal(factDraftError({ ...base, gradeValue: '101' }), '成绩超出所选计分制的范围，或超过两位小数。')
  assert.equal(factDraftError({ ...base, gradeValue: '88.123' }), '成绩超出所选计分制的范围，或超过两位小数。')
  assert.equal(factDraftError({ ...base, gradeScale: 'four_point', gradeValue: '4.01' }), '成绩超出所选计分制的范围，或超过两位小数。')
  assert.equal(factDraftError({ ...base, gradeScale: 'letter', gradeValue: 'Z' }), '字母成绩格式无效，请按 A、B+ 等等级填写。')
  assert.equal(factDraftError({ ...base, gradeScale: 'pass_fail', gradeValue: '未合格' }), '通过情况只接受“通过”或“未通过”。')
  assert.equal(factDraftError({ ...base, gradeScale: 'unset', gradeValue: '89' }), '未录入成绩时请清空成绩内容。')
  assert.equal(factDraftError({ ...base, gradeScale: 'unset', gradeValue: '' }), null)
  assert.equal(factDraftError({ ...base, credits: '30.001' }), '学分需为 0–30，最多两位小数。')
})


test('pending fact responses belong to one account, schedule import and term', () => {
  const expected = { owner: 'alice', importId: 'import-one', stageCode: 'freshman-fall' }
  assert.equal(sameCourseContext(expected, { ...expected }), true)
  assert.equal(sameCourseContext(expected, { ...expected, owner: 'bob' }), false)
  assert.equal(sameCourseContext(expected, { ...expected, importId: 'import-two' }), false)
  assert.equal(sameCourseContext(expected, { ...expected, stageCode: 'sophomore-fall' }), false)
})
