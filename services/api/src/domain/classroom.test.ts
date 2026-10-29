import assert from 'node:assert/strict'
import test from 'node:test'
import { getStageDefinition, isGuidanceAllowed, isPlanTypeAllowed } from './classroom.js'

test('normal semesters expose GPA, English, competition and research', () => {
  const stage = getStageDefinition('freshman-fall')
  assert.deepEqual(stage?.planTypes, ['gpa', 'english', 'competition', 'research'])
})

test('pre-junior-summer holidays expose English and competition', () => {
  const stage = getStageDefinition('sophomore-summer')
  assert.deepEqual(stage?.planTypes, ['english', 'competition'])
  assert.equal(isPlanTypeAllowed('sophomore-summer', 'competition'), true)
  assert.equal(isPlanTypeAllowed('sophomore-summer', 'gpa'), false)
})

test('senior stages expose internship only', () => {
  const stage = getStageDefinition('senior-winter')
  assert.deepEqual(stage?.planTypes, ['internship'])
  assert.equal(stage?.mode, 'internship')
  assert.equal(isPlanTypeAllowed('senior-winter', 'research'), false)
})

test('junior summer stays visible in the prototype timeline without invented plan rules', () => {
  const stage = getStageDefinition('junior-summer')
  assert.equal(stage?.label, '大三暑假')
  assert.deepEqual(stage?.planTypes, [])
})


test('guidance is hidden for senior internship stages and unknown stages', () => {
  assert.equal(isGuidanceAllowed('senior-fall'), false)
  assert.equal(isGuidanceAllowed('senior-winter'), false)
  assert.equal(isGuidanceAllowed('senior-spring'), false)
  assert.equal(isGuidanceAllowed('junior-spring'), true)
  assert.equal(isGuidanceAllowed('junior-summer'), true)
  assert.equal(isGuidanceAllowed('unknown-stage'), false)
})
