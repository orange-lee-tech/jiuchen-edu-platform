import assert from 'node:assert/strict'
import test from 'node:test'
import { isAcademicProfileCurrent } from './assessments.js'
import type { z } from 'zod'
import { assessmentInputSchema } from '../domain/assessment.js'

const academic = {
  university: '中南大学', major: '能源与动力工程', currentGrade: '大四',
  gpaText: '3.8', rankText: '10/100',
}
const input: z.infer<typeof assessmentInputSchema>['profile'] = {
  ...academic, backgroundNote: '这段说明允许在评估页填写',
}

test('academic fields must exactly match the canonical account profile', () => {
  assert.equal(isAcademicProfileCurrent(input, academic), true)
  assert.equal(isAcademicProfileCurrent(input, { ...academic, major: '机械工程' }), false)
  assert.equal(isAcademicProfileCurrent(input, null), false)
  assert.equal(isAcademicProfileCurrent({ ...input, gpaText: null }, academic), false)
  assert.equal(isAcademicProfileCurrent({ ...input, backgroundNote: '自行填写的科研背景' }, academic), true)
})
