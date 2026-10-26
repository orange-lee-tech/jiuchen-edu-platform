import type mysql from 'mysql2/promise'
import { createHash, randomUUID } from 'node:crypto'
import type { ModelTokenUsage } from './ai-provider.js'
import { ControlError } from './admin-control-boxes.js'

export type ModelCallEvent = {
  callId: string; phase: 'initial' | 'repair'; requestCount: number
  outcome: 'started' | 'completed' | 'failed'; usage?: ModelTokenUsage | null
  promptChars?: number | null; outputBudget?: number | null
}
export type ModelCallIdentity = {
  provider: string | null; model: string | null
  objectId: string | null; version: number | null
}

/** Provider currency and student credits are separate ledgers. This records
 * observations only; a missing usage record never becomes a fabricated bill. */
export async function recordAssessmentModelCall(pool: mysql.Pool, assessmentId: string,
  event: ModelCallEvent, identity: ModelCallIdentity) {
  if (event.outcome === 'started') {
    const [prices] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT id FROM assessment_ai_price_versions WHERE provider=? AND model=?
       AND reviewed_at IS NOT NULL AND effective_at<=CURRENT_TIMESTAMP()
       ORDER BY effective_at DESC,id DESC LIMIT 1`,
      [identity.provider ?? '', identity.model ?? ''],
    )
    await pool.query(
      `INSERT IGNORE INTO assessment_ai_calls
       (id,assessment_id,phase,request_index,provider,model,object_id,object_version,price_version)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [event.callId, assessmentId, event.phase, event.requestCount,
        identity.provider ?? 'unknown', identity.model ?? 'unknown',
        identity.objectId, identity.version, prices[0]?.id ?? null],
    )
    return
  }
  const usage = event.usage ?? null
  await pool.query(
    `UPDATE assessment_ai_calls SET outcome=?,provider=?,model=?,object_id=?,object_version=?,
     prompt_chars=?,output_budget=?,prompt_tokens=?,completion_tokens=?,cache_hit_tokens=?,
     cache_miss_tokens=?,reasoning_tokens=?,usage_state=?,completed_at=CURRENT_TIMESTAMP()
     WHERE id=? AND assessment_id=?`,
    [event.outcome, identity.provider ?? 'unknown', identity.model ?? 'unknown',
      identity.objectId, identity.version, event.promptChars ?? null,
      event.outputBudget ?? null, usage?.promptTokens ?? null,
      usage?.completionTokens ?? null, usage?.cacheHitTokens ?? null,
      usage?.cacheMissTokens ?? null, usage?.reasoningTokens ?? null,
      usage ? 'returned' : event.outcome === 'failed' ? 'awaiting_reconciliation' : 'unknown',
      event.callId, assessmentId],
  )
}

export function estimateAssessmentTokenRange(promptChars: number, outputBudget: number,
  historicalPromptTokensPerChar: number | null = null) {
  const ratio = historicalPromptTokensPerChar && historicalPromptTokensPerChar > 0 &&
    historicalPromptTokensPerChar <= 2 ? historicalPromptTokensPerChar : null
  const promptLow = Math.ceil(promptChars * (ratio ? Math.max(.15, ratio * .8) : .25))
  const promptHigh = Math.ceil(promptChars * (ratio ? Math.min(2, ratio * 1.3) : 1))
  const outputLow = Math.ceil(outputBudget * .3)
  const outputHigh = Math.max(outputLow, outputBudget)
  return { lowerTokens: promptLow + outputLow,
    // Repair includes the previous output inside its next prompt.
    upperTokensWithOneRepair: 2 * (promptHigh + outputHigh) + outputBudget,
    basis: ratio ? 'historical_token_ratio' as const : 'conservative_char_ratio' as const,
    repairBudget: 1 as const }
}

export const DEEPSEEK_PRICE_SOURCE = 'https://api-docs.deepseek.com/quick_start/pricing/'

/** Download only the fixed official source. A digest change requests human
 * review; it never silently replaces an approved price snapshot. */
export async function checkDeepseekPriceSource(pool:mysql.Pool,transport:typeof fetch=fetch){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000)
  try{
    const response=await transport(DEEPSEEK_PRICE_SOURCE,{method:'GET',redirect:'error',signal:controller.signal})
    if(!response.ok||!response.body)throw new Error('price_source_unavailable')
    const advertised=Number(response.headers.get('content-length')??0)
    if(advertised>600_000)throw new Error('price_source_too_large')
    const digest=createHash('sha256'),reader=response.body.getReader()
    let size=0
    try{
      while(true){const {done,value}=await reader.read();if(done)break
        size+=value.length
        if(size>600_000)throw new Error('price_source_too_large')
        digest.update(value)
      }
    }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
    const hash=digest.digest('hex')
    await pool.query(`INSERT INTO assessment_ai_price_source_checks
      (id,source_url,source_sha256) VALUES (?,?,?)`,
      [randomUUID(),DEEPSEEK_PRICE_SOURCE,hash])
    const [reviewed]=await pool.query<mysql.RowDataPacket[]>(
      `SELECT source_sha256 FROM assessment_ai_price_versions
       WHERE provider='deepseek' AND reviewed_at IS NOT NULL
       ORDER BY reviewed_at DESC LIMIT 1`)
    return {status:reviewed[0]?.source_sha256===hash?'unchanged' as const:'review_required' as const,
      fetchedAt:new Date().toISOString(),sourceUrl:DEEPSEEK_PRICE_SOURCE}
  }finally{clearTimeout(timeout)}
}

export async function reviewDeepseekPrice(input: {
  pool:mysql.Pool; actorId:string; model:string; expectedLatestVersion:string|null
  inputCacheHitPerMillion:number;inputCacheMissPerMillion:number;outputPerMillion:number
  peakInputCacheMissPerMillion:number|null;peakOutputPerMillion:number|null
  peakWindowUtc:string|null;effectiveAt:Date;reviewNote:string
}) {
  const rates = [input.inputCacheHitPerMillion,input.inputCacheMissPerMillion,
    input.outputPerMillion,input.peakInputCacheMissPerMillion,input.peakOutputPerMillion]
  if (!rates.every(rate=>rate===null || Number.isFinite(rate) && rate>=0 && rate<10000) ||
      !Number.isFinite(input.effectiveAt.getTime()) || input.reviewNote.trim().length<8) {
    throw new ControlError('price_review_invalid',400)
  }
  const connection=await input.pool.getConnection()
  try {
    await connection.beginTransaction()
    await connection.query(`INSERT IGNORE INTO assessment_ai_price_heads
      (provider,model,latest_version) VALUES ('deepseek',?,NULL)`,[input.model])
    const [rows]=await connection.query<mysql.RowDataPacket[]>(
      `SELECT latest_version FROM assessment_ai_price_heads
       WHERE provider='deepseek' AND model=? FOR UPDATE`,[input.model])
    const current=rows[0]?.latest_version??null
    if(current!==input.expectedLatestVersion)throw new ControlError('price_version_conflict',409)
    const [checks]=await connection.query<mysql.RowDataPacket[]>(
      `SELECT source_sha256,fetched_at FROM assessment_ai_price_source_checks
       WHERE source_url=? AND fetched_at>=DATE_SUB(CURRENT_TIMESTAMP(),INTERVAL 7 DAY)
       ORDER BY fetched_at DESC LIMIT 1`,[DEEPSEEK_PRICE_SOURCE])
    if(!checks.length)throw new ControlError('price_source_check_required',409)
    const id=randomUUID()
    await connection.query(`INSERT INTO assessment_ai_price_versions
      (id,provider,model,currency,input_cache_hit_per_million,input_cache_miss_per_million,
       output_per_million,peak_input_cache_miss_per_million,peak_output_per_million,
       peak_window_utc,source_url,source_sha256,effective_at,fetched_at,
       reviewed_at,reviewed_by,review_note)
       VALUES (?,'deepseek',?,'USD',?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP(),?,?)`,
      [id,input.model,input.inputCacheHitPerMillion,input.inputCacheMissPerMillion,
        input.outputPerMillion,input.peakInputCacheMissPerMillion,
        input.peakOutputPerMillion,input.peakWindowUtc,DEEPSEEK_PRICE_SOURCE,
        checks[0].source_sha256,input.effectiveAt,checks[0].fetched_at,
        input.actorId,input.reviewNote.trim()])
    await connection.query(`UPDATE assessment_ai_price_heads SET latest_version=?
      WHERE provider='deepseek' AND model=?`,[id,input.model])
    await connection.query(`INSERT INTO assessment_ai_cost_audit
      (id,actor_user_id,action,version_id,note) VALUES (?,?,?,?,?)`,
      [randomUUID(),input.actorId,'review_price',id,input.reviewNote.trim()])
    await connection.commit()
    return {version:id,previousVersion:current}
  } catch(error){await connection.rollback();throw error}
  finally{connection.release()}
}

export async function reviewExchangeRate(input:{pool:mysql.Pool;actorId:string;rate:number;
  sourceUrl:string;observedAt:Date;reviewNote:string}){
  let source:URL
  try{source=new URL(input.sourceUrl)}catch{throw new ControlError('fx_source_invalid',400)}
  if(source.protocol!=='https:'||source.username||source.password||source.hash||
      !Number.isFinite(input.rate)||input.rate<=0||input.rate>20||
      !Number.isFinite(input.observedAt.getTime())||input.reviewNote.trim().length<8){
    throw new ControlError('fx_review_invalid',400)
  }
  const id=randomUUID()
  const connection=await input.pool.getConnection()
  try{
    await connection.beginTransaction()
    await connection.query(`INSERT INTO assessment_ai_fx_versions
      (id,from_currency,to_currency,rate,source_url,observed_at,reviewed_at,reviewed_by)
      VALUES (?,'USD','CNY',?,?,?,CURRENT_TIMESTAMP(),?)`,
      [id,input.rate,source.toString(),input.observedAt,input.actorId])
    await connection.query(`INSERT INTO assessment_ai_cost_audit
      (id,actor_user_id,action,version_id,note) VALUES (?,?,?,?,?)`,
      [randomUUID(),input.actorId,'review_fx',id,input.reviewNote.trim()])
    await connection.commit()
    return {version:id}
  }catch(error){await connection.rollback();throw error}
  finally{connection.release()}
}
