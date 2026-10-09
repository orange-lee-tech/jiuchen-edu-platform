import assert from 'node:assert/strict'
import test from 'node:test'
import { scheduleTermStageSchema } from './classroom-workspace.js'
test('import stage is explicit and only real semesters are accepted',()=>{
  for(const stage of ['freshman-fall','freshman-spring','sophomore-fall','sophomore-spring','junior-fall','junior-spring','senior-fall','senior-spring'])
    assert.equal(scheduleTermStageSchema.safeParse(stage).success,true)
  for(const stage of ['',null,'freshman-winter','junior-summer','senior-winter'])
    assert.equal(scheduleTermStageSchema.safeParse(stage).success,false)
})
