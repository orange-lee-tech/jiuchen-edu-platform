import assert from 'node:assert/strict'
import test from 'node:test'
import type mysql from 'mysql2/promise'
import { ControlError, saveControlBox, verifyPin } from './admin-control-boxes.js'

test('separate six-digit boxes rotate version and PIN; key owner and lockout are enforced', async () => {
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
  await assert.rejects(() => saveControlBox({ pool, box: 'assessment_key', actorId: 'admin-b',
    expectedVersion: 1, currentPin: '654321', newPin: '999999',
    secret: 'another-model-key', masterKey }),
  (error: unknown) => error instanceof ControlError && error.code === 'assessment_key_owner_required')
  assert.equal(audits.length, 3)
})
