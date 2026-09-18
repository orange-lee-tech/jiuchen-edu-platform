import assert from 'node:assert/strict'
import test from 'node:test'
import { getStageDefinition, isPlanTypeAllowed } from './classroom.js'

test('normal semesters expose GPA, English, competition and research', () => {
  const stage = getStageDefinition('freshman-fall')
  assert.deepEqual(stage?.planTypes, ['gpa', 'english', 'competition', 'research'])
})

test('pre-junior-summer holidays expose only English and competition', () => {
  const stage = getStageDefinition('sophomore-summer')
  assert.deepEqual(stage?.planTypes, ['english', 'competition'])
  assert.equal(isPlanTypeAllowed('sophomore-summer', 'gpa'), false)
})

test('senior stages expose internship only', () => {
  const stage = getStageDefinition('senior-winter')
  assert.deepEqual(stage?.planTypes, ['internship'])
  assert.equal(stage?.mode, 'internship')
  assert.equal(isPlanTypeAllowed('senior-winter', 'research'), false)
})

test('junior summer remains intentionally undefined until product rules define it', () => {
  assert.equal(getStageDefinition('junior-summer'), undefined)
})
