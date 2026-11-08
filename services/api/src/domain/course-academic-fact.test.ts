import assert from 'node:assert/strict'
import test from 'node:test'
import { courseAcademicFactWriteSchema, courseFactSourceKey, isProtectedCourseFact } from './course-academic-fact.js'

const base = { stageCode: 'junior-fall', credits: null, gradeScale: 'unset', gradeValue: null }

test('course facts accept blank, zero and fractional credits without inferring a GPA', () => {
  for (const credits of [null, 0, 0.5, 1.25, 30]) assert.equal(courseAcademicFactWriteSchema.safeParse({ ...base, credits }).success, true)
  for (const credits of [-1, 0.001, 30.01]) assert.equal(courseAcademicFactWriteSchema.safeParse({ ...base, credits }).success, false)
  assert.equal(courseAcademicFactWriteSchema.safeParse({ ...base, gradeScale: 'unset', gradeValue: '85' }).success, false)
})

test('grade scales enforce boundaries and controlled grades', () => {
  for (const [gradeScale, valid, invalid] of [
    ['percentage', '100', '100.01'], ['four_point', '4.00', '4.01'], ['five_point', '5', '5.01'],
    ['letter', 'A-', 'A++'], ['pass_fail', '通过', '合格'], ['other', '优秀', ''],
  ] as const) {
    assert.equal(courseAcademicFactWriteSchema.safeParse({ ...base, gradeScale, gradeValue: valid }).success, true)
    assert.equal(courseAcademicFactWriteSchema.safeParse({ ...base, gradeScale, gradeValue: invalid }).success, false)
  }
  assert.equal(courseAcademicFactWriteSchema.safeParse({ ...base, gradeScale: 'percentage', gradeValue: null }).success, true)
  assert.equal(courseAcademicFactWriteSchema.safeParse({ ...base, gradeScale: 'percentage', gradeValue: '-1' }).success, false)
})

test('source identity includes authenticated owner and stage; generic writes protect course metadata', () => {
  const key = '6b1db1b5-0c1c-438d-a317-66a1d4e72c18'
  assert.notEqual(courseFactSourceKey('owner-a', 'junior-fall', key), courseFactSourceKey('owner-b', 'junior-fall', key))
  assert.notEqual(courseFactSourceKey('owner-a', 'junior-fall', key), courseFactSourceKey('owner-a', 'senior-fall', key))
  assert.equal(isProtectedCourseFact({ schemaVersion: 'course-academic-fact-v1' }), true)
  assert.equal(isProtectedCourseFact({ schemaVersion: 'other' }), false)
})
