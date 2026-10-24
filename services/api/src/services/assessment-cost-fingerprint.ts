import { createHash } from 'node:crypto'
import type mysql from 'mysql2/promise'
import type { AppEnv } from '../config/env.js'
import { FIXED_ASSESSMENT_SKUS } from './commercial-config.js'

export const ASSESSMENT_COST_POLICY_VERSION = 'assessment-cost-v1'

type FingerprintInput = {
  source: 'assessment-key-object' | 'legacy-control-box' | 'environment'
  identityVersion: string
  provider: string
  apiBaseUrl: string
  model: string
  temperature: number | null
  secretDigest: string
  jsonMode: boolean | null
  responseFormat: string | null
  extraBodyJson: string | null
}
type FingerprintSourceInput = {
  source: FingerprintInput['source']
  identityVersion: string
  provider: string | null | undefined
  apiBaseUrl: string | null | undefined
  model: string | null | undefined
  temperature: string | number | null | undefined
  secret: string | null | undefined
  jsonMode: boolean | null
  responseFormat: string | null
  extraBodyJson: string | null
}
type KeyHeadRow = mysql.RowDataPacket & { active_object_id: string | null; version: number; initialized: number }
type KeyObjectRow = mysql.RowDataPacket & {
  id: string; version: number; provider: string | null; api_base_url: string | null
  model: string | null; temperature: string | number | null; encrypted_secret: string; status: string
}
type LegacyKeyRow = mysql.RowDataPacket & { version: number; encrypted_secret: string | null }
type SqlExecutor = mysql.Pool | mysql.PoolConnection

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function buildAssessmentCostFingerprint(input: FingerprintInput) {
  return sha256(JSON.stringify({
    policyVersion: ASSESSMENT_COST_POLICY_VERSION,
    ...input,
    skuPrices: FIXED_ASSESSMENT_SKUS.map(({ key, amountFen }) => [key, amountFen]),
  }))
}

function fingerprint(input: FingerprintSourceInput) {
  const provider = input.provider?.trim()
  const apiBaseUrl = input.apiBaseUrl?.trim()
  const model = input.model?.trim()
  if (!provider || !apiBaseUrl || !model || !input.secret) return null
  return buildAssessmentCostFingerprint({
    source: input.source, identityVersion: input.identityVersion, provider, apiBaseUrl, model,
    temperature: input.temperature == null ? null : Number(input.temperature),
    secretDigest: sha256(input.secret), jsonMode: input.jsonMode,
    responseFormat: input.responseFormat, extraBodyJson: input.extraBodyJson,
  })
}

/** Fingerprint the runtime-selected AI config without returning any credential material.
 * lock=true is for transactions that save/activate plans or create orders. */
export async function readAssessmentCostFingerprint(
  executor: SqlExecutor, env: AppEnv, lock = false,
): Promise<string | null> {
  const lockClause = lock ? ' FOR SHARE' : ''
  let head: KeyHeadRow | undefined
  try {
    // A missing singleton row cannot be locked by SELECT ... FOR SHARE.
    // Create it first in transactional callers, so first-time key initialization
    // serializes with plan confirmation and order creation just like later switches.
    if (lock) await executor.query('INSERT IGNORE INTO assessment_key_head (id) VALUES (1)')
    const [rows] = await executor.query<KeyHeadRow[]>(
      `SELECT active_object_id,version,initialized FROM assessment_key_head WHERE id=1${lockClause}`,
    )
    head = rows[0]
  } catch (error) {
    if ((error as { code?: string }).code !== 'ER_NO_SUCH_TABLE') throw error
  }
  const runtime = {
    jsonMode: env.ASSESSMENT_AI_JSON_MODE ?? null,
    responseFormat: env.ASSESSMENT_AI_RESPONSE_FORMAT ?? null,
    extraBodyJson: env.ASSESSMENT_AI_EXTRA_BODY_JSON ?? null,
  }
  if (head && Number(head.initialized)) {
    if (!head.active_object_id || !env.ADMIN_AI_KEY_ENCRYPTION_KEY) return null
    let row: KeyObjectRow | undefined
    try {
      const [rows] = await executor.query<KeyObjectRow[]>(
        `SELECT id,version,provider,api_base_url,model,temperature,encrypted_secret,status
         FROM assessment_key_objects WHERE id=?${lockClause}`, [head.active_object_id],
      )
      row = rows[0]
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_NO_SUCH_TABLE') return null
      throw error
    }
    if (!row || row.status !== 'active' || !row.encrypted_secret) return null
    return fingerprint({
      source: 'assessment-key-object',
      identityVersion: `head:${head.version};object:${row.id};objectVersion:${row.version}`,
      provider: row.provider ?? env.ASSESSMENT_AI_PROVIDER,
      apiBaseUrl: row.api_base_url ?? env.ASSESSMENT_AI_BASE_URL,
      model: row.model ?? env.ASSESSMENT_AI_MODEL,
      temperature: row.temperature ?? env.ASSESSMENT_AI_TEMPERATURE,
      secret: row.encrypted_secret, ...runtime,
    })
  }
  let legacy: LegacyKeyRow | undefined
  try {
    const [rows] = await executor.query<LegacyKeyRow[]>(
      `SELECT version,encrypted_secret FROM admin_control_boxes WHERE box='assessment_key' LIMIT 1${lockClause}`,
    )
    legacy = rows[0]
  } catch (error) {
    if ((error as { code?: string }).code !== 'ER_NO_SUCH_TABLE') throw error
  }
  if (legacy) {
    if (!legacy.encrypted_secret || !env.ADMIN_AI_KEY_ENCRYPTION_KEY) return null
    return fingerprint({
      source: 'legacy-control-box', identityVersion: `legacy:${legacy.version}`,
      provider: env.ASSESSMENT_AI_PROVIDER, apiBaseUrl: env.ASSESSMENT_AI_BASE_URL,
      model: env.ASSESSMENT_AI_MODEL, temperature: env.ASSESSMENT_AI_TEMPERATURE,
      secret: legacy.encrypted_secret, ...runtime,
    })
  }
  return fingerprint({
    source: 'environment', identityVersion: 'environment',
    provider: env.ASSESSMENT_AI_PROVIDER, apiBaseUrl: env.ASSESSMENT_AI_BASE_URL,
    model: env.ASSESSMENT_AI_MODEL, temperature: env.ASSESSMENT_AI_TEMPERATURE,
    secret: env.ASSESSMENT_AI_API_KEY, ...runtime,
  })
}
