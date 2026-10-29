import test from 'node:test'
import assert from 'node:assert/strict'
import { assessmentDraftInputSchema, assessmentInputSchema } from './assessment.js'

test('blank and incomplete drafts retain partial entries in order', () => {
  const input = { profile: { university: '', major: '', currentGrade: '' }, targets: [
    { schoolName: '', programName: '物理' }, { schoolName: '示例院校', note: '' },
  ], research: [{ title: '', description: '未完成的研究经历' }] }
  assert.deepEqual(assessmentDraftInputSchema.parse(input), input)
  assert.equal(assessmentDraftInputSchema.safeParse({}).success, true)
  assert.equal(assessmentDraftInputSchema.safeParse({ profile: { university: '某校' }, targets: [] }).success, true)
  assert.equal(assessmentDraftInputSchema.safeParse({ english: [{ type: '', score: '' }], research: [{ type: '', title: '' }] }).success, true)
  assert.equal(assessmentInputSchema.safeParse(input).success, false)
})

test('draft bounds and types remain enforced and complete input passes formal validation', () => {
  assert.equal(assessmentDraftInputSchema.safeParse({ targets: Array(6).fill({ schoolName: '' }) }).success, false)
  assert.equal(assessmentDraftInputSchema.safeParse({ profile: { university: 'a'.repeat(161) } }).success, false)
  assert.equal(assessmentDraftInputSchema.safeParse({ targets: 'bad' }).success, false)
  assert.equal(assessmentInputSchema.safeParse({ profile: { university: '某校', major: '物理', currentGrade: '大三' },
    targets: [{ schoolName: '某校' }] }).success, true)
})
