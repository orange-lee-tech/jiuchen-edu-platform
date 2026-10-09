import type mysql from 'mysql2/promise'
import type { AppEnv } from '../config/env.js'

export type AnalyticsPeriod = 'week' | 'month' | 'year'

export type SupplierRisk = {
  status: 'missing' | 'stale' | 'critical' | 'warning' | 'normal' | 'early_stage'
  message: string
  availableFen: number | null
  observedAt: string | null
  estimatedDailyFen: number | null
  estimatedRunwayDays: number | null
  sampleRuns7Days: number
  forecastBasedOn: 'manual_estimate' | 'unavailable'
}

/**
 * Monitoring is conservative: commercial orders do NOT pay vendor invoices.
 * Without a provider account balance supplied through an approved read-only
 * integration, no mathematical inference can assert that model credit is safe.
 * A stale balance observation fails closed to an explicit attention state.
 */
export function computeSupplierRisk(params: {
  balanceFen?: number
  observedAt?: string
  costFenPerRun?: number
  runs7d: number
  now?: Date
  warningDays?: number
}): SupplierRisk {
  const now = params.now ?? new Date()
  const observed = params.observedAt ? new Date(params.observedAt) : null
  const observedAt = observed && !Number.isNaN(observed.getTime()) ? observed.toISOString() : null
  const base: SupplierRisk = {
    status: 'missing', message: '供应商可用余额未接入；管理员必须向运营负责人核实充值。',
    availableFen: params.balanceFen ?? null,
    observedAt, estimatedDailyFen: null,
    estimatedRunwayDays: null,
    sampleRuns7Days: params.runs7d,
    forecastBasedOn: 'unavailable',
  }
  if (params.balanceFen === undefined || !observedAt || !params.costFenPerRun) return base
  const ageHours = (now.getTime() - new Date(observedAt).getTime()) / 3600000
  if (ageHours < -1 || ageHours > 24) return {
    ...base, status: 'stale', message: '余额读数已超过24小时，不能当作实时可用余额；请向运营确认。',
  }
  const cost = params.costFenPerRun
  const warning = params.warningDays ?? 14
  const estimatedDailyFen = Math.max(1, (params.runs7d / 7) * cost)
  const runway = params.balanceFen / estimatedDailyFen
  const common = { ...base, estimatedDailyFen, estimatedRunwayDays: Math.floor(runway), forecastBasedOn: 'manual_estimate' as const }
  if (params.balanceFen < cost * 10 || runway < 7) {
    return { ...common, status: 'critical', message: '余额预计不足7天或不足10次评估成本：请立即提醒运营负责人充值。' }
  }
  if (runway < warning) {
    return { ...common, status: 'warning', message: '余额预计不足预警天数：请提前通知运营负责人。' }
  }
  if (params.runs7d < 14) {
    return { ...common, status: 'early_stage', message: '近期样本不足14次，无法据此判断长期消耗；建议按运营储备策略备付。' }
  }
  return { ...common, status: 'normal', message: '按近7天估算暂未触发预警；仍需定时核验供应商余额。' }
}

export type AnalyticsBucket = {
  key: string
  label: string
  assessmentCount: number
  rechargeCount: number
  rechargeCreditCount: number
}
export type PayerRank = {
  userIdSuffix: string
  displayName: string
  rechargeCount: number
  amountFen: number
}
export type AssessmentCommerceAnalytics = {
  period: AnalyticsPeriod
  buckets: AnalyticsBucket[]
  summary: { assessmentCount: number; rechargeCount: number; rechargeCreditCount: number }
  supplier: SupplierRisk
  payers: PayerRank[]
}

// Fixed UTC+8 product calendar; SQL driver/pool session timezone must be verified
// at deployment. No full assessment/payment row payloads are loaded into Node.
function calendarToday(now: Date) {
  const shifted = new Date(now.getTime() + 8 * 3_600_000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  }
}
function utcCalendarDay(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m, d))
}
function dayKey(date: Date) { return date.toISOString().slice(0, 10) }
function monthKey(date: Date) { return date.toISOString().slice(0, 7) }
function yearKey(date: Date) { return date.toISOString().slice(0, 4) }

export function analyticsCalendar(period: AnalyticsPeriod, now = new Date()) {
  const { year, month, day } = calendarToday(now)
  const count = period === 'week' ? 7 : period === 'month' ? 12 : 5
  const begin = period === 'week'
    ? utcCalendarDay(year, month, day - 6)
    : period === 'month'
      ? utcCalendarDay(year, month - 11, 1)
      : utcCalendarDay(year - 4, 0, 1)
  const next = period === 'week'
    ? utcCalendarDay(year, month, day + 1)
    : period === 'month'
      ? utcCalendarDay(year, month + 1, 1)
      : utcCalendarDay(year + 1, 0, 1)

  const buckets = Array.from({ length: count }, (_, index) => {
    const date = period === 'week'
      ? utcCalendarDay(begin.getUTCFullYear(), begin.getUTCMonth(), begin.getUTCDate() + index)
      : period === 'month'
        ? utcCalendarDay(begin.getUTCFullYear(), begin.getUTCMonth() + index, 1)
        : utcCalendarDay(begin.getUTCFullYear() + index, 0, 1)
    const key = period === 'week' ? dayKey(date) : period === 'month' ? monthKey(date) : yearKey(date)
    const label = period === 'week' ? key.slice(5).replace('-', '/') : period === 'month' ? key.slice(2).replace('-', '/') : key
    return { key, label, assessmentCount: 0, rechargeCount: 0, rechargeCreditCount: 0 }
  })

  return {
    buckets,
    dateFormat: period === 'week' ? '%Y-%m-%d' : period === 'month' ? '%Y-%m' : '%Y',
    // DATETIME-style SQL boundaries are interpreted in the database session
    // timezone. Production migration gate must verify it is +08:00.
    from: dayKey(begin) + ' 00:00:00',
    before: dayKey(next) + ' 00:00:00',
  }
}

export async function readAssessmentCommerceAnalytics(
  pool: mysql.Pool,
  period: AnalyticsPeriod,
  now = new Date(),
  env?: AppEnv,
): Promise<AssessmentCommerceAnalytics> {
  const { buckets, dateFormat, from, before } = analyticsCalendar(period, now)
  const [[assessmentRows], [paymentRows], [payerRows], [usageRows]] = await Promise.all([
    pool.query<mysql.RowDataPacket[]>(
      `SELECT DATE_FORMAT(completed_at, ?) AS bucketKey, COUNT(*) AS cnt
       FROM assessments
       WHERE status = 'succeeded' AND completed_at >= ? AND completed_at < ?
       GROUP BY bucketKey`,
      [dateFormat, from, before],
    ),
    pool.query<mysql.RowDataPacket[]>(
      `SELECT DATE_FORMAT(paid_at, ?) AS bucketKey, COUNT(*) AS cnt,
              COALESCE(SUM(credit_amount),0) AS creditCount
       FROM payment_orders
       WHERE status = 'paid' AND paid_at >= ? AND paid_at < ?
       GROUP BY bucketKey`,
      [dateFormat, from, before],
    ),
    pool.query<mysql.RowDataPacket[]>(
      `SELECT u.id AS userId, COALESCE(NULLIF(u.display_name, ''), '未设置昵称') AS displayName,
              COUNT(*) AS rechargeCount, SUM(p.amount_fen) AS amountFen
       FROM payment_orders p
       INNER JOIN users u ON u.id = p.user_id
       WHERE p.status = 'paid'
       GROUP BY u.id, u.display_name
       ORDER BY amountFen DESC, u.id ASC
       LIMIT 20`,
    ),
    pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM assessments
       WHERE status='succeeded' AND completed_at >= ? AND completed_at < ?`,
      [new Date(now.getTime()-7*86400000), now],
    ),
  ])
  const index = new Map(buckets.map(bucket => [bucket.key, bucket]))
  for (const row of assessmentRows) {
    const bucket = index.get(String(row.bucketKey ?? ''))
    if (bucket) bucket.assessmentCount = Number(row.cnt)
  }
  for (const row of paymentRows) {
    const bucket = index.get(String(row.bucketKey ?? ''))
    if (bucket) {
      bucket.rechargeCount = Number(row.cnt)
      bucket.rechargeCreditCount = Number(row.creditCount)
    }
  }
  return {
    period, buckets,
    summary: {
      assessmentCount: buckets.reduce((n, row) => n + row.assessmentCount, 0),
      rechargeCount: buckets.reduce((n, row) => n + row.rechargeCount, 0),
      rechargeCreditCount: buckets.reduce((n, row) => n + row.rechargeCreditCount, 0),
    },
    supplier: computeSupplierRisk({
      balanceFen: env?.AI_SUPPLIER_BALANCE_FEN,
      observedAt: env?.AI_SUPPLIER_BALANCE_OBSERVED_AT,
      costFenPerRun: env?.AI_COST_ESTIMATE_FEN_PER_RUN,
      runs7d: Number(usageRows[0]?.cnt ?? 0),
      warningDays: env?.AI_SUPPLIER_ALERT_DAYS,
      now,
    }),
    payers: payerRows.map((row) => ({
      userIdSuffix: String(row.userId).slice(-6),
      displayName: String(row.displayName),
      rechargeCount: Number(row.rechargeCount),
      amountFen: Number(row.amountFen),
    })),
  }
}
