import assert from 'node:assert/strict'
import test from 'node:test'
import { createAssessmentNotificationAdapter } from './assessment-notification.js'

test('default Assessment completion notification adapter is explicitly unconfigured', async () => {
  const adapter = createAssessmentNotificationAdapter()
  assert.equal(adapter.channel, 'none')
  assert.equal(adapter.isConfigured(), false)

  const result = await adapter.notify({
    assessmentId: 'assessment-1',
    userId: 'user-1',
    status: 'succeeded',
    failureCode: null,
    completedAt: new Date('2026-10-06T12:00:00Z'),
  })

  assert.deepEqual(result, {
    delivered: false,
    channel: 'none',
    reason: 'not_configured',
  })
})
