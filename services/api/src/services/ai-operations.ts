import type mysql from 'mysql2/promise'
import { randomUUID } from 'node:crypto'
import type { AppEnv } from '../config/env.js'
import { ControlError, unsealKey } from './admin-control-boxes.js'
import { fetchOfficialDeepseekBalance, type OfficialBalance } from './deepseek-balance.js'
import type { ModelCallIdentity } from './assessment-ai-cost.js'
import { assessmentObjectConfigurationFingerprint } from './assessment-key-objects.js'

export const BALANCE_FRESH_MS = 5 * 60_000
export function officialBalanceFresh(observedAt: unknown, now = Date.now()) {
  const time = typeof observedAt === 'string' || observedAt instanceof Date ? new Date(observedAt).getTime() : NaN
  return Number.isFinite(time) && time <= now && now - time <= BALANCE_FRESH_MS
}
function supported(row: mysql.RowDataPacket) {
  try { return row.provider === 'deepseek' && new URL(String(row.api_base_url)).origin === 'https://api.deepseek.com' }
  catch { return false }
}
export async function readOfficialBalanceStatus(pool: mysql.Pool, objectId: string) {
  const [objects] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT id,label,provider,model,api_base_url,version,status FROM assessment_key_objects WHERE id=? LIMIT 1', [objectId])
  const object = objects[0]
  if (!object || object.status === 'archived') throw new ControlError('assessment_key_not_found', 404)
  const [settings] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT currency,warning_threshold AS warningThreshold,last_attempt_at AS lastAttemptAt,last_error AS lastError FROM ai_balance_settings WHERE object_id=?', [objectId])
  const [rows] = await pool.query<mysql.RowDataPacket[]>(`SELECT id,currency,balance,granted_balance AS grantedBalance,
    topped_up_balance AS toppedUpBalance,is_available AS isAvailable,verified_at AS observedAt,source_url AS sourceUrl,
    object_version AS objectVersion FROM ai_balance_snapshots WHERE object_id=? AND source='official'
    ORDER BY verified_at DESC,created_at DESC,id DESC LIMIT 20`, [objectId])
  const seen = new Set<string>()
  const balances = rows.filter(row => { if (seen.has(row.currency)) return false; seen.add(row.currency); return true }).map(row => {
    const setting = settings.find(value => value.currency === row.currency)
    const threshold = String(setting?.warningThreshold ?? '0')
    const fresh = officialBalanceFresh(row.observedAt) && Number(row.objectVersion) === Number(object.version)
    return { ...row, balance: String(row.balance), warningThreshold: threshold, fresh,
      lowBalance: fresh ? decimalUnits(String(row.balance)) < decimalUnits(threshold) || !Number(row.isAvailable) : null }
  })
  const [windows] = await pool.query<mysql.RowDataPacket[]>(`SELECT assessment_id AS assessmentId,status,reason,
    before_json AS beforeBalance,after_json AS afterBalance,started_at AS startedAt,completed_at AS completedAt
    FROM ai_assessment_balance_windows WHERE object_id=? ORDER BY started_at DESC LIMIT 20`, [objectId])
  const lastError = settings.find(row => row.lastError)?.lastError ?? null
  return { object: { id: object.id, label: object.label, provider: object.provider, model: object.model, version: Number(object.version) },
    status: !supported(object) ? 'unsupported' : lastError ? 'unavailable' : balances.some(row => row.fresh) ? 'fresh' : balances.length ? 'stale' : 'never_read',
    lastError, settings, balances, windows: windows.map(row => ({ ...row,
      differences: accountDifferences(row.beforeBalance, row.afterBalance) })),
    attribution: 'unallocated', attributionReason: 'shared_account_and_settlement_cannot_be_proven_exclusive' }
}

/** Shared by administrator refresh and assessment-window observations. */
export async function refreshOfficialObjectBalance(input: { pool: mysql.Pool; env: AppEnv; objectId: string;
  actorId?: string; transport?: typeof fetch;
  expected?:{objectVersion:number;configurationFingerprint:string;headVersion:number|null} }) {
  const [objects] = await input.pool.query<mysql.RowDataPacket[]>(
    'SELECT id,provider,api_base_url,model,temperature,encrypted_secret,version,creator_user_id,status FROM assessment_key_objects WHERE id=? LIMIT 1', [input.objectId])
  const object = objects[0]
  if (!object || object.status === 'archived') throw new ControlError('assessment_key_not_found', 404)
  const matchesExpected=async(row:mysql.RowDataPacket)=>{
    if(!input.expected)return
    const fingerprint=assessmentObjectConfigurationFingerprint({id:row.id,version:row.version,provider:row.provider,
      api_base_url:row.api_base_url,model:row.model,encrypted_secret:row.encrypted_secret,temperature:row.temperature})
    if(Number(row.version)!==input.expected.objectVersion||fingerprint!==input.expected.configurationFingerprint)
      throw new ControlError('assessment_balance_configuration_changed',409)
    const [heads]=await input.pool.query<mysql.RowDataPacket[]>(
      'SELECT active_object_id,version FROM assessment_key_head WHERE id=1')
    if(heads[0]?.active_object_id!==input.objectId||Number(heads[0]?.version)!==input.expected.headVersion)
      throw new ControlError('assessment_balance_configuration_changed',409)
  }
  await matchesExpected(object)
  if (!supported(object)) return { status: 'unsupported' as const, error: 'provider_balance_unsupported' }
  if (!input.env.ADMIN_AI_KEY_ENCRYPTION_KEY) throw new ControlError('key_vault_master_key_missing', 503)
  const result = await fetchOfficialDeepseekBalance(unsealKey(String(object.encrypted_secret), input.env.ADMIN_AI_KEY_ENCRYPTION_KEY), input.transport)
  const actor = input.actorId ?? String(object.creator_user_id)
  if (result.status !== 'official_observation') {
    await input.pool.query(`INSERT INTO ai_balance_settings (object_id,currency,updated_by,last_attempt_at,last_error)
      VALUES (?,'CNY',?,CURRENT_TIMESTAMP(),?) ON DUPLICATE KEY UPDATE last_attempt_at=CURRENT_TIMESTAMP(),last_error=VALUES(last_error)`,
      [input.objectId, actor, result.error])
    return result
  }
  const connection = await input.pool.getConnection()
  try {
    await connection.beginTransaction()
    const [current] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT * FROM assessment_key_objects WHERE id=? FOR UPDATE', [input.objectId])
    if (Number(current[0]?.version) !== Number(object.version) || current[0]?.encrypted_secret !== object.encrypted_secret)
      throw new ControlError('assessment_object_version_conflict', 409)
    await matchesExpected(current[0])
    for (const balance of result.balances) {
      await connection.query(`INSERT INTO ai_balance_settings (object_id,currency,updated_by,last_attempt_at,last_error)
        VALUES (?,?,?,CURRENT_TIMESTAMP(),NULL) ON DUPLICATE KEY UPDATE last_attempt_at=CURRENT_TIMESTAMP(),last_error=NULL`,
        [input.objectId, balance.currency, actor])
      const [settings] = await connection.query<mysql.RowDataPacket[]>(
        'SELECT warning_threshold FROM ai_balance_settings WHERE object_id=? AND currency=?', [input.objectId, balance.currency])
      await connection.query(`INSERT INTO ai_balance_snapshots
        (id,object_id,provider,currency,balance,warning_threshold,verified_at,actor_user_id,note,
         source,source_url,object_version,granted_balance,topped_up_balance,is_available)
        VALUES (?,?,?,?,?,?,?,?,?,'official',?,?,?,?,?)`,
        [randomUUID(), input.objectId, object.provider, balance.currency, balance.total,
          settings[0]?.warning_threshold ?? '0', new Date(result.observedAt), actor, 'Official read-only account observation',
          result.source, Number(object.version), balance.granted, balance.toppedUp, result.available ? 1 : 0])
    }
    // A previous error may have been recorded before its currency was known.
    await connection.query('UPDATE ai_balance_settings SET last_error=NULL,last_attempt_at=CURRENT_TIMESTAMP() WHERE object_id=?', [input.objectId])
    await connection.commit()
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
  return result
}

export async function setOfficialBalanceThreshold(pool: mysql.Pool, actorId: string,
  objectId: string, currency: string, amount: string) {
  const [objects] = await pool.query<mysql.RowDataPacket[]>('SELECT id FROM assessment_key_objects WHERE id=? LIMIT 1', [objectId])
  if (!objects[0]) throw new ControlError('assessment_key_not_found', 404)
  await pool.query(`INSERT INTO ai_balance_settings (object_id,currency,warning_threshold,updated_by)
    VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE warning_threshold=VALUES(warning_threshold),updated_by=VALUES(updated_by)`,
    [objectId, currency, amount, actorId])
}

function parseObservation(value: unknown): OfficialBalance | null {
  try { const row = typeof value === 'string' ? JSON.parse(value) : value
    return row && typeof row === 'object' && Array.isArray(row.balances) ? row as OfficialBalance : null
  } catch { return null }
}
function decimalUnits(value: string) {
  if (!/^\d{1,14}(?:\.\d{1,8})?$/.test(value)) throw new Error('invalid_balance_decimal')
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, '0'))
}
export function accountDifferences(beforeRaw: unknown, afterRaw: unknown) {
  const before = parseObservation(beforeRaw), after = parseObservation(afterRaw)
  if (!before || !after) return []
  return before.balances.flatMap(row => {
    const end = after.balances.find(value => value.currency === row.currency)
    if (!end) return []
    const difference = decimalUnits(row.total) - decimalUnits(end.total)
    const absolute = difference < 0n ? -difference : difference
    return [{ currency: row.currency, difference: `${difference < 0n ? '-' : ''}${absolute / 100000000n}.${String(absolute % 100000000n).padStart(8, '0')}`,
      status: 'unallocated' as const }]
  })
}

export async function beginAssessmentBalanceWindow(pool: mysql.Pool, env: AppEnv, assessmentId: string, identity: ModelCallIdentity, transport:typeof fetch=fetch) {
  if (!identity.objectId || identity.provider !== 'deepseek') return
  let before:Awaited<ReturnType<typeof refreshOfficialObjectBalance>>|null=null,reason='runtime_identity_not_bound'
  if(identity.objectVersion!=null&&identity.configurationFingerprint){
    try{before=await refreshOfficialObjectBalance({pool,env,objectId:identity.objectId,transport,
      expected:{objectVersion:identity.objectVersion,configurationFingerprint:identity.configurationFingerprint,headVersion:identity.version}})}
    catch{reason='configuration_changed_or_balance_unavailable'}
  }
  await pool.query(`INSERT IGNORE INTO ai_assessment_balance_windows
    (assessment_id,object_id,object_version,head_version,configuration_fingerprint,before_json,status,reason) VALUES (?,?,?,?,?,?,?,?)`,
    [assessmentId, identity.objectId, identity.objectVersion??null,identity.version,identity.configurationFingerprint??null,
      before?.status === 'official_observation' ? JSON.stringify(before) : null,
      'unavailable', before?.status === 'official_observation' ? 'execution_window_open' : before?.error??reason])
}
export async function finishAssessmentBalanceWindow(pool: mysql.Pool, env: AppEnv, assessmentId: string, transport:typeof fetch=fetch) {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT object_id,object_version,head_version,configuration_fingerprint,before_json,started_at FROM ai_assessment_balance_windows WHERE assessment_id=? AND completed_at IS NULL LIMIT 1', [assessmentId])
  if (!rows[0]) return
  let after:Awaited<ReturnType<typeof refreshOfficialObjectBalance>>|null=null
  if(rows[0].object_version!=null&&rows[0].configuration_fingerprint){
    try{after=await refreshOfficialObjectBalance({pool,env,objectId:String(rows[0].object_id),transport,
      expected:{objectVersion:Number(rows[0].object_version),headVersion:Number(rows[0].head_version),configurationFingerprint:String(rows[0].configuration_fingerprint)}})}
    catch{ /* Never form a difference across a changed runtime identity. */ }
  }
  const before = parseObservation(rows[0].before_json)
  const [concurrent] = await pool.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS count FROM assessment_ai_calls
    WHERE object_id=? AND assessment_id<>? AND created_at<=CURRENT_TIMESTAMP()
    AND (completed_at IS NULL OR completed_at>=?)`,[rows[0].object_id,assessmentId,rows[0].started_at])
  const reason=Number(concurrent[0]?.count)>0?'concurrent_object_calls_observed':
    'shared_account_topups_or_delayed_settlement_not_excluded'
  await pool.query(`UPDATE ai_assessment_balance_windows SET after_json=?,status=?,reason=?,completed_at=CURRENT_TIMESTAMP()
    WHERE assessment_id=? AND completed_at IS NULL`, [after?.status === 'official_observation' ? JSON.stringify(after) : null,
      before && after?.status === 'official_observation' ? 'unallocated' : 'unavailable',
      before && after?.status === 'official_observation' ? reason : 'configuration_changed_or_balance_unavailable', assessmentId])
}
