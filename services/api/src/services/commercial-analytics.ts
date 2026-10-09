import type mysql from 'mysql2/promise'

export type AnalyticsPeriod = 'week' | 'month' | 'year'
export type AnalyticsBucket = {
  key: string
  label: string
  assessmentCount: number
  rechargeCount: number
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
  summary: { assessmentCount: number; rechargeCount: number }
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
    return { key, label, assessmentCount: 0, rechargeCount: 0 }
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
): Promise<AssessmentCommerceAnalytics> {
  const { buckets, dateFormat, from, before } = analyticsCalendar(period, now)
  const [[assessmentRows], [paymentRows], [payerRows]] = await Promise.all([
    pool.query<mysql.RowDataPacket[]>(
      `SELECT DATE_FORMAT(completed_at, ?) AS bucketKey, COUNT(*) AS cnt
       FROM assessments
       WHERE status = 'succeeded' AND completed_at >= ? AND completed_at < ?
       GROUP BY bucketKey`,
      [dateFormat, from, before],
    ),
    pool.query<mysql.RowDataPacket[]>(
      `SELECT DATE_FORMAT(paid_at, ?) AS bucketKey, COUNT(*) AS cnt
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
  ])
  const index = new Map(buckets.map(bucket => [bucket.key, bucket]))
  for (const row of assessmentRows) {
    const bucket = index.get(String(row.bucketKey ?? ''))
    if (bucket) bucket.assessmentCount = Number(row.cnt)
  }
  for (const row of paymentRows) {
    const bucket = index.get(String(row.bucketKey ?? ''))
    if (bucket) bucket.rechargeCount = Number(row.cnt)
  }
  return {
    period, buckets,
    summary: {
      assessmentCount: buckets.reduce((n, row) => n + row.assessmentCount, 0),
      rechargeCount: buckets.reduce((n, row) => n + row.rechargeCount, 0),
    },
    payers: payerRows.map((row) => ({
      userIdSuffix: String(row.userId).slice(-6),
      displayName: String(row.displayName),
      rechargeCount: Number(row.rechargeCount),
      amountFen: Number(row.amountFen),
    })),
  }
}
