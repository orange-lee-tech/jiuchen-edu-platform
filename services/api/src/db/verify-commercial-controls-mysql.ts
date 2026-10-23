import assert from 'node:assert/strict'
import mysql from 'mysql2/promise'
import {
  activateControlDraft, ControlError, readControlBox, readControlDraft, saveControlBox,
  saveControlDraft, unsealKey, verifyPin,
} from '../services/admin-control-boxes.js'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for the disposable MySQL gate')
const parsedUrl = new URL(databaseUrl)
const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''))
if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname) || !databaseName.endsWith('_ci')) {
  throw new Error('Refusing to run commercial-controls MySQL verification outside a local *_ci database')
}

const pool = mysql.createPool(databaseUrl)
const masterKey = Buffer.alloc(32, 7).toString('base64')
const adminA = '00000000-0000-4000-8000-000000000001'
const adminB = '00000000-0000-4000-8000-000000000002'
const settings = {
  singleFen: 190, tenFen: 1690, guestFree: 1, studentTotalFree: 5,
  platformPriceConfirmed: false, estimatedCostFen: null,
}

try {
  const [tableRows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()',
  )
  const tables = new Set(tableRows.map((row) => String(row.TABLE_NAME)))
  for (const name of ['users', 'payment_orders', 'admin_control_boxes', 'admin_control_audit', 'admin_control_drafts']) {
    assert.ok(tables.has(name), 'expected migrated table ' + name)
  }

  const [deliveryColumns] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_orders' AND COLUMN_NAME IN ('virtual_delivery_confirmed_at','virtual_reconcile_checked_at')",
  )
  assert.deepEqual(deliveryColumns.map((row) => String(row.COLUMN_NAME)).sort(),
    ['virtual_delivery_confirmed_at', 'virtual_reconcile_checked_at'])

  const [foreignKeys] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('admin_control_boxes','admin_control_audit','admin_control_drafts') AND REFERENCED_TABLE_NAME IS NOT NULL",
  )
  assert.equal(foreignKeys.length, 3, 'all admin control tables must retain their users foreign keys')

  const initialization = await Promise.allSettled([
    saveControlBox({ pool, box: 'settings', actorId: adminA, expectedVersion: 0, newPin: '111111', settings }),
    saveControlBox({ pool, box: 'settings', actorId: adminB, expectedVersion: 0, newPin: '222222', settings }),
  ])
  const winners = initialization.map((result, index) => ({ result, index }))
    .filter(({ result }) => result.status === 'fulfilled')
  assert.equal(winners.length, 1, 'exactly one concurrent first initialization may win')
  assert.equal(initialization.filter((result) => result.status === 'rejected').length, 1)
  const winnerIndex = winners[0]!.index
  const winnerPin = winnerIndex === 0 ? '111111' : '222222'
  const winnerAdmin = winnerIndex === 0 ? adminA : adminB
  const otherAdmin = winnerIndex === 0 ? adminB : adminA
  const initialSettings = await readControlBox(pool, 'settings')
  assert.ok(initialSettings)
  assert.equal(Number(initialSettings.version), 1)
  assert.equal(verifyPin(winnerPin, initialSettings.pin_salt, initialSettings.pin_hash), true)

  const changedSettings = { ...settings, singleFen: 199 }
  await saveControlDraft({ pool, box: 'settings', actorId: otherAdmin,
    expectedVersion: 1, settings: changedSettings })
  assert.equal((await readControlDraft(pool, 'settings', winnerAdmin)).saved, false)
  assert.equal((await readControlDraft(pool, 'settings', otherAdmin)).saved, true)
  const settingsBeforeActivation = await readControlBox(pool, 'settings')
  assert.ok(settingsBeforeActivation)
  const beforePayload = typeof settingsBeforeActivation.payload_json === 'string'
    ? JSON.parse(settingsBeforeActivation.payload_json) : settingsBeforeActivation.payload_json
  assert.deepEqual(beforePayload, settings, 'a draft must not change active settings')
  const settingsActivation = await activateControlDraft({ pool, box: 'settings', actorId: otherAdmin,
    expectedVersion: 1, currentPin: winnerPin, newPin: '333333' })
  assert.equal(settingsActivation.version, 2)
  const activeSettings = await readControlBox(pool, 'settings')
  assert.ok(activeSettings)
  const activePayload = typeof activeSettings.payload_json === 'string'
    ? JSON.parse(activeSettings.payload_json) : activeSettings.payload_json
  assert.deepEqual(activePayload, changedSettings)

  await saveControlBox({ pool, box: 'assessment_key', actorId: adminA,
    expectedVersion: 0, newPin: '654321', secret: 'old-model-key', masterKey })
  await saveControlDraft({ pool, box: 'assessment_key', actorId: adminB,
    expectedVersion: 1, secret: 'new-model-key', masterKey })
  assert.equal((await readControlDraft(pool, 'assessment_key', adminA)).saved, false)
  assert.equal((await readControlDraft(pool, 'assessment_key', adminB)).saved, true)
  const [draftSecretRows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT encrypted_secret FROM admin_control_drafts WHERE box = 'assessment_key' AND actor_user_id = ?",
    [adminB],
  )
  assert.equal(draftSecretRows.length, 1)
  assert.notEqual(String(draftSecretRows[0]!.encrypted_secret), 'new-model-key')
  const oldKeyBox = await readControlBox(pool, 'assessment_key')
  assert.ok(oldKeyBox)
  assert.equal(unsealKey(String(oldKeyBox.encrypted_secret), masterKey), 'old-model-key')

  await pool.query("CREATE TRIGGER fail_admin_control_draft_delete BEFORE DELETE ON admin_control_drafts FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'injected draft delete failure'; END")
  await assert.rejects(() => activateControlDraft({ pool, box: 'assessment_key', actorId: adminB,
    expectedVersion: 1, currentPin: '654321', newPin: '654321', masterKey }),
  (error: unknown) => error instanceof Error && error.message.includes('injected draft delete failure'))
  await pool.query('DROP TRIGGER fail_admin_control_draft_delete')

  const afterFailedActivation = await readControlBox(pool, 'assessment_key')
  assert.ok(afterFailedActivation)
  assert.equal(Number(afterFailedActivation.version), 1)
  assert.equal(unsealKey(String(afterFailedActivation.encrypted_secret), masterKey), 'old-model-key')
  assert.equal((await readControlDraft(pool, 'assessment_key', adminB)).saved, true)

  const keyActivation = await activateControlDraft({ pool, box: 'assessment_key', actorId: adminB,
    expectedVersion: 1, currentPin: '654321', newPin: '654321', masterKey })
  assert.equal(keyActivation.version, 2)
  const newKeyBox = await readControlBox(pool, 'assessment_key')
  assert.ok(newKeyBox)
  assert.equal(unsealKey(String(newKeyBox.encrypted_secret), masterKey), 'new-model-key')
  assert.equal((await readControlDraft(pool, 'assessment_key', adminB)).saved, false)

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(() => saveControlBox({ pool, box: 'assessment_key', actorId: adminB,
      expectedVersion: 2, currentPin: '000000', newPin: '123456',
      secret: 'ignored-model-key', masterKey }),
    (error: unknown) => error instanceof ControlError && error.code === 'control_pin_invalid')
  }
  await assert.rejects(() => saveControlBox({ pool, box: 'assessment_key', actorId: adminB,
    expectedVersion: 2, currentPin: '654321', newPin: '654321',
    secret: 'ignored-model-key', masterKey }),
  (error: unknown) => error instanceof ControlError && error.code === 'control_pin_locked')
  const afterPinLock = await readControlBox(pool, 'assessment_key')
  assert.ok(afterPinLock)
  assert.equal(Number(afterPinLock.version), 2)
  assert.equal(unsealKey(String(afterPinLock.encrypted_secret), masterKey), 'new-model-key')

  const [auditRows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT box,action,version FROM admin_control_audit ORDER BY created_at,version',
  )
  assert.equal(auditRows.length, 4, 'failed activation must roll back its audit event')
  console.log('COMMERCIAL_CONTROLS_MYSQL_GATE_PASS: migrations, FKs, concurrent initialization, draft isolation, atomic rollback and PIN lock')
} finally {
  await pool.end()
}