import { randomUUID } from 'node:crypto'
import type mysql from 'mysql2/promise'

export type ManualBalance = { objectId: string; currency: string; balance: string; warningThreshold: string; verifiedAt: string; note?: string | null }

/** Each observation is immutable and records its operator. No credentials are read or returned. */
export async function recordAiBalance(pool: mysql.Pool, actor: string, input: ManualBalance) {
  const [objects] = await pool.query<mysql.RowDataPacket[]>('SELECT provider FROM assessment_key_objects WHERE id=? LIMIT 1', [input.objectId])
  if (!objects[0]?.provider) return null
  const id = randomUUID()
  await pool.query(`INSERT INTO ai_balance_snapshots
    (id,object_id,provider,currency,balance,warning_threshold,verified_at,actor_user_id,note)
    VALUES (?,?,?,?,?,?,?,?,?)`, [id, input.objectId, objects[0].provider, input.currency, input.balance,
    input.warningThreshold, new Date(input.verifiedAt), actor, input.note || null])
  return id
}

/** Unknown usage/prices stay unknown. Amount arithmetic is performed as MySQL DECIMAL. */
export async function readAiBalanceSnapshots(pool: mysql.Pool, objectId: string) {
  const [history] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT id,object_id AS objectId,provider,currency,balance,warning_threshold AS warningThreshold,verified_at AS verifiedAt,actor_user_id AS actorUserId,note,created_at AS createdAt FROM ai_balance_snapshots WHERE object_id=? ORDER BY verified_at DESC,created_at DESC,id DESC LIMIT 50', [objectId])
  const latest = history[0]
  if (!latest) return { history: [], estimate: null }
  const [rows] = await pool.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS calls,
    SUM(CASE WHEN c.usage_state='returned' AND c.prompt_tokens IS NOT NULL AND c.completion_tokens IS NOT NULL
      AND c.cache_hit_tokens IS NOT NULL AND c.cache_miss_tokens IS NOT NULL
      AND c.cache_hit_tokens+c.cache_miss_tokens=c.prompt_tokens AND p.id IS NOT NULL AND p.currency=?
      AND p.input_cache_hit_per_million IS NOT NULL AND p.peak_input_cache_miss_per_million IS NULL
      AND p.peak_output_per_million IS NULL THEN 0 ELSE 1 END) AS unknownCalls,
    SUM(CASE WHEN c.usage_state='returned' AND c.prompt_tokens IS NOT NULL AND c.completion_tokens IS NOT NULL
      AND c.cache_hit_tokens IS NOT NULL AND c.cache_miss_tokens IS NOT NULL
      AND c.cache_hit_tokens+c.cache_miss_tokens=c.prompt_tokens AND p.id IS NOT NULL AND p.currency=?
      AND p.input_cache_hit_per_million IS NOT NULL AND p.peak_input_cache_miss_per_million IS NULL
      AND p.peak_output_per_million IS NULL THEN
      (c.cache_hit_tokens*p.input_cache_hit_per_million+c.cache_miss_tokens*p.input_cache_miss_per_million+c.completion_tokens*p.output_per_million)/1000000 ELSE NULL END) AS estimatedSpend
    FROM assessment_ai_calls c LEFT JOIN assessment_ai_price_versions p ON p.id=c.price_version
    WHERE c.object_id=? AND c.created_at>=DATE_ADD(?,INTERVAL 1 MINUTE)`, [latest.currency, latest.currency, objectId, latest.verifiedAt])
  const calls = Number(rows[0]?.calls ?? 0), unknownCalls = Number(rows[0]?.unknownCalls ?? 0)
  const [models] = await pool.query<mysql.RowDataPacket[]>(`SELECT c.provider,c.model,COUNT(*) AS calls,
    SUM(CASE WHEN c.usage_state='returned' AND c.prompt_tokens IS NOT NULL AND c.completion_tokens IS NOT NULL
      AND c.cache_hit_tokens IS NOT NULL AND c.cache_miss_tokens IS NOT NULL
      AND c.cache_hit_tokens+c.cache_miss_tokens=c.prompt_tokens AND p.id IS NOT NULL AND p.currency=?
      AND p.input_cache_hit_per_million IS NOT NULL AND p.peak_input_cache_miss_per_million IS NULL
      AND p.peak_output_per_million IS NULL THEN 0 ELSE 1 END) AS unknownCalls,
    SUM(CASE WHEN c.usage_state='returned' AND c.prompt_tokens IS NOT NULL AND c.completion_tokens IS NOT NULL
      AND c.cache_hit_tokens IS NOT NULL AND c.cache_miss_tokens IS NOT NULL
      AND c.cache_hit_tokens+c.cache_miss_tokens=c.prompt_tokens AND p.id IS NOT NULL AND p.currency=?
      AND p.input_cache_hit_per_million IS NOT NULL AND p.peak_input_cache_miss_per_million IS NULL
      AND p.peak_output_per_million IS NULL THEN
      (c.cache_hit_tokens*p.input_cache_hit_per_million+c.cache_miss_tokens*p.input_cache_miss_per_million+c.completion_tokens*p.output_per_million)/1000000 ELSE NULL END) AS estimatedSpend
    FROM assessment_ai_calls c LEFT JOIN assessment_ai_price_versions p ON p.id=c.price_version
    WHERE c.object_id=? AND c.created_at>=DATE_ADD(?,INTERVAL 1 MINUTE) GROUP BY c.provider,c.model ORDER BY c.provider,c.model LIMIT 100`,
    [latest.currency, latest.currency, objectId, latest.verifiedAt])
  // The UI records the observed minute; calls within it or spanning it cannot
  // safely be assigned to either side of the manual balance observation.
  const [overlap] = await pool.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS count FROM assessment_ai_calls
    WHERE object_id=? AND ((created_at<? AND (completed_at IS NULL OR completed_at>?))
      OR (created_at>=? AND created_at<DATE_ADD(?,INTERVAL 1 MINUTE)))`,
    [objectId, latest.verifiedAt, latest.verifiedAt, latest.verifiedAt, latest.verifiedAt])
  const uncertain = unknownCalls + Number(overlap[0]?.count ?? 0)
  const spend = calls === 0 ? '0' : rows[0]?.estimatedSpend == null ? null : String(rows[0].estimatedSpend)
  const [amount] = spend === null ? [[]] : await pool.query<mysql.RowDataPacket[]>(
    'SELECT CAST(? AS DECIMAL(24,8))-CAST(? AS DECIMAL(24,8)) AS remaining, CAST(? AS DECIMAL(24,8))-CAST(? AS DECIMAL(24,8)) < CAST(? AS DECIMAL(24,8)) AS lowBalance',
    [latest.balance, spend, latest.balance, spend, latest.warningThreshold])
  return { history, estimate: { estimatedSpend: spend, estimatedRemaining: uncertain ? null : amount[0]?.remaining ?? null,
    lowBalance: uncertain || amount[0]?.lowBalance == null ? null : Number(amount[0].lowBalance) === 1, calls, unknownCalls: uncertain,
    models: models.map(model => ({ provider: String(model.provider), model: String(model.model), calls: Number(model.calls),
      unknownCalls: Number(model.unknownCalls), estimatedSpend: model.estimatedSpend == null ? null : String(model.estimatedSpend) })),
    stale: Date.now() - new Date(latest.verifiedAt).getTime() > 86400000,
    basis: 'manual_snapshot_and_recorded_calls_estimate' } }
}
