import assert from 'node:assert/strict'
import test from 'node:test'
import { scheduleTermStageSchema } from './classroom-workspace.js'
test('import stage is explicit and only real semesters are accepted',()=>{
  for(const stage of ['freshman-fall','freshman-spring','sophomore-fall','sophomore-spring','junior-fall','junior-spring','senior-fall','senior-spring'])
    assert.equal(scheduleTermStageSchema.safeParse(stage).success,true)
  for(const stage of ['',null,'freshman-winter','junior-summer','senior-winter'])
    assert.equal(scheduleTermStageSchema.safeParse(stage).success,false)
})

test('first week Monday validation rejects Sunday and malformed dates', async () => {
  const { isScheduleFirstMonday } = await import('../services/schedule-parser.js')
  assert.equal(isScheduleFirstMonday('2026-09-07'), true)
  for (const date of ['2026-09-06', '2026-09-08', '2026-02-30', '2026-9-7', '', null]) {
    assert.equal(isScheduleFirstMonday(date), false, String(date))
  }
})
