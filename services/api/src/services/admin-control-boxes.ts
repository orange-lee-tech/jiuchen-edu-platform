import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import type mysql from 'mysql2/promise'
import { z } from 'zod'

export const sixDigitPin = z.string().regex(/^[0-9]{6}$/)
export const settingsSchema = z.object({
  singleFen: z.number().int().min(1).max(100000),
  tenFen: z.number().int().min(1).max(1000000),
  guestFree: z.number().int().min(0).max(100),
  studentTotalFree: z.number().int().min(0).max(100),
  platformPriceConfirmed: z.boolean(),
  estimatedCostFen: z.number().int().positive().max(100000).nullable(),
}).strict().refine((value) => value.studentTotalFree >= value.guestFree, 'student_total_below_guest')
  .refine((value) => !value.platformPriceConfirmed ||
    (value.estimatedCostFen !== null &&
      value.singleFen * 10 >= value.estimatedCostFen * 12 &&
      value.tenFen >= value.estimatedCostFen * 12),
  'price_below_estimated_cost_reserve')
export type AdminSettings = z.infer<typeof settingsSchema>
export type ControlBox = 'settings' | 'assessment_key'

export class ControlError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code) }
}

function pinDigest(pin: string, salt: string) {
  return scryptSync(pin, Buffer.from(salt, 'hex'), 64).toString('hex')
}
export function verifyPin(pin: string, salt: string, digest: string) {
  const expected = Buffer.from(digest, 'hex')
  const actual = Buffer.from(pinDigest(pin, salt), 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function encryptionKey(encoded: string | undefined) {
  if (!encoded) throw new ControlError('key_vault_master_key_missing', 503)
  const key = Buffer.from(encoded, 'base64')
  if (key.length !== 32) throw new ControlError('key_vault_master_key_invalid', 503)
  return key
}
export function sealKey(secret: string, masterKey: string) {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(masterKey), nonce)
  cipher.setAAD(Buffer.from('jiuchen:assessment_key:v1'))
  const content = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return [nonce, cipher.getAuthTag(), content].map((part) => part.toString('base64url')).join('.')
}
export function unsealKey(encoded: string, masterKey: string) {
  const pieces = encoded.split('.')
  if (pieces.length !== 3) throw new ControlError('key_vault_data_invalid', 503)
  const [nonce, tag, content] = pieces.map((piece) => Buffer.from(piece, 'base64url'))
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(masterKey), nonce)
  decipher.setAAD(Buffer.from('jiuchen:assessment_key:v1'))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(content), decipher.final()]).toString('utf8')
}

type BoxRow = mysql.RowDataPacket & {
  box: ControlBox; version: number; pin_salt: string; pin_hash: string
  owner_user_id: string; payload_json: unknown; encrypted_secret: string | null
  failed_attempts: number; locked_until: Date | null; updated_at: Date
}
type DraftRow = mysql.RowDataPacket & {
  box: ControlBox; actor_user_id: string; based_on_version: number
  payload_json: unknown; encrypted_secret: string | null; updated_at: Date
}
function decodeSettings(value: unknown): AdminSettings | null {
  try {
    return settingsSchema.parse(typeof value === 'string' ? JSON.parse(value) : value)
  } catch { return null }
}
export async function readControlBox(pool: mysql.Pool, box: ControlBox) {
  const [rows] = await pool.query<BoxRow[]>('SELECT * FROM admin_control_boxes WHERE box = ? LIMIT 1', [box])
  return rows[0] ?? null
}
export function publicControlBox(row: BoxRow | null, box: ControlBox) {
  if (!row) return { box, configured: false, version: 0, ownerUserId: null, settings: null }
  return {
    box, configured: true, version: Number(row.version),
    ownerUserId: row.owner_user_id,
    settings: box === 'settings' ? decodeSettings(row.payload_json) : null,
    updatedAt: row.updated_at,
  }
}

export async function readControlDraft(pool: mysql.Pool, box: ControlBox, actorId: string) {
  const [rows] = await pool.query<DraftRow[]>(
    'SELECT * FROM admin_control_drafts WHERE box = ? AND actor_user_id = ? LIMIT 1', [box, actorId],
  )
  const row = rows[0]
  if (!row) return { saved: false, basedOnVersion: null, settings: null }
  return { saved: true, basedOnVersion: Number(row.based_on_version),
    settings: box === 'settings' ? decodeSettings(row.payload_json) : null, updatedAt: row.updated_at }
}

export async function saveControlDraft(input: {
  pool: mysql.Pool; box: ControlBox; actorId: string; expectedVersion: number
  settings?: AdminSettings; secret?: string; masterKey?: string
}) {
  if (input.box === 'settings' && !settingsSchema.safeParse(input.settings).success) {
    throw new ControlError('invalid_commercial_settings', 400)
  }
  if (input.box === 'assessment_key' && (!input.secret || input.secret.length > 2048)) {
    throw new ControlError('invalid_assessment_key', 400)
  }
  const sealed = input.box === 'assessment_key' ? sealKey(input.secret!, input.masterKey ?? '') : null
  const connection = await input.pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query<BoxRow[]>(
      'SELECT * FROM admin_control_boxes WHERE box = ? LIMIT 1 FOR UPDATE', [input.box],
    )
    if ((rows[0] ? Number(rows[0].version) : 0) !== input.expectedVersion) {
      throw new ControlError('control_version_conflict', 409)
    }
    await connection.query(
      `INSERT INTO admin_control_drafts (box,actor_user_id,based_on_version,payload_json,encrypted_secret)
       VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE based_on_version=VALUES(based_on_version),
       payload_json=VALUES(payload_json),encrypted_secret=VALUES(encrypted_secret)`,
      [input.box, input.actorId, input.expectedVersion,
        input.box === 'settings' ? JSON.stringify(input.settings) : null, sealed],
    )
    await connection.commit()
    return { saved: true, active: false, basedOnVersion: input.expectedVersion }
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}

export async function activateControlDraft(input: {
  pool: mysql.Pool; box: ControlBox; actorId: string; expectedVersion: number
  currentPin?: string; newPin: string; masterKey?: string
}) {
  if (!sixDigitPin.safeParse(input.newPin).success ||
      (input.currentPin !== undefined && !sixDigitPin.safeParse(input.currentPin).success)) {
    throw new ControlError('pin_must_be_six_digits', 400)
  }

  const connection = await input.pool.getConnection()
  let committed = false
  try {
    await connection.beginTransaction()

    // Lock order is always control box first, then draft. Draft activation and
    // draft saving therefore serialize against both config changes and edits
    // to the same administrator's draft.
    const [boxRows] = await connection.query<BoxRow[]>(
      'SELECT * FROM admin_control_boxes WHERE box = ? LIMIT 1 FOR UPDATE', [input.box],
    )
    const row = boxRows[0]
    const [draftRows] = await connection.query<DraftRow[]>(
      'SELECT * FROM admin_control_drafts WHERE box = ? AND actor_user_id = ? LIMIT 1 FOR UPDATE',
      [input.box, input.actorId],
    )
    const draft = draftRows[0]
    if (!draft) throw new ControlError('control_draft_missing', 404)

    const activeVersion = row ? Number(row.version) : 0
    if (Number(draft.based_on_version) !== input.expectedVersion ||
        activeVersion !== input.expectedVersion) {
      throw new ControlError('control_version_conflict', 409)
    }

    const settings = input.box === 'settings' ? decodeSettings(draft.payload_json) : undefined
    const secret = input.box === 'assessment_key' && draft.encrypted_secret
      ? unsealKey(draft.encrypted_secret, input.masterKey ?? '') : undefined
    if (input.box === 'settings' && !settings) {
      throw new ControlError('invalid_commercial_settings', 400)
    }
    if (input.box === 'assessment_key' && (!secret || secret.length < 8 || secret.length > 2048)) {
      throw new ControlError('invalid_assessment_key', 400)
    }
    const encryptedSecret = input.box === 'assessment_key'
      ? sealKey(secret!, input.masterKey ?? '') : null

    if (row) {
      if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
        throw new ControlError('control_pin_locked', 429)
      }
      const valid = input.currentPin && verifyPin(input.currentPin, row.pin_salt, row.pin_hash)
      if (!valid) {
        const attempts = Number(row.failed_attempts) + 1
        await connection.query(
          'UPDATE admin_control_boxes SET failed_attempts = ?, locked_until = CASE WHEN ? >= 5 THEN DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE) ELSE locked_until END WHERE box = ?',
          [attempts, attempts, input.box],
        )
        await connection.commit()
        committed = true
        throw new ControlError('control_pin_invalid', 403)
      }
    } else if (input.currentPin) {
      throw new ControlError('control_not_initialized', 409)
    }

    const salt = randomBytes(16).toString('hex')
    const digest = pinDigest(input.newPin, salt)
    const version = activeVersion + 1
    if (row) {
      await connection.query(
        'UPDATE admin_control_boxes SET version=?,pin_salt=?,pin_hash=?,payload_json=?,encrypted_secret=?,failed_attempts=0,locked_until=NULL WHERE box=?',
        [version, salt, digest, input.box === 'settings' ? JSON.stringify(settings) : null,
          encryptedSecret, input.box],
      )
    } else {
      await connection.query(
        'INSERT INTO admin_control_boxes (box,version,pin_salt,pin_hash,owner_user_id,payload_json,encrypted_secret) VALUES (?,?,?,?,?,?,?)',
        [input.box, version, salt, digest, input.actorId,
          input.box === 'settings' ? JSON.stringify(settings) : null, encryptedSecret],
      )
    }
    await connection.query(
      'INSERT INTO admin_control_audit (id,box,actor_user_id,action,version) VALUES (?,?,?,?,?)',
      [randomUUID(), input.box, input.actorId, row ? 'update' : 'initialize', version],
    )

    // The active config, audit event and draft consumption are one transaction.
    // A failed DELETE must roll back the config change and keep the draft usable.
    const [deleted] = await connection.query<mysql.ResultSetHeader>(
      'DELETE FROM admin_control_drafts WHERE box = ? AND actor_user_id = ? AND based_on_version = ?',
      [input.box, input.actorId, input.expectedVersion],
    )
    if (deleted.affectedRows !== 1) {
      throw new ControlError('control_draft_conflict', 409)
    }

    await connection.commit()
    committed = true
    return { box: input.box, version, configured: true }
  } catch (error) {
    if (!committed) await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
export async function saveControlBox(input: {
  pool: mysql.Pool; box: ControlBox; actorId: string; expectedVersion: number
  currentPin?: string; newPin: string; settings?: AdminSettings
  secret?: string; masterKey?: string
}) {
  if (!sixDigitPin.safeParse(input.newPin).success ||
      (input.currentPin !== undefined && !sixDigitPin.safeParse(input.currentPin).success)) {
    throw new ControlError('pin_must_be_six_digits', 400)
  }
  if (input.box === 'settings' && !settingsSchema.safeParse(input.settings).success) {
    throw new ControlError('invalid_commercial_settings', 400)
  }
  if (input.box === 'assessment_key' && (!input.secret || input.secret.length > 2048)) {
    throw new ControlError('invalid_assessment_key', 400)
  }
  // Validate the server-owned encryption key before opening the transaction.
  const encryptedSecret = input.box === 'assessment_key'
    ? sealKey(input.secret!, input.masterKey ?? '') : null
  const connection = await input.pool.getConnection()
  let committed = false
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query<BoxRow[]>(
      'SELECT * FROM admin_control_boxes WHERE box = ? LIMIT 1 FOR UPDATE', [input.box],
    )
    const row = rows[0]
    if ((row ? Number(row.version) : 0) !== input.expectedVersion) {
      throw new ControlError('control_version_conflict', 409)
    }
    if (row) {
      if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
        throw new ControlError('control_pin_locked', 429)
      }
      const valid = input.currentPin && verifyPin(input.currentPin, row.pin_salt, row.pin_hash)
      if (!valid) {
        const attempts = Number(row.failed_attempts) + 1
        await connection.query(
          `UPDATE admin_control_boxes SET failed_attempts = ?,
            locked_until = CASE WHEN ? >= 5 THEN DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE) ELSE locked_until END
           WHERE box = ?`, [attempts, attempts, input.box],
        )
        await connection.commit()
        committed = true
        throw new ControlError('control_pin_invalid', 403)
      }
    } else if (input.currentPin) {
      throw new ControlError('control_not_initialized', 409)
    }
    const salt = randomBytes(16).toString('hex')
    const digest = pinDigest(input.newPin, salt)
    const version = (row ? Number(row.version) : 0) + 1
    if (row) {
      await connection.query(
        `UPDATE admin_control_boxes SET version=?,pin_salt=?,pin_hash=?,
           payload_json=?,encrypted_secret=?,failed_attempts=0,locked_until=NULL WHERE box=?`,
        [version, salt, digest, input.box === 'settings' ? JSON.stringify(input.settings) : null,
          encryptedSecret, input.box],
      )
    } else {
      await connection.query(
        `INSERT INTO admin_control_boxes
         (box,version,pin_salt,pin_hash,owner_user_id,payload_json,encrypted_secret)
         VALUES (?,?,?,?,?,?,?)`,
        [input.box, version, salt, digest, input.actorId,
          input.box === 'settings' ? JSON.stringify(input.settings) : null, encryptedSecret],
      )
    }
    await connection.query(
      'INSERT INTO admin_control_audit (id,box,actor_user_id,action,version) VALUES (?,?,?,?,?)',
      [randomUUID(), input.box, input.actorId, row ? 'update' : 'initialize', version],
    )
    await connection.commit()
    committed = true
    return { box: input.box, version, configured: true }
  } catch (error) {
    if (!committed) await connection.rollback()
    throw error
  } finally { connection.release() }
}

export async function authorizeKeyUse(input: {
  pool: mysql.Pool; actorId: string; pin: string
}) {
  if (!sixDigitPin.safeParse(input.pin).success) throw new ControlError('pin_must_be_six_digits', 400)
  const connection = await input.pool.getConnection()
  let committed = false
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query<BoxRow[]>(
      "SELECT * FROM admin_control_boxes WHERE box='assessment_key' FOR UPDATE",
    )
    const row = rows[0]
    if (!row) throw new ControlError('assessment_key_not_configured', 503)
    if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
      throw new ControlError('control_pin_locked', 429)
    }
    if (!verifyPin(input.pin, row.pin_salt, row.pin_hash)) {
      const attempts = Number(row.failed_attempts) + 1
      await connection.query(
        `UPDATE admin_control_boxes SET failed_attempts=?,
         locked_until=CASE WHEN ? >= 5 THEN DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE) ELSE locked_until END
         WHERE box='assessment_key'`, [attempts, attempts],
      )
      await connection.commit()
      committed = true
      throw new ControlError('control_pin_invalid', 403)
    }
    await connection.query(
      "UPDATE admin_control_boxes SET failed_attempts=0,locked_until=NULL WHERE box='assessment_key'",
    )
    await connection.query(
      'INSERT INTO admin_control_audit (id,box,actor_user_id,action,version) VALUES (?,?,?,?,?)',
      [randomUUID(), 'assessment_key', input.actorId, 'authorize_test', row.version],
    )
    await connection.commit()
    committed = true
    return row.encrypted_secret
  } catch (error) {
    if (!committed) await connection.rollback()
    throw error
  } finally { connection.release() }
}
