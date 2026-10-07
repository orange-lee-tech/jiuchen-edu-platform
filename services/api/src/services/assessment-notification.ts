export type AssessmentTerminalStatus = 'succeeded' | 'failed'

export type AssessmentNotificationEvent = {
  assessmentId: string
  userId: string
  status: AssessmentTerminalStatus
  failureCode: string | null
  completedAt: Date
}

export type AssessmentNotificationResult = {
  delivered: boolean
  channel: 'none' | 'wechat_subscribe'
  reason: 'not_configured' | 'delivered' | 'delivery_failed'
}

export interface AssessmentNotificationAdapter {
  readonly channel: AssessmentNotificationResult['channel']
  isConfigured(): boolean
  notify(event: AssessmentNotificationEvent): Promise<AssessmentNotificationResult>
}

class DisabledAssessmentNotificationAdapter implements AssessmentNotificationAdapter {
  readonly channel = 'none' as const

  isConfigured() {
    return false
  }

  async notify(
    _event: AssessmentNotificationEvent,
  ): Promise<AssessmentNotificationResult> {
    return {
      delivered: false,
      channel: this.channel,
      reason: 'not_configured',
    }
  }
}

export function createAssessmentNotificationAdapter(): AssessmentNotificationAdapter {
  // WeChat subscribe-message delivery is intentionally not fabricated here.
  // A future adapter can implement the same contract once a real template,
  // user opt-in flow and production credentials are available.
  return new DisabledAssessmentNotificationAdapter()
}
