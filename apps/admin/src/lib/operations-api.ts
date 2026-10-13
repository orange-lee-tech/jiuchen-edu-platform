/** Read-only operations adapter. The caller owns a short-lived token in memory. */
export type SourceState = { status: 'ok' | 'error'; error: string | null }
export type Period = 'week' | 'month' | 'year'
export type Analytics = {
  period: Period
  range: { from: string; before: string; timezone: string; basis: string }
  sources: Record<'assessments' | 'payments' | 'ledger' | 'reservations', SourceState>
  summary: { assessmentCount: number; createdCount: number; startedTaskCount: number; failedCount: number; runningCount: number; rechargeCount: number | null; rechargeCreditCount: number | null; rechargeAmountFen: number | null; consumptionCount: number | null; releasedCount: number | null }
  buckets: Array<{ key: string; label: string; assessmentCount: number; createdCount: number; startedTaskCount: number; failedCount: number; runningCount: number; rechargeCount: number | null; rechargeCreditCount: number | null; rechargeAmountFen: number | null; consumptionCount: number | null; releasedCount: number | null }>
  payers: Array<{ userIdSuffix: string; displayName: string; rechargeCount: number; amountFen: number }>
  ledger: { freeGranted: number | null; paidGranted: number | null; debitedCredits: number | null; balance: number | null; freeUsed: null; paidUsed: null; sourceAllocationStatus: 'not_recorded'; correctionCredits: number | null }
  reservations: { held: number | null; released: number | null }
  gaps: { successWithoutCompletedAt: number; successWithoutDebit: number | null; suspectEightHourCompletionCount: number }
  supplier: { status: string; message: string; availableFen: number | null; observedAt: string | null }
}
export type InternalIdentity = {
  id: string; businessId: string; type: 'student' | 'teacher' | 'admin'; status: 'available' | 'claimed' | 'disabled'
  userId: string | null; nameLabel: string; schoolLabel: string | null; assignmentLabel: string
  assignmentState: 'unclaimed' | 'assigned' | 'unassigned' | 'not_recorded'
  profileState: 'unclaimed' | 'incomplete' | 'recorded'; userStatus: string | null
  auditCategory: 'test_named_bound' | 'test_named_unclaimed' | 'no_test_name'
}
export type NewsRow = {
  id: string; title: string; tags: string[]; status: 'active' | 'hidden'; source: 'manual' | 'wechat_official'
  publishedAt: string | null; sourceUpdatedAt: string | null; publicationTimeSource: 'manual' | 'explicit_publish_time' | 'unverified'
}
export type SyncHistory = { lastCheckedAt: string | null; lastFailedAt: string | null; latestSourceUpdatedAt: string | null; fetched: number; created: number; updated: number; failed: number; lastError: string | null }
export type NewsOverview = { posts: NewsRow[]; newsV2Enabled: boolean; syncHistory: SyncHistory | null }

export class OperationsError extends Error {
  readonly status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

async function read<T>(path: string, token: string, transport: typeof fetch): Promise<T> {
  const response = await transport('/api' + path, {
    method: 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
  })
  let result: unknown
  try { result = await response.json() } catch { throw new OperationsError(response.status, '接口返回格式错误') }
  if (!response.ok) {
    const code = result && typeof result === 'object' && 'error' in result ? String(result.error) : ''
    throw new OperationsError(response.status, response.status === 401 ? '会话已失效，请重新认证' : response.status === 403 ? '此账号没有管理员权限' : `接口失败 HTTP ${response.status}${code ? ' / ' + code : ''}`)
  }
  if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) {
    throw new OperationsError(response.status, '接口未确认成功')
  }
  return result as T
}

export function operationsClient(token: string, transport: typeof fetch = fetch) {
  if (!token.trim()) throw new OperationsError(401, '缺少管理员会话')
  return {
    async verifyAdmin() {
      const result = await read<{ ok: true; user: { role: string; displayName: string | null } }>('/auth/me', token, transport)
      if (result.user.role !== 'admin') throw new OperationsError(403, '此账号没有管理员权限')
      return result.user
    },
    async analytics(period: Period) {
      const result = await read<{ ok: true; analytics: Analytics }>(`/me/admin/assessment-analytics?period=${period}`, token, transport)
      if (!result.analytics?.sources || !result.analytics.range) throw new OperationsError(200, '统计接口版本不匹配')
      return result.analytics
    },
    async identities() {
      const result = await read<{ ok: true; internalIds: InternalIdentity[] }>('/me/admin/internal-ids', token, transport)
      if (!Array.isArray(result.internalIds)) throw new OperationsError(200, '身份接口版本不匹配')
      return result.internalIds
    },
    async news() {
      const result = await read<{ ok: true; posts: NewsRow[]; newsV2Enabled?: boolean; syncHistory?: SyncHistory | null }>('/me/admin/news', token, transport)
      if (!Array.isArray(result.posts)) throw new OperationsError(200, '资讯接口版本不匹配')
      return { posts: result.posts, newsV2Enabled: Boolean(result.newsV2Enabled), syncHistory: result.syncHistory ?? null } as NewsOverview
    },
  }
}
