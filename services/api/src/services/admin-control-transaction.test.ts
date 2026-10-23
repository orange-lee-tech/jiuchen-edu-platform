import assert from 'node:assert/strict'
import test from 'node:test'
import type mysql from 'mysql2/promise'
import { activateControlDraft, ControlError, readControlDraft, saveControlBox, saveControlDraft,
  unsealKey, verifyPin } from './admin-control-boxes.js'

test('separate six-digit boxes rotate version and PIN for any authenticated admin', async () => {
  const boxes = new Map<string, Record<string, unknown>>()
  const audits: unknown[][] = []
  const conn = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql: string, values: unknown[] = []): Promise<[Record<string, unknown>[], unknown]> {
      if (sql.startsWith('SELECT * FROM admin_control_boxes')) {
        const row = boxes.get(String(values[0])); return [row ? [row] : [], null]
      }
      if (sql.startsWith('INSERT INTO admin_control_boxes')) {
        const [box, version, salt, digest, owner, payload, secret] = values
        boxes.set(String(box), { box, version, pin_salt: salt, pin_hash: digest,
          owner_user_id: owner, payload_json: payload, encrypted_secret: secret,
          failed_attempts: 0, locked_until: null })
      } else if (sql.startsWith('UPDATE admin_control_boxes SET version=')) {
        const [version, salt, digest, payload, secret, box] = values
        Object.assign(boxes.get(String(box))!, { version, pin_salt: salt, pin_hash: digest,
          payload_json: payload, encrypted_secret: secret, failed_attempts: 0, locked_until: null })
      } else if (sql.includes('failed_attempts = ?')) {
        boxes.get(String(values[2]))!.failed_attempts = values[0]
      } else if (sql.startsWith('INSERT INTO admin_control_audit')) {
        audits.push(values)
      }
      return [[], null]
    },
  }
  const pool = { async getConnection() { return conn } } as unknown as mysql.Pool
  const settings = { singleFen: 190, tenFen: 1690, guestFree: 1,
    studentTotalFree: 5, platformPriceConfirmed: false, estimatedCostFen: null }
  const masterKey = Buffer.alloc(32, 7).toString('base64')
  const created = await saveControlBox({ pool, box: 'settings', actorId: 'admin-a',
    expectedVersion: 0, newPin: '123456', settings })
  assert.equal(created.version, 1)
  await saveControlBox({ pool, box: 'assessment_key', actorId: 'admin-a',
    expectedVersion: 0, newPin: '654321', secret: 'test-model-key', masterKey })
  assert.notEqual(boxes.get('settings')!.pin_hash, boxes.get('assessment_key')!.pin_hash)
  await assert.rejects(() => saveControlBox({ pool, box: 'settings', actorId: 'admin-b',
    expectedVersion: 1, currentPin: '654321', newPin: '111111', settings }),
  (error: unknown) => error instanceof ControlError && error.code === 'control_pin_invalid')
  assert.equal(boxes.get('settings')!.version, 1)
  assert.equal(boxes.get('settings')!.failed_attempts, 1)
  const changed = await saveControlBox({ pool, box: 'settings', actorId: 'admin-b',
    expectedVersion: 1, currentPin: '123456', newPin: '123456', settings })
  assert.equal(changed.version, 2)
  assert.equal(verifyPin('123456', String(boxes.get('settings')!.pin_salt),
    String(boxes.get('settings')!.pin_hash)), true)
  const keyChanged = await saveControlBox({ pool, box: 'assessment_key', actorId: 'admin-b',
    expectedVersion: 1, currentPin: '654321', newPin: '999999',
    secret: 'another-model-key', masterKey })
  assert.equal(keyChanged.version, 2)
  assert.equal(verifyPin('999999', String(boxes.get('assessment_key')!.pin_salt),
    String(boxes.get('assessment_key')!.pin_hash)), true)
  assert.equal(audits.length, 4)
})

test('encrypted key draft activation is atomic, private, version-bound, and PIN-locked', async () => {
  const boxes = new Map<string, Record<string, unknown>>()
  const drafts = new Map<string, Record<string, unknown>>()
  const audits: unknown[][] = []
  let failDraftDelete = false
  let snapshot: {
    boxes: Map<string, Record<string, unknown>>
    drafts: Map<string, Record<string, unknown>>
    audits: unknown[][]
  } | null = null
  const cloneMap = (source: Map<string, Record<string, unknown>>) =>
    new Map([...source].map(([key, value]) => [key, { ...value }]))
  const conn = {
    async beginTransaction() {
      snapshot = { boxes: cloneMap(boxes), drafts: cloneMap(drafts), audits: audits.map((row) => [...row]) }
    },
    async commit() { snapshot = null },
    async rollback() {
      if (!snapshot) return
      boxes.clear()
      for (const [key, value] of snapshot.boxes) boxes.set(key, { ...value })
      drafts.clear()
      for (const [key, value] of snapshot.drafts) drafts.set(key, { ...value })
      audits.splice(0, audits.length, ...snapshot.audits.map((row) => [...row]))
      snapshot = null
    },
    release() {},
    async query(sql: string, values: unknown[] = []): Promise<[any, unknown]> {
      if (sql.startsWith('SELECT * FROM admin_control_boxes')) {
        const row = boxes.get(String(values[0])); return [row ? [row] : [], null]
      }
      if (sql.startsWith('SELECT * FROM admin_control_drafts')) {
        const row = drafts.get(String(values[0]) + ':' + String(values[1])); return [row ? [row] : [], null]
      }
      if (sql.startsWith('INSERT INTO admin_control_boxes')) {
        const [box, version, salt, digest, owner, payload, secret] = values
        boxes.set(String(box), { box, version, pin_salt: salt, pin_hash: digest,
          owner_user_id: owner, payload_json: payload, encrypted_secret: secret,
          failed_attempts: 0, locked_until: null })
      } else if (sql.startsWith('UPDATE admin_control_boxes SET version=')) {
        const [version, salt, digest, payload, secret, box] = values
        Object.assign(boxes.get(String(box))!, { version, pin_salt: salt, pin_hash: digest,
          payload_json: payload, encrypted_secret: secret, failed_attempts: 0, locked_until: null })
      } else if (sql.startsWith('UPDATE admin_control_boxes SET failed_attempts')) {
        const row = boxes.get(String(values[2]))
        if (row) {
          const attempts = Number(values[0])
          row.failed_attempts = attempts
          if (attempts >= 5) row.locked_until = new Date(Date.now() + 15 * 60 * 1000)
        }
      } else if (sql.startsWith('INSERT INTO admin_control_drafts')) {
        const [box, actor, based, payload, secret] = values
        drafts.set(String(box) + ':' + String(actor), { box, actor_user_id: actor, based_on_version: based,
          payload_json: payload, encrypted_secret: secret })
      } else if (sql.startsWith('DELETE FROM admin_control_drafts')) {
        if (failDraftDelete) {
          failDraftDelete = false
          throw new Error('injected draft delete failure')
        }
        const key = String(values[0]) + ':' + String(values[1])
        const draft = drafts.get(key)
        const matches = Boolean(draft) && Number(draft!.based_on_version) === Number(values[2])
        if (matches) drafts.delete(key)
        return [{ affectedRows: matches ? 1 : 0 }, null]
      } else if (sql.startsWith('INSERT INTO admin_control_audit')) {
        audits.push(values)
      }
      return [[], null]
    },
  }
  const pool = {
    async getConnection() { return conn },
    async query(sql: string, values: unknown[]) { return conn.query(sql, values) },
  } as unknown as mysql.Pool
  const masterKey = Buffer.alloc(32, 7).toString('base64')

  await saveControlBox({ pool, box: 'assessment_key', actorId: 'admin-a',
    expectedVersion: 0, newPin: '123456', secret: 'old-model-key', masterKey })
  await saveControlDraft({ pool, box: 'assessment_key', actorId: 'admin-b',
    expectedVersion: 1, secret: 'new-model-key', masterKey })
  assert.equal((await readControlDraft(pool, 'assessment_key', 'admin-a')).saved, false)
  assert.equal((await readControlDraft(pool, 'assessment_key', 'admin-b')).saved, true)
  assert.notEqual(drafts.get('assessment_key:admin-b')!.encrypted_secret, 'new-model-key')
  assert.equal(unsealKey(String(boxes.get('assessment_key')!.encrypted_secret), masterKey), 'old-model-key')

  await assert.rejects(() => activateControlDraft({ pool, box: 'assessment_key', actorId: 'admin-b',
    expectedVersion: 1, currentPin: '000000', newPin: '987654', masterKey }),
  (error: unknown) => error instanceof ControlError && error.code === 'control_pin_invalid')
  assert.equal(unsealKey(String(boxes.get('assessment_key')!.encrypted_secret), masterKey), 'old-model-key')

  failDraftDelete = true
  await assert.rejects(() => activateControlDraft({ pool, box: 'assessment_key', actorId: 'admin-b',
    expectedVersion: 1, currentPin: '123456', newPin: '987654', masterKey }),
  /injected draft delete failure/)
  assert.equal(Number(boxes.get('assessment_key')!.version), 1)
  assert.equal(unsealKey(String(boxes.get('assessment_key')!.encrypted_secret), masterKey), 'old-model-key')
  assert.equal((await readControlDraft(pool, 'assessment_key', 'admin-b')).saved, true)
  assert.equal(audits.length, 1, 'audit write must roll back with failed draft consumption')

  const activated = await activateControlDraft({ pool, box: 'assessment_key', actorId: 'admin-b',
    expectedVersion: 1, currentPin: '123456', newPin: '987654', masterKey })
  assert.equal(activated.version, 2)
  assert.equal(unsealKey(String(boxes.get('assessment_key')!.encrypted_secret), masterKey), 'new-model-key')
  assert.equal((await readControlDraft(pool, 'assessment_key', 'admin-b')).saved, false)

  await saveControlDraft({ pool, box: 'assessment_key', actorId: 'admin-b',
    expectedVersion: 2, secret: 'stale-model-key', masterKey })
  await saveControlBox({ pool, box: 'assessment_key', actorId: 'admin-a',
    expectedVersion: 2, currentPin: '987654', newPin: '987654',
    secret: 'third-model-key', masterKey })
  await assert.rejects(() => activateControlDraft({ pool, box: 'assessment_key', actorId: 'admin-b',
    expectedVersion: 2, currentPin: '987654', newPin: '111111', masterKey }),
  (error: unknown) => error instanceof ControlError && error.code === 'control_version_conflict')
  assert.equal((await readControlDraft(pool, 'assessment_key', 'admin-b')).saved, true)
  assert.equal(unsealKey(String(boxes.get('assessment_key')!.encrypted_secret), masterKey), 'third-model-key')

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(() => saveControlBox({ pool, box: 'assessment_key', actorId: 'admin-b',
      expectedVersion: 3, currentPin: '000000', newPin: '111111',
      secret: 'ignored-model-key', masterKey }),
    (error: unknown) => error instanceof ControlError && error.code === 'control_pin_invalid')
  }
  await assert.rejects(() => saveControlBox({ pool, box: 'assessment_key', actorId: 'admin-b',
    expectedVersion: 3, currentPin: '987654', newPin: '987654',
    secret: 'ignored-model-key', masterKey }),
  (error: unknown) => error instanceof ControlError && error.code === 'control_pin_locked')
  assert.equal(Number(boxes.get('assessment_key')!.version), 3)
  assert.equal(unsealKey(String(boxes.get('assessment_key')!.encrypted_secret), masterKey), 'third-model-key')
})
