import type mysql from 'mysql2/promise'
import type { AppEnv } from '../config/env.js'
import { readActiveAssessmentKey } from './assessment-key-objects.js'
import { estimateAssessmentTokenRange } from './assessment-ai-cost.js'

type CallTotals = mysql.RowDataPacket & {
  calls: number; initialCalls: number; repairCalls: number; usageReturned: number
  awaitingReconciliation: number; promptTokens: number | string | null
  completionTokens: number | string | null; avgPromptChars: number | string | null
  avgOutputBudget: number | string | null
}

export function publicCallTotals(row: Partial<CallTotals> | undefined) {
  return {
    calls: Number(row?.calls ?? 0), initialCalls: Number(row?.initialCalls ?? 0),
    repairCalls: Number(row?.repairCalls ?? 0), usageReturned: Number(row?.usageReturned ?? 0),
    awaitingReconciliation: Number(row?.awaitingReconciliation ?? 0),
    promptTokens: Number(row?.promptTokens ?? 0), completionTokens: Number(row?.completionTokens ?? 0),
  }
}

const totalsSql = `SELECT COUNT(*) AS calls,
  COALESCE(SUM(c.phase='initial'),0) AS initialCalls,
  COALESCE(SUM(c.phase='repair'),0) AS repairCalls,
  COALESCE(SUM(c.usage_state='returned'),0) AS usageReturned,
  COALESCE(SUM(c.usage_state='awaiting_reconciliation' OR c.outcome='started'),0) AS awaitingReconciliation,
  COALESCE(SUM(c.prompt_tokens),0) AS promptTokens,
  COALESCE(SUM(c.completion_tokens),0) AS completionTokens,
  AVG(c.prompt_chars) AS avgPromptChars,AVG(c.output_budget) AS avgOutputBudget
  FROM assessment_ai_calls c`

/** Teacher scope is enforced in SQL, including when a requested assessment ID is supplied. */
export async function readTeacherAssessmentAiCosts(pool: mysql.Pool, teacherUserId: string,
  assessmentId: string | null = null) {
  const [rows] = await pool.query<CallTotals[]>(
    `${totalsSql} INNER JOIN assessments a ON a.id=c.assessment_id
     WHERE EXISTS (SELECT 1 FROM students s
       INNER JOIN student_teacher_assignments sta ON sta.student_id=s.id
       INNER JOIN teachers t ON t.id=sta.teacher_id
       WHERE s.user_id=a.user_id AND t.user_id=? AND t.status='active')
       ${assessmentId ? 'AND a.id=?' : ''}`,
    assessmentId ? [teacherUserId, assessmentId] : [teacherUserId],
  )
  const chars=Number(rows[0]?.avgPromptChars??0),budget=Number(rows[0]?.avgOutputBudget??0)
  let costForecast:null|{status:'reviewed_price_estimate';minCny:number;
    maxCnyWithOneRepair:number;priceReviewedAt:Date;fxObservedAt:Date|null}=null
  if(chars>0&&budget>0){
    const [prices]=await pool.query<mysql.RowDataPacket[]>(
      `SELECT p.currency,p.input_cache_miss_per_million,p.output_per_million,
        p.peak_input_cache_miss_per_million,p.peak_output_per_million,
        p.source_sha256,p.reviewed_at
       FROM assessment_key_head h
       INNER JOIN assessment_key_objects o ON o.id=h.active_object_id
       INNER JOIN assessment_ai_price_versions p ON p.provider=o.provider AND p.model=o.model
       WHERE h.id=1 AND p.reviewed_at IS NOT NULL AND p.effective_at<=CURRENT_TIMESTAMP()
       ORDER BY p.effective_at DESC LIMIT 1`)
    const price=prices[0]
    if(price){
      const [checks]=await pool.query<mysql.RowDataPacket[]>(
        `SELECT source_sha256 FROM assessment_ai_price_source_checks
         WHERE fetched_at>=DATE_SUB(CURRENT_TIMESTAMP(),INTERVAL 7 DAY)
         ORDER BY fetched_at DESC LIMIT 1`)
      let conversion:number|null=price.currency==='CNY'?1:null
      let fxObservedAt:Date|null=null
      if(price.currency==='USD'){
        const [rates]=await pool.query<mysql.RowDataPacket[]>(
          `SELECT rate,observed_at FROM assessment_ai_fx_versions
           WHERE from_currency='USD' AND to_currency='CNY' AND reviewed_at IS NOT NULL
             AND observed_at>=DATE_SUB(CURRENT_TIMESTAMP(),INTERVAL 7 DAY)
           ORDER BY observed_at DESC LIMIT 1`)
        if(rates[0]){conversion=Number(rates[0].rate);fxObservedAt=rates[0].observed_at}
      }
      if(checks[0]?.source_sha256===price.source_sha256&&conversion!==null){
        const input=Number(price.input_cache_miss_per_million)
        const output=Number(price.output_per_million)
        const peakInput=Math.max(input,Number(price.peak_input_cache_miss_per_million??input))
        const peakOutput=Math.max(output,Number(price.peak_output_per_million??output))
        costForecast={status:'reviewed_price_estimate',
          minCny:Number(((Math.ceil(chars*.25)*input+Math.ceil(budget*.3)*output)*conversion/1_000_000).toFixed(4)),
          maxCnyWithOneRepair:Number((((2*Math.ceil(chars)+Math.ceil(budget))*peakInput+
            2*Math.ceil(budget)*peakOutput)*conversion/1_000_000).toFixed(4)),
          priceReviewedAt:price.reviewed_at,fxObservedAt}
      }
    }
  }
  return { scope: 'assigned_students' as const, usage: publicCallTotals(rows[0]),
    tokenForecast:chars>0&&budget>0?estimateAssessmentTokenRange(chars,budget):null,
    costForecast,
    providerBalance: 'forbidden' as const, providerPrices: 'forbidden' as const,
    actualSupplierCharge: 'not_connected' as const }
}

export async function readAdminAssessmentAiCosts(pool: mysql.Pool) {
  const [rows] = await pool.query<CallTotals[]>(totalsSql)
  const [models] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT provider,model,COUNT(*) AS calls,
      SUM(usage_state='returned') AS usageReturned,
      SUM(usage_state='awaiting_reconciliation' OR outcome='started') AS awaitingReconciliation
     FROM assessment_ai_calls GROUP BY provider,model ORDER BY calls DESC LIMIT 20`,
  )
  const [prices] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT id,provider,model,currency,input_cache_miss_per_million,output_per_million,
      peak_input_cache_miss_per_million,peak_output_per_million,source_url,source_sha256,
      effective_at,fetched_at,reviewed_at
     FROM assessment_ai_price_versions WHERE reviewed_at IS NOT NULL
       AND effective_at<=CURRENT_TIMESTAMP()
     ORDER BY effective_at DESC LIMIT 100`,
  )
  const [active] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT o.provider,o.model FROM assessment_key_head h
     INNER JOIN assessment_key_objects o ON o.id=h.active_object_id
     WHERE h.id=1 AND o.status='active' LIMIT 1`,
  )
  const [checks]=await pool.query<mysql.RowDataPacket[]>(
    `SELECT source_sha256,fetched_at FROM assessment_ai_price_source_checks
     ORDER BY fetched_at DESC LIMIT 1`)
  const [fxRows]=await pool.query<mysql.RowDataPacket[]>(
    `SELECT id,rate,source_url,observed_at,reviewed_at FROM assessment_ai_fx_versions
     WHERE from_currency='USD' AND to_currency='CNY' AND reviewed_at IS NOT NULL
       AND observed_at>=DATE_SUB(CURRENT_TIMESTAMP(),INTERVAL 7 DAY)
     ORDER BY observed_at DESC LIMIT 1`)
  const [priceHeads]=await pool.query<mysql.RowDataPacket[]>(
    `SELECT provider,model,latest_version FROM assessment_ai_price_heads
     WHERE provider='deepseek' LIMIT 100`)
  const avgChars = Number(rows[0]?.avgPromptChars ?? 0)
  const avgBudget = Number(rows[0]?.avgOutputBudget ?? 0)
  const forecast = avgChars > 0 && avgBudget > 0
    ? estimateAssessmentTokenRange(avgChars, avgBudget) : null
  const currentPrice = prices.find(row => row.provider === active[0]?.provider &&
    row.model === active[0]?.model)
  const sourceFresh=Boolean(checks[0] &&
    Date.now()-new Date(checks[0].fetched_at).getTime()<7*86400000)
  const fx: mysql.RowDataPacket | undefined = currentPrice?.currency === 'USD' ? fxRows[0] : undefined
  const conversion = currentPrice?.currency === 'CNY' ? 1 : fx ? Number(fx.rate) : null
  const costRange = forecast && currentPrice && sourceFresh && conversion !== null ? (() => {
    const promptLow = Math.ceil(avgChars * .25), promptHigh = Math.ceil(avgChars)
    const outputLow = Math.ceil(avgBudget * .3), outputHigh = Math.ceil(avgBudget)
    const input = Number(currentPrice.input_cache_miss_per_million)
    const output = Number(currentPrice.output_per_million)
    const peakInput = Math.max(input, Number(currentPrice.peak_input_cache_miss_per_million ?? input))
    const peakOutput = Math.max(output, Number(currentPrice.peak_output_per_million ?? output))
    return { minCny: Number(((promptLow * input + outputLow * output) * conversion / 1_000_000).toFixed(4)),
      maxCnyWithOneRepair: Number((((2 * promptHigh + outputHigh) * peakInput +
        2 * outputHigh * peakOutput) * conversion / 1_000_000).toFixed(4)),
      priceVersion: String(currentPrice.id), priceSource: String(currentPrice.source_url),
      priceReviewedAt: currentPrice.reviewed_at,
      fxSource: fx ? String(fx.source_url) : null, fxObservedAt: fx?.observed_at ?? null,
      sourceCurrency: String(currentPrice.currency), assumptions: 'all_input_cache_miss;upper_all_peak;at_most_one_repair' }
  })() : null
  const latestDeepseekPriceDigests=new Map<string,string|null>()
  for(const row of prices){
    if(row.provider==='deepseek'&&!latestDeepseekPriceDigests.has(String(row.model)))
      latestDeepseekPriceDigests.set(String(row.model),row.source_sha256??null)
  }
  return { scope: 'platform' as const, usage: publicCallTotals(rows[0]),
    models: models.map(row => ({ provider: String(row.provider), model: String(row.model),
      calls: Number(row.calls), usageReturned: Number(row.usageReturned),
      awaitingReconciliation: Number(row.awaitingReconciliation) })),
    forecast: forecast ? { ...forecast, costRange,
      status: costRange ? 'reviewed_price_estimate' as const : 'price_or_fx_not_verified' as const } : null,
    reviewedPrices: prices.map(row => ({ id:String(row.id), provider:String(row.provider),
      model:String(row.model), currency:String(row.currency),
      inputCacheMissPerMillion:String(row.input_cache_miss_per_million),
      outputPerMillion:String(row.output_per_million),
      peakInputCacheMissPerMillion:row.peak_input_cache_miss_per_million === null ? null : String(row.peak_input_cache_miss_per_million),
      peakOutputPerMillion:row.peak_output_per_million === null ? null : String(row.peak_output_per_million),
      sourceUrl:String(row.source_url), effectiveAt:row.effective_at,
      fetchedAt:row.fetched_at, reviewedAt:row.reviewed_at })),
    priceSource:checks[0]?{status:sourceFresh&&latestDeepseekPriceDigests.size>0&&
      [...latestDeepseekPriceDigests.values()].every(digest=>
        digest===checks[0].source_sha256)?'reviewed':'review_required',
      fetchedAt:checks[0].fetched_at}:
      {status:'not_checked',fetchedAt:null},
    exchangeRate:fxRows[0]?{version:String(fxRows[0].id),rate:String(fxRows[0].rate),
      sourceUrl:String(fxRows[0].source_url),observedAt:fxRows[0].observed_at,
      reviewedAt:fxRows[0].reviewed_at}:null,
    latestPriceVersions:priceHeads.map(row=>({provider:String(row.provider),
      model:String(row.model),version:row.latest_version?String(row.latest_version):null})),
    actualSupplierCharge: 'not_connected' as const }
}

type BalanceResponse = { is_available?: unknown; balance_infos?: Array<{
  currency?: unknown; total_balance?: unknown; granted_balance?: unknown; topped_up_balance?: unknown
}> }
let balanceCache: { key: string; at: number; value: ReturnType<typeof safeBalance> } | null = null
function safeBalance(payload: BalanceResponse) {
  const balanceInfos=Array.isArray(payload?.balance_infos)?payload.balance_infos:[]
  const amount = (value: unknown) => typeof value === 'string' && /^\d{1,14}(?:\.\d{1,8})?$/.test(value) ? value : null
  return { status: 'official_observation' as const, source: 'https://api.deepseek.com/user/balance',
    observedAt: new Date().toISOString(), available: payload?.is_available === true,
    balances: balanceInfos.slice(0, 4).map(info => {
      const row=(info&&typeof info==='object'?info:{}) as Record<string,unknown>
      return {currency: row.currency === 'CNY' || row.currency === 'USD' ? row.currency : 'unknown',
        total: amount(row.total_balance), granted: amount(row.granted_balance),
        toppedUp: amount(row.topped_up_balance)}
    }) }
}

export async function readAdminDeepseekBalance(pool: mysql.Pool, env: AppEnv,
  transport: typeof fetch = fetch, now = Date.now()) {
  const active = await readActiveAssessmentKey(pool, env)
  let origin=''
  try { origin=new URL(active.config?.apiBaseUrl??'').origin } catch { /* No trusted URL. */ }
  if (!active.config || active.config.provider !== 'deepseek' ||
      origin !== 'https://api.deepseek.com') {
    return { status: 'not_connected' as const }
  }
  const key = `${active.objectId}:${active.version}`
  if (balanceCache?.key === key && now - balanceCache.at < 60_000) return balanceCache.value
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await transport('https://api.deepseek.com/user/balance', {
      method: 'GET', headers: { Authorization: `Bearer ${active.config.apiKey}` },
      redirect: 'error', signal: controller.signal,
    })
    if (!response.ok) return { status: 'unavailable' as const, httpStatus: response.status }
    const payload = await response.json() as BalanceResponse
    const value = safeBalance(payload)
    balanceCache = { key, at: now, value }
    return value
  } catch {
    return { status: 'unavailable' as const, httpStatus: null }
  } finally { clearTimeout(timeout) }
}
