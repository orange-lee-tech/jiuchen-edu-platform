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
  key:string;label:string;assessmentCount:number;createdCount:number;startedTaskCount:number;failedCount:number;runningCount:number;
  rechargeCount:number|null;rechargeCreditCount:number|null;rechargeAmountFen:number|null;consumptionCount:number|null;releasedCount:number|null;
}
export type PayerRank={userIdSuffix:string;displayName:string;rechargeCount:number;amountFen:number}
export type DataSourceState={status:'ok'|'error';error:string|null}
export type AssessmentCommerceAnalytics={
  period:AnalyticsPeriod;buckets:AnalyticsBucket[];
  summary:{assessmentCount:number;createdCount:number;startedTaskCount:number;failedCount:number;runningCount:number;assessmentUserCount:number;
    rechargeCount:number|null;rechargeCreditCount:number|null;rechargeAmountFen:number|null;consumptionCount:number|null;releasedCount:number|null};
  range:{from:string;before:string;timezone:'Asia/Shanghai';basis:string};
  sources:{assessments:DataSourceState;payments:DataSourceState;ledger:DataSourceState;reservations:DataSourceState};
  ledger:{freeGranted:number|null;paidGranted:number|null;debitedCredits:number|null;balance:number|null;
    unallocatedConsumption:number|null;freeUsed:null;paidUsed:null;sourceAllocationStatus:'not_recorded';correctionCredits:number|null};
  reservations:{held:number|null;released:number|null};
  gaps:{successWithoutCompletedAt:number;successWithoutDebit:number|null;suspectEightHourCompletionCount:number;runRequestHistory:'not_recorded';actualApiCost:'not_recorded'};
  supplier:SupplierRisk;payers:PayerRank[];
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
    return { key, label, assessmentCount:0,createdCount:0,startedTaskCount:0,failedCount:0,runningCount:0,rechargeCount:0 as number|null,rechargeCreditCount:0 as number|null,rechargeAmountFen:0 as number|null,consumptionCount:0 as number|null,releasedCount:0 as number|null }
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

function safeQueryCode(error:unknown):string {
  const code=error&&typeof error==='object'&&'code' in error?String(error.code):'query_failed'
  return /^[A-Z0-9_]+$/.test(code)?code:'query_failed'
}
export async function readAssessmentCommerceAnalytics(pool:mysql.Pool,period:AnalyticsPeriod,now=new Date(),env?:AppEnv):Promise<AssessmentCommerceAnalytics>{
  const {buckets,dateFormat,from,before}=analyticsCalendar(period,now)
  const fromUtc=new Date(from.replace(' ','T')+'+08:00').toISOString().slice(0,19).replace('T',' ')
  const beforeUtc=new Date(before.replace(' ','T')+'+08:00').toISOString().slice(0,19).replace('T',' ')
  const conn=await pool.getConnection()
  let originalTimezone:string|null=null
  const sources:AssessmentCommerceAnalytics['sources']={assessments:{status:'ok',error:null},payments:{status:'ok',error:null},ledger:{status:'ok',error:null},reservations:{status:'ok',error:null}}
  const index=new Map(buckets.map(b=>[b.key,b]))
  const query=async(sql:string,params:unknown[]=[])=>{const [rows]=await conn.query<mysql.RowDataPacket[]>(sql,params);return rows}
  const group=(column:string,where:string)=>`SELECT DATE_FORMAT(DATE_ADD(${column},INTERVAL 8 HOUR),?) AS bucketKey,COUNT(*) AS cnt FROM assessments WHERE ${where} AND ${column}>=? AND ${column}<? GROUP BY bucketKey`
  let payers:PayerRank[]=[],freeGranted:number|null=null,paidGranted:number|null=null,debitedCredits:number|null=null,balance:number|null=null,correctionCredits:number|null=null,held:number|null=null,released:number|null=null,successWithoutDebit:number|null=null
  let successWithoutCompletedAt=0,suspectEightHourCompletionCount=0,runs7d=0,assessmentUserCount=0
  try{
    // Session state only, never a global/server timezone or business data write.
    const [zone]=await conn.query<mysql.RowDataPacket[]>('SELECT @@session.time_zone AS timeZone')
    originalTimezone=String(zone[0].timeZone)
    await conn.query("SET time_zone = '+00:00'")
    for(const [key,column,where] of [
      ['assessmentCount','COALESCE(completed_at,updated_at)',"status='succeeded'"],
      ['createdCount','created_at','1=1'],['startedTaskCount','started_at','started_at IS NOT NULL'],
      ['failedCount','COALESCE(completed_at,updated_at)',"status='failed'"],
      ['runningCount','COALESCE(started_at,created_at)',"status='running'"],
    ] as const){
      const rows=await query(group(column,where),[dateFormat,fromUtc,beforeUtc])
      for(const row of rows){const bucket=index.get(String(row.bucketKey));if(bucket)bucket[key]=Number(row.cnt)}
    }
    const users=await query(`SELECT COUNT(DISTINCT user_id) AS cnt FROM assessments WHERE created_at>=? AND created_at<?`,[fromUtc,beforeUtc])
    assessmentUserCount=Number(users[0]?.cnt??0)
    const gap=await query(`SELECT COUNT(*) AS cnt FROM assessments WHERE status='succeeded' AND completed_at IS NULL`)
    successWithoutCompletedAt=Number(gap[0]?.cnt??0)
    const timezoneGap=await query(`SELECT COUNT(*) AS cnt FROM assessments WHERE status='succeeded' AND completed_at IS NOT NULL AND TIMESTAMPDIFF(SECOND,completed_at,updated_at) BETWEEN 28500 AND 29100`)
    suspectEightHourCompletionCount=Number(timezoneGap[0]?.cnt??0)
    const usage=await query(`SELECT COUNT(*) AS cnt FROM assessments WHERE status='succeeded' AND COALESCE(completed_at,updated_at)>=? AND COALESCE(completed_at,updated_at)<?`,[new Date(now.getTime()-7*86400000).toISOString().slice(0,19).replace('T',' '),now.toISOString().slice(0,19).replace('T',' ')])
    runs7d=Number(usage[0]?.cnt??0)
    try{
      const payments=await query(`SELECT DATE_FORMAT(DATE_ADD(paid_at,INTERVAL 8 HOUR),?) AS bucketKey,COUNT(*) AS cnt,COALESCE(SUM(credit_amount),0) AS creditCount,COALESCE(SUM(amount_fen),0) AS amountFen FROM payment_orders WHERE status='paid' AND paid_at>=? AND paid_at<? GROUP BY bucketKey`,[dateFormat,fromUtc,beforeUtc])
      for(const row of payments){const b=index.get(String(row.bucketKey));if(b){b.rechargeCount=Number(row.cnt);b.rechargeCreditCount=Number(row.creditCount);b.rechargeAmountFen=Number(row.amountFen)}}
      const ranks=await query(`SELECT u.id AS userId,COALESCE(NULLIF(u.display_name,''),'未设置昵称') AS displayName,COUNT(*) AS rechargeCount,SUM(p.amount_fen) AS amountFen FROM payment_orders p INNER JOIN users u ON u.id=p.user_id WHERE p.status='paid' AND p.paid_at>=? AND p.paid_at<? GROUP BY u.id,u.display_name ORDER BY amountFen DESC,u.id ASC LIMIT 20`,[fromUtc,beforeUtc])
      payers=ranks.map(row=>({userIdSuffix:String(row.userId).slice(-6),displayName:String(row.displayName),rechargeCount:Number(row.rechargeCount),amountFen:Number(row.amountFen)}))
    }catch(error){sources.payments={status:'error',error:safeQueryCode(error)};for(const b of buckets){b.rechargeCount=null;b.rechargeCreditCount=null;b.rechargeAmountFen=null}}
    try{
      const counts=await query(`SELECT DATE_FORMAT(DATE_ADD(created_at,INTERVAL 8 HOUR),?) AS bucketKey,COUNT(*) AS cnt FROM credit_ledger_entries WHERE type='assessment_debit' AND delta<0 AND created_at>=? AND created_at<? GROUP BY bucketKey`,[dateFormat,fromUtc,beforeUtc])
      for(const row of counts){const b=index.get(String(row.bucketKey));if(b)b.consumptionCount=Number(row.cnt)}
      const totals=await query(`SELECT COALESCE(SUM(CASE WHEN type='free_grant' AND delta>0 THEN delta ELSE 0 END),0) AS freeGranted,COALESCE(SUM(CASE WHEN type='payment_grant' AND delta>0 THEN delta ELSE 0 END),0) AS paidGranted,COALESCE(SUM(CASE WHEN type='assessment_debit' AND delta<0 THEN -delta ELSE 0 END),0) AS debitedCredits,COALESCE(SUM(delta),0) AS balance,COALESCE(SUM(CASE WHEN type='correction' THEN delta ELSE 0 END),0) AS correctionCredits FROM credit_ledger_entries`)
      const t=totals[0];freeGranted=Number(t?.freeGranted??0);paidGranted=Number(t?.paidGranted??0);debitedCredits=Number(t?.debitedCredits??0);balance=Number(t?.balance??0);correctionCredits=Number(t?.correctionCredits??0)
      const gaps=await query(`SELECT COUNT(*) AS cnt FROM assessments a WHERE a.status='succeeded' AND NOT EXISTS(SELECT 1 FROM credit_ledger_entries l WHERE l.assessment_id=a.id AND l.type='assessment_debit' AND l.delta<0)`)
      successWithoutDebit=Number(gaps[0]?.cnt??0)
    }catch(error){sources.ledger={status:'error',error:safeQueryCode(error)};freeGranted=paidGranted=debitedCredits=balance=correctionCredits=successWithoutDebit=null;for(const b of buckets)b.consumptionCount=null}
    try{
      const rows=await query(`SELECT status,COALESCE(SUM(amount),0) AS amount FROM credit_reservations WHERE status='held' OR (status='released' AND updated_at>=? AND updated_at<?) GROUP BY status`,[fromUtc,beforeUtc])
      held=0;released=0;for(const row of rows){if(row.status==='held')held=Number(row.amount);if(row.status==='released')released=Number(row.amount)}
      const releases=await query(`SELECT DATE_FORMAT(DATE_ADD(updated_at,INTERVAL 8 HOUR),?) AS bucketKey,COUNT(*) AS cnt FROM credit_reservations WHERE status='released' AND updated_at>=? AND updated_at<? GROUP BY bucketKey`,[dateFormat,fromUtc,beforeUtc])
      for(const row of releases){const b=index.get(String(row.bucketKey));if(b)b.releasedCount=Number(row.cnt)}
    }catch(error){sources.reservations={status:'error',error:safeQueryCode(error)};held=released=null;for(const b of buckets)b.releasedCount=null}
    const sum=(key:keyof AnalyticsBucket)=>buckets.reduce((n,b)=>n+Number(b[key]??0),0)
    return {period,buckets,summary:{assessmentCount:sum('assessmentCount'),createdCount:sum('createdCount'),startedTaskCount:sum('startedTaskCount'),failedCount:sum('failedCount'),runningCount:sum('runningCount'),assessmentUserCount,
      rechargeCount:sources.payments.status==='ok'?sum('rechargeCount'):null,rechargeCreditCount:sources.payments.status==='ok'?sum('rechargeCreditCount'):null,rechargeAmountFen:sources.payments.status==='ok'?sum('rechargeAmountFen'):null,consumptionCount:sources.ledger.status==='ok'?sum('consumptionCount'):null,releasedCount:sources.reservations.status==='ok'?sum('releasedCount'):null},
      range:{from,before,timezone:'Asia/Shanghai',basis:'起点包含、终点不包含。成功按完成时间；旧成功无完成时间使用updated_at代理并标记缺口。完成时间与更新时间相差约8小时的记录另列待核对数量，日期归桶在生产时区验收前仅供参考。运行数为曾开始的任务数，不是历史请求次数。排行榜使用当前区间；账本余额和发放总量为全历史。'},sources,
      ledger:{freeGranted,paidGranted,debitedCredits,balance,unallocatedConsumption:debitedCredits,freeUsed:null,paidUsed:null,sourceAllocationStatus:'not_recorded',correctionCredits},reservations:{held,released},
      gaps:{successWithoutCompletedAt,successWithoutDebit,suspectEightHourCompletionCount,runRequestHistory:'not_recorded',actualApiCost:'not_recorded'},payers,
      supplier:computeSupplierRisk({balanceFen:env?.AI_SUPPLIER_BALANCE_FEN,observedAt:env?.AI_SUPPLIER_BALANCE_OBSERVED_AT,costFenPerRun:env?.AI_COST_ESTIMATE_FEN_PER_RUN,runs7d,warningDays:env?.AI_SUPPLIER_ALERT_DAYS,now})}
  }finally{
    try{if(originalTimezone!==null)await conn.query('SET time_zone = ?', [originalTimezone])}
    catch{conn.destroy()}
    finally{conn.release()}
  }
}
