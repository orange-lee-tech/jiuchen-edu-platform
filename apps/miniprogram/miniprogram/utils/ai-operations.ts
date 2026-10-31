import { request } from './request'

export type OfficialObjectBalance = {
  object: { id: string; label: string; provider: string; model: string; version: number }
  status: 'unsupported' | 'unavailable' | 'fresh' | 'stale' | 'never_read'; lastError: string | null
  balances: Array<{ id: string; currency: string; balance: string; grantedBalance: string; toppedUpBalance: string;
    observedAt: string; sourceUrl: string; warningThreshold: string; fresh: boolean; lowBalance: boolean | null }>
  windows: Array<{ assessmentId: string; status: string; reason: string; startedAt: string; completedAt: string | null;
    differences: Array<{ currency: string; difference: string; status: string }> }>
  attribution: string; attributionReason: string
}
export type OfficialPriceDraft = { model: string; currency: string; unit: string;
  inputCacheHitPerMillion: number; inputCacheMissPerMillion: number; outputPerMillion: number;
  peakInputCacheHitPerMillion: number; peakInputCacheMissPerMillion: number; peakOutputPerMillion: number; peakWindowUtc: string }
export function changeAssessmentObjectModel(id: string, data: {
  expectedVersion: number; expectedObjectVersion: number; currentPin: string; model: string
}) { return request(`/me/admin/assessment-keys/${encodeURIComponent(id)}/change-model`, 'POST', data) }
export async function getOfficialObjectBalance(id: string) {
  return (await request<{ ok: true; balance: OfficialObjectBalance }>(`/me/admin/ai-operations/${encodeURIComponent(id)}/balance`)).balance
}
export async function refreshOfficialObjectBalance(id: string) {
  return (await request<{ ok: true; balance: OfficialObjectBalance }>(`/me/admin/ai-operations/${encodeURIComponent(id)}/balance/refresh`, 'POST', {})).balance
}
export async function saveOfficialBalanceThreshold(id: string, currency: string, warningThreshold: string) {
  return (await request<{ ok: true; balance: OfficialObjectBalance }>(`/me/admin/ai-operations/${encodeURIComponent(id)}/balance/threshold`, 'PUT', { currency, warningThreshold })).balance
}
export function checkOfficialPriceDraft() {
  return request<{ ok: true; status: string; sourceUrl: string; fetchedAt: string; parserVersion: string;
    drafts: OfficialPriceDraft[]; parseError: string | null }>('/me/admin/assessment-ai-prices/check-source', 'POST', {})
}
export function reviewOfficialPrice(data: { model: string; expectedLatestVersion: string | null;
  inputCacheHitPerMillion: number; inputCacheMissPerMillion: number; outputPerMillion: number;
  peakInputCacheHitPerMillion: number | null; peakInputCacheMissPerMillion: number | null; peakOutputPerMillion: number | null;
  peakWindowUtc: string | null; effectiveAt: string; reviewNote: string }) {
  return request('/me/admin/assessment-ai-prices/review', 'POST', data)
}
