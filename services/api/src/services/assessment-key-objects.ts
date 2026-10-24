import { randomBytes, randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import type mysql from 'mysql2/promise'
import { z } from 'zod'
import type { AppEnv } from '../config/env.js'
import { ControlError, pinDigest, sealKey, sixDigitPin, unsealKey, verifyPin } from './admin-control-boxes.js'
import { createJsonModelProvider } from './ai-provider.js'

export const assessmentKeyInput = z.object({
  label: z.string().trim().min(1).max(120),
  provider: z.string().trim().min(1).max(120),
  apiBaseUrl: z.string().trim().url().max(500),
  model: z.string().trim().min(1).max(120),
  temperature: z.number().min(0).max(2).default(0),
  apiKey: z.string().trim().min(8).max(2048),
  note: z.string().trim().max(1000).default(''),
  pin: sixDigitPin,
}).strict()

export type AssessmentKeyInput = z.infer<typeof assessmentKeyInput>
type KeyRow = mysql.RowDataPacket & {
  id: string; label: string; provider: string | null; api_base_url: string | null
  model: string | null; temperature: string | number | null; encrypted_secret: string
  creator_user_id: string; note: string | null; pin_salt: string | null; pin_hash: string | null
  status: 'candidate' | 'active' | 'disabled' | 'archived'; version: number
  failed_attempts: number; pin_locked: number | null; last_test_result: string | null
  last_test_at: Date | null; created_at: Date
}
type HeadRow = mysql.RowDataPacket & {
  active_object_id: string | null; version: number; pin_salt: string | null
  pin_hash: string | null; initialized: number; failed_attempts: number; pin_locked: number | null
}

function hashIndependentPin(pin: string) {
  const salt = randomBytes(16).toString('hex')
  return { salt, hash: pinDigest(pin, salt) }
}
function publicIpv4(address: string) {
  if (isIP(address) !== 4) return false
  const [a, b, c] = address.split('.').map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113))
}
function publicKey(row: KeyRow) {
  return {
    id: row.id, label: row.label, provider: row.provider, apiBaseUrl: row.api_base_url,
    model: row.model, temperature: row.temperature === null ? null : Number(row.temperature),
    creatorUserId: row.creator_user_id, note: row.note, status: row.status,
    version: Number(row.version), hasObjectPin: Boolean(row.pin_hash),
    lastTestResult: row.last_test_result, lastTestAt: row.last_test_at,
    createdAt: row.created_at,
  }
}
async function selectHead(connection: mysql.PoolConnection) {
  await connection.query('INSERT IGNORE INTO assessment_key_head (id) VALUES (1)')
  const [rows] = await connection.query<HeadRow[]>(
    'SELECT *, (locked_until > CURRENT_TIMESTAMP()) AS pin_locked FROM assessment_key_head WHERE id=1 FOR UPDATE',
  )
  return rows[0]!
}
async function selectKey(connection: mysql.PoolConnection, id: string) {
  const [rows] = await connection.query<KeyRow[]>(
    'SELECT *, (locked_until > CURRENT_TIMESTAMP()) AS pin_locked FROM assessment_key_objects WHERE id=? FOR UPDATE', [id],
  )
  return rows[0] ?? null
}
async function requireHeadPin(connection: mysql.PoolConnection, head: HeadRow, pin: string) {
  if (Number(head.pin_locked) === 1) throw new ControlError('control_pin_locked', 429)
  if (!head.pin_salt || !head.pin_hash || !verifyPin(pin, head.pin_salt, head.pin_hash)) {
    const attempts = Number(head.failed_attempts) + 1
    await connection.query(
      `UPDATE assessment_key_head SET failed_attempts=?,
       locked_until=CASE WHEN ? >= 5 THEN DATE_ADD(CURRENT_TIMESTAMP(), INTERVAL 15 MINUTE) ELSE locked_until END
       WHERE id=1`, [attempts, attempts],
    )
    await connection.commit()
    throw new ControlError('control_pin_invalid', 403)
  }
  await connection.query(
    'UPDATE assessment_key_head SET failed_attempts=0,locked_until=NULL WHERE id=1')
}
async function requireObjectPin(connection: mysql.PoolConnection, row: KeyRow, pin: string) {
  if (Number(row.pin_locked) === 1) throw new ControlError('object_pin_locked', 429)
  if (!row.pin_salt || !row.pin_hash) throw new ControlError('object_pin_setup_required', 409)
  if (!verifyPin(pin, row.pin_salt, row.pin_hash)) {
    const attempts = Number(row.failed_attempts) + 1
    await connection.query(
      `UPDATE assessment_key_objects SET failed_attempts=?,
       locked_until=CASE WHEN ? >= 5 THEN DATE_ADD(CURRENT_TIMESTAMP(), INTERVAL 15 MINUTE) ELSE locked_until END
       WHERE id=?`, [attempts, attempts, row.id],
    )
    await connection.commit()
    throw new ControlError('object_pin_invalid', 403)
  }
  await connection.query(
    'UPDATE assessment_key_objects SET failed_attempts=0,locked_until=NULL WHERE id=?', [row.id])
}
async function audit(connection: mysql.PoolConnection, actorId: string,
  action: string, objectId: string | null, version: number) {
  await connection.query(
    'INSERT INTO assessment_key_events (id,object_id,actor_user_id,action,head_version) VALUES (?,?,?,?,?)',
    [randomUUID(), objectId, actorId, action, version],
  )
}

/** Reject local targets and DNS answers. A redirect must also be rejected by the caller. */
export async function validateAssessmentApiUrl(raw: string) {
  let url: URL
  try { url = new URL(raw) } catch { throw new ControlError('assessment_api_url_invalid', 400) }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      (url.port && url.port !== '443') || isIP(url.hostname) ||
      url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ||
      url.hostname.endsWith('.local') || url.hostname.endsWith('.internal')) {
    throw new ControlError('assessment_api_url_forbidden', 400)
  }
  let addresses: Array<{ address: string; family: number }>
  try { addresses = await lookup(url.hostname, { all: true, verbatim: true }) }
  catch { throw new ControlError('assessment_api_dns_failed', 400) }
  if (!addresses.some(({ address }) => publicIpv4(address))) {
    throw new ControlError('assessment_api_url_forbidden', 400)
  }
  return url.origin + url.pathname.replace(/\/+$/, '')
}

/** Resolve once per request, reject private answers, then pin the TLS socket to
 * that checked address. No redirect is followed. */
export async function secureAssessmentModelFetch(endpoint: string, options: {
  method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal
}) {
  await validateAssessmentApiUrl(endpoint)
  const url = new URL(endpoint)
  const answers = await lookup(url.hostname, { all: true, verbatim: true })
  const address = answers.find(({ address }) => publicIpv4(address))
  if (!address) throw new ControlError('assessment_api_dns_failed', 400)
  // Every socket is pinned to the second lookup's checked public IPv4 answer.
  return new Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>((resolve, reject) => {
    const request = httpsRequest(url, {
      method: options.method, headers: options.headers, signal: options.signal,
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
    }, (response) => {
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > 1024 * 1024) {
          request.destroy(new Error('assessment_api_response_too_large'))
          return
        }
        chunks.push(chunk)
      })
      response.on('error', reject)
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        const status = response.statusCode ?? 502
        resolve({ ok: status >= 200 && status < 300, status,
          async json() { return JSON.parse(body) as unknown } })
      })
    })
    request.on('error', reject)
    request.end(options.body)
  })
}

export async function listAssessmentKeys(pool: mysql.Pool) {
  const [heads] = await pool.query<HeadRow[]>(
    'SELECT active_object_id,version,initialized FROM assessment_key_head WHERE id=1',
  )
  const [rows] = await pool.query<KeyRow[]>(
    'SELECT * FROM assessment_key_objects ORDER BY created_at DESC,id DESC',
  )
  return { head: { initialized: Boolean(heads[0]?.initialized), version: Number(heads[0]?.version ?? 0),
    activeObjectId: heads[0]?.active_object_id ?? null }, objects: rows.map(publicKey) }
}

export async function createAssessmentKey(input: {
  pool: mysql.Pool; actorId: string; data: AssessmentKeyInput; masterKey: string
}) {
  const data = assessmentKeyInput.parse(input.data)
  const apiBaseUrl = await validateAssessmentApiUrl(data.apiBaseUrl)
  const encrypted = sealKey(data.apiKey, input.masterKey)
  const objectPin = hashIndependentPin(data.pin)
  const connection = await input.pool.getConnection()
  const id = randomUUID()
  try {
    await connection.beginTransaction()
    const head = await selectHead(connection)
    const first = !Number(head.initialized)
    await connection.query(
      `INSERT INTO assessment_key_objects
       (id,label,provider,api_base_url,model,temperature,encrypted_secret,creator_user_id,
        note,pin_salt,pin_hash,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, data.label, data.provider, apiBaseUrl, data.model, data.temperature, encrypted,
        input.actorId, data.note, objectPin.salt, objectPin.hash, first ? 'active' : 'candidate'],
    )
    if (first) {
      const controlPin = hashIndependentPin(data.pin)
      await connection.query(
        'UPDATE assessment_key_head SET active_object_id=?,version=1,pin_salt=?,pin_hash=?,initialized=1 WHERE id=1',
        [id, controlPin.salt, controlPin.hash],
      )
    }
    await audit(connection, input.actorId, first ? 'initialize' : 'create', id, first ? 1 : Number(head.version))
    await connection.commit()
    return { id, active: first, version: first ? 1 : Number(head.version) }
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}

export async function revealAssessmentKey(input: {
  pool: mysql.Pool; actorId: string; id: string; pin: string; masterKey: string
}) {
  if (!sixDigitPin.safeParse(input.pin).success) throw new ControlError('pin_must_be_six_digits', 400)
  const connection = await input.pool.getConnection()
  try {
    await connection.beginTransaction()
    const row = await selectKey(connection, input.id)
    if (!row || row.status === 'archived') throw new ControlError('assessment_key_not_found', 404)
    if (row.creator_user_id !== input.actorId) throw new ControlError('assessment_key_creator_required', 403)
    await requireObjectPin(connection, row, input.pin)
    const secret = unsealKey(row.encrypted_secret, input.masterKey)
    const [heads] = await connection.query<HeadRow[]>('SELECT version FROM assessment_key_head WHERE id=1')
    await audit(connection, input.actorId, 'reveal', row.id, Number(heads[0]?.version ?? 0))
    await connection.commit()
    return { apiKey: secret }
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}

export async function setLegacyAssessmentKeyPin(input: {
  pool: mysql.Pool; actorId: string; id: string; currentPin: string; newPin: string
}) {
  if (!sixDigitPin.safeParse(input.newPin).success || !sixDigitPin.safeParse(input.currentPin).success) {
    throw new ControlError('pin_must_be_six_digits', 400)
  }
  const connection = await input.pool.getConnection()
  try {
    await connection.beginTransaction()
    const head = await selectHead(connection)
    if (!Number(head.initialized)) throw new ControlError('assessment_key_not_initialized', 409)
    await requireHeadPin(connection, head, input.currentPin)
    const row = await selectKey(connection, input.id)
    if (!row) throw new ControlError('assessment_key_not_found', 404)
    if (row.creator_user_id !== input.actorId) throw new ControlError('assessment_key_creator_required', 403)
    if (row.pin_hash) throw new ControlError('object_pin_already_configured', 409)
    const pin = hashIndependentPin(input.newPin)
    await connection.query('UPDATE assessment_key_objects SET pin_salt=?,pin_hash=? WHERE id=?',
      [pin.salt, pin.hash, row.id])
    await audit(connection, input.actorId, 'set_legacy_pin', row.id, Number(head.version))
    await connection.commit()
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}

export async function switchAssessmentKey(input: {
  pool: mysql.Pool; actorId: string; id: string; expectedVersion: number
  currentPin: string; targetPin: string
}) {
  if (!sixDigitPin.safeParse(input.currentPin).success || !sixDigitPin.safeParse(input.targetPin).success) {
    throw new ControlError('pin_must_be_six_digits', 400)
  }
  const connection = await input.pool.getConnection()
  try {
    await connection.beginTransaction()
    const head = await selectHead(connection)
    if (!Number(head.initialized)) throw new ControlError('assessment_key_not_initialized', 409)
    if (Number(head.version) !== input.expectedVersion) throw new ControlError('control_version_conflict', 409)
    await requireHeadPin(connection, head, input.currentPin)
    const target = await selectKey(connection, input.id)
    if (!target || target.status === 'archived') throw new ControlError('assessment_key_not_found', 404)
    await requireObjectPin(connection, target, input.targetPin)
    if (!target.provider || !target.api_base_url || !target.model) {
      throw new ControlError('assessment_key_connection_incomplete', 409)
    }
    if (head.active_object_id && head.active_object_id !== target.id) {
      await connection.query("UPDATE assessment_key_objects SET status='candidate' WHERE id=?", [head.active_object_id])
    }
    await connection.query("UPDATE assessment_key_objects SET status='active',version=version+1,failed_attempts=0,locked_until=NULL WHERE id=?", [target.id])
    const pin = hashIndependentPin(input.targetPin)
    const version = Number(head.version) + 1
    await connection.query(
      'UPDATE assessment_key_head SET active_object_id=?,version=?,pin_salt=?,pin_hash=?,failed_attempts=0,locked_until=NULL WHERE id=1',
      [target.id, version, pin.salt, pin.hash],
    )
    await audit(connection, input.actorId, 'activate', target.id, version)
    await connection.commit()
    return { activeObjectId: target.id, version }
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}

export async function disableAssessmentKey(input: {
  pool: mysql.Pool; actorId: string; expectedVersion: number; currentPin: string
}) {
  if (!sixDigitPin.safeParse(input.currentPin).success) throw new ControlError('pin_must_be_six_digits', 400)
  const connection = await input.pool.getConnection()
  try {
    await connection.beginTransaction()
    const head = await selectHead(connection)
    if (!Number(head.initialized) || !head.active_object_id) throw new ControlError('assessment_key_not_active', 409)
    if (Number(head.version) !== input.expectedVersion) throw new ControlError('control_version_conflict', 409)
    await requireHeadPin(connection, head, input.currentPin)
    await connection.query("UPDATE assessment_key_objects SET status='disabled' WHERE id=?", [head.active_object_id])
    const version = Number(head.version) + 1
    await connection.query('UPDATE assessment_key_head SET active_object_id=NULL,version=? WHERE id=1', [version])
    await audit(connection, input.actorId, 'disable', head.active_object_id, version)
    await connection.commit()
    return { activeObjectId: null, version }
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}

export async function archiveAssessmentKey(input: {
  pool: mysql.Pool; actorId: string; id: string; expectedVersion: number; currentPin: string
}) {
  if (!sixDigitPin.safeParse(input.currentPin).success) throw new ControlError('pin_must_be_six_digits', 400)
  const connection = await input.pool.getConnection()
  try {
    await connection.beginTransaction()
    const head = await selectHead(connection)
    if (!Number(head.initialized)) throw new ControlError('assessment_key_not_initialized', 409)
    if (Number(head.version) !== input.expectedVersion) throw new ControlError('control_version_conflict', 409)
    await requireHeadPin(connection, head, input.currentPin)
    if (head.active_object_id === input.id) throw new ControlError('assessment_key_active', 409)
    const row = await selectKey(connection, input.id)
    if (!row) throw new ControlError('assessment_key_not_found', 404)
    await connection.query("UPDATE assessment_key_objects SET status='archived' WHERE id=?", [input.id])
    await audit(connection, input.actorId, 'archive', input.id, Number(head.version))
    await connection.commit()
    return { archived: true }
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}

export async function readActiveAssessmentKey(pool: mysql.Pool, env: AppEnv) {
  const [heads] = await pool.query<HeadRow[]>(
    'SELECT active_object_id,initialized FROM assessment_key_head WHERE id=1',
  )
  const head = heads[0]
  if (!head || !Number(head.initialized)) return { initialized: false as const, config: null }
  if (!head.active_object_id) return { initialized: true as const, config: null }
  const [rows] = await pool.query<KeyRow[]>(
    "SELECT * FROM assessment_key_objects WHERE id=? AND status='active' LIMIT 1", [head.active_object_id],
  )
  const row = rows[0]
  if (!row || !env.ADMIN_AI_KEY_ENCRYPTION_KEY) {
    throw new ControlError('assessment_key_vault_unavailable', 503)
  }
  return { initialized: true as const, config: {
    provider: row.provider ?? env.ASSESSMENT_AI_PROVIDER,
    apiBaseUrl: row.api_base_url ?? env.ASSESSMENT_AI_BASE_URL,
    model: row.model ?? env.ASSESSMENT_AI_MODEL,
    temperature: row.temperature === null ? env.ASSESSMENT_AI_TEMPERATURE : Number(row.temperature),
    apiKey: unsealKey(row.encrypted_secret, env.ADMIN_AI_KEY_ENCRYPTION_KEY),
  } }
}

export async function testAssessmentKey(input: {
  pool: mysql.Pool; actorId: string; id: string; pin: string; env: AppEnv
  probe?: (config: { provider: string | undefined; baseUrl: string; model: string;
    apiKey: string }) => Promise<boolean>
}) {
  if (!sixDigitPin.safeParse(input.pin).success) throw new ControlError('pin_must_be_six_digits', 400)
  const authorization = await input.pool.getConnection()
  let row: KeyRow
  try {
    await authorization.beginTransaction()
    const selected = await selectKey(authorization, input.id)
    if (!selected || selected.status === 'archived') throw new ControlError('assessment_key_not_found', 404)
    await requireObjectPin(authorization, selected, input.pin)
    row = selected
    await authorization.commit()
  } catch (error) { await authorization.rollback(); throw error }
  finally { authorization.release() }
  if (!input.env.ADMIN_AI_KEY_ENCRYPTION_KEY) throw new ControlError('key_vault_master_key_missing', 503)
  const baseUrl = row.api_base_url ?? input.env.ASSESSMENT_AI_BASE_URL
  if (!baseUrl || !row.model) throw new ControlError('assessment_key_connection_incomplete', 409)
  const config = { provider: row.provider ?? input.env.ASSESSMENT_AI_PROVIDER,
    baseUrl, model: row.model,
    apiKey: unsealKey(row.encrypted_secret, input.env.ADMIN_AI_KEY_ENCRYPTION_KEY) }
  let passed = false
  try {
    if (input.probe) passed = await input.probe(config)
    else {
      await validateAssessmentApiUrl(baseUrl)
      const provider = createJsonModelProvider({
        ...config, timeoutMs: 5000, jsonMode: true, temperature: 0,
        transport: secureAssessmentModelFetch,
      })
      await provider.generateJson({ system: '只返回 JSON 对象 {"ok":true}。', user: '连接测试', maxTokens: 32 })
      passed = true
    }
  } catch { /* Only the bounded result is persisted or returned. */ }
  const connection = await input.pool.getConnection()
  try {
    await connection.beginTransaction()
    await connection.query(
      'UPDATE assessment_key_objects SET last_test_result=?,last_test_at=CURRENT_TIMESTAMP() WHERE id=?',
      [passed ? 'passed' : 'failed', input.id],
    )
    const [heads] = await connection.query<HeadRow[]>('SELECT version FROM assessment_key_head WHERE id=1')
    await audit(connection, input.actorId, 'test', input.id, Number(heads[0]?.version ?? 0))
    await connection.commit()
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
  return { reachable: passed, mayIncurCost: true }
}
