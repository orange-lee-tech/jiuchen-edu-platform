export const DEEPSEEK_BALANCE_URL = 'https://api.deepseek.com/user/balance'
export type OfficialBalance = { available: boolean; observedAt: string; source: string;
  balances: Array<{ currency: 'CNY' | 'USD'; total: string; granted: string; toppedUp: string }> }

export function parseOfficialDeepseekBalance(payload: unknown, observedAt = new Date().toISOString()): OfficialBalance {
  if (!payload || typeof payload !== 'object') throw new Error('provider_balance_invalid_response')
  const data = payload as Record<string, unknown>
  if (typeof data.is_available !== 'boolean' || !Array.isArray(data.balance_infos) ||
      !data.balance_infos.length || data.balance_infos.length > 4) throw new Error('provider_balance_invalid_response')
  const amount = (value: unknown) => {
    if (typeof value !== 'string' || !/^\d{1,14}(?:\.\d{1,8})?$/.test(value)) throw new Error('provider_balance_invalid_response')
    return value
  }
  const currencies = new Set<string>()
  const balances = data.balance_infos.map((info: unknown) => {
    if (!info || typeof info !== 'object') throw new Error('provider_balance_invalid_response')
    const row = info as Record<string, unknown>
    if ((row.currency !== 'CNY' && row.currency !== 'USD') || currencies.has(row.currency)) throw new Error('provider_balance_invalid_response')
    currencies.add(row.currency)
    return { currency: row.currency as 'CNY' | 'USD', total: amount(row.total_balance),
      granted: amount(row.granted_balance), toppedUp: amount(row.topped_up_balance) }
  })
  return { available: data.is_available, observedAt, source: DEEPSEEK_BALANCE_URL, balances }
}

/** Fixed official endpoint only. Credentials and provider bodies never become public errors. */
export async function fetchOfficialDeepseekBalance(apiKey: string, transport: typeof fetch = fetch) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await transport(DEEPSEEK_BALANCE_URL, { method: 'GET', redirect: 'error',
      headers: { Authorization: `Bearer ${apiKey}` }, signal: controller.signal })
    if (!response.ok) return { status: 'unavailable' as const, httpStatus: response.status,
      error: response.status === 401 || response.status === 403 ? 'provider_balance_authentication' : 'provider_balance_http_error' }
    const body = await response.text()
    if (body.length > 16384) throw new Error('provider_balance_invalid_response')
    return { status: 'official_observation' as const, ...parseOfficialDeepseekBalance(JSON.parse(body)), httpStatus: 200 }
  } catch (error) {
    return { status: 'unavailable' as const, httpStatus: null,
      error: error instanceof Error && error.message === 'provider_balance_invalid_response' ? error.message : 'provider_balance_unavailable' }
  } finally { clearTimeout(timeout) }
}
