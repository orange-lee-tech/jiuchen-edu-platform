import assert from 'node:assert/strict'
import test from 'node:test'
import { adminPlanPayloadSchema, toAdminPlanItemRow } from './admin.js'

test('admin plan writes preserve a validated due date for database persistence', () => {
  const parsed = adminPlanPayloadSchema.safeParse({
    title: '申请规划',
    items: [{ name: '提交材料', target: '完成材料清单', dueDate: '2026-11-15', status: 'pending' }],
  })
  assert.equal(parsed.success, true)
  if (!parsed.success) return
  const row = toAdminPlanItemRow('plan-1', parsed.data.items[0]!, 0)
  assert.equal(row.dueDate, '2026-11-15')
  assert.equal(row.planId, 'plan-1')
  assert.equal(row.sortOrder, 0)
})

test('admin plan rejects invalid calendar dates instead of silently dropping them', () => {
  const parsed = adminPlanPayloadSchema.safeParse({
    title: '申请规划',
    items: [{ name: '提交材料', dueDate: '2026-02-29', status: 'pending' }],
  })
  assert.equal(parsed.success, false)
})
