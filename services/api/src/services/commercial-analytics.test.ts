import assert from 'node:assert/strict'
import test from 'node:test'
import { analyticsCalendar } from './commercial-analytics.js'

test('analytics weeks yield seven consecutive local days even over month boundary', () => {
  const x = analyticsCalendar('week', new Date('2026-10-09T15:00:00.000Z'))
  assert.deepEqual(x.buckets.map(b => b.key), [
    '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06',
    '2026-10-07', '2026-10-08', '2026-10-09',
  ])
  assert.equal(x.before, '2026-10-10 00:00:00')
})

test('monthly and yearly periods include zero-filled buckets', () => {
  const monthly = analyticsCalendar('month', new Date('2026-10-09T02:00:00.000Z'))
  assert.equal(monthly.buckets.length, 12)
  assert.equal(monthly.buckets[0].key, '2025-11')
  assert.equal(monthly.buckets[11].key, '2026-10')
  const yearly = analyticsCalendar('year', new Date('2026-10-09T02:00:00.000Z'))
  assert.deepEqual(yearly.buckets.map(b => b.key), ['2022','2023','2024','2025','2026'])
  assert.equal(yearly.buckets.every(b => b.assessmentCount === 0 && b.rechargeCount === 0), true)
})
