import test from 'node:test'
import assert from 'node:assert/strict'
import { planDueDateSchema, upcomingTaskWindow } from './plan-dates.js'

test('dueDate is an actual calendar date, not target text or a timestamp', () => {
  for (const value of ['2028-02-29', '2026-10-29', '1000-01-01', '9999-12-31']) assert.ok(planDueDateSchema.safeParse(value).success)
  for (const value of ['2026-02-29', '2026-04-31', '2026-13-01', '0000-01-01', '2026-1-2', '尽快完成', '2026-10-29T00:00:00Z', ''])
    assert.equal(planDueDateSchema.safeParse(value).success, false, value)
})

test('upcoming window includes exactly three Beijing calendar dates across UTC midnight', () => {
  assert.deepEqual(upcomingTaskWindow(new Date('2026-10-28T15:59:59Z')), { from: '2026-10-28', to: '2026-10-30' })
  assert.deepEqual(upcomingTaskWindow(new Date('2026-10-28T16:00:00Z')), { from: '2026-10-29', to: '2026-10-31' })
})

test('upcoming window handles month/year and leap-year boundaries', () => {
  for (const [date, to] of [['2026-12-31', '2027-01-02'], ['2028-02-28', '2028-03-01'], ['2027-02-28', '2027-03-02']])
    assert.deepEqual(upcomingTaskWindow(new Date(`${date}T00:00:00Z`)), { from: date, to })
})
