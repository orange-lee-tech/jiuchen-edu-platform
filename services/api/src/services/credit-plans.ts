import { randomBytes, randomUUID } from 'node:crypto'
import type mysql from 'mysql2/promise'
import type { AppEnv } from '../config/env.js'
import { readAssessmentCostFingerprint } from './assessment-cost-fingerprint.js'
import { z } from 'zod'
import { ControlError, pinDigest, sixDigitPin, verifyPin } from './admin-control-boxes.js'
import { FIXED_ASSESSMENT_SKUS, type PlannedCreditSku } from './commercial-config.js'

export const planCountsSchema = z.object({
  JC000: z.number().int().min(1).max(100),
  JC001: z.number().int().min(1).max(100),
  JC002: z.number().int().min(1).max(100),
  JC003: z.number().int().min(1).max(100),
}).strict()
export const creditPlanInput = z.object({
  name: z.string().trim().min(1).max(120),
  note: z.string().trim().max(1000).default(''),
  counts: planCountsSchema,
  estimatedCostFen: z.number().int().positive().max(100000).nullable(),
  costConfirmed: z.boolean(),
  expectedCostConfigFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable().default(null),
  pin: sixDigitPin,
}).strict()
export type CreditPlanInput = z.infer<typeof creditPlanInput>
export const DEFAULT_PLAN_COUNTS = Object.freeze({ JC000: 2, JC001: 1, JC002: 5, JC003: 10 })

type PlanRow = mysql.RowDataPacket & {
  id: string; name: string; version: number; note: string | null; creator_user_id: string
  pin_salt: string | null; pin_hash: string | null
  failed_attempts: number; pin_locked?: number | null
  count_jc000: number; count_jc001: number; count_jc002: number; count_jc003: number
  estimated_cost_fen: number | null; cost_verified_at: Date | null
  cost_config_fingerprint: string | null
  status: 'candidate' | 'active' | 'disabled' | 'archived'; created_at: Date
  cost_fresh?: number | null
}
type PlanHead = mysql.RowDataPacket & {
  active_plan_id: string | null; version: number; pin_salt: string | null
  pin_hash: string | null; initialized: number; failed_attempts: number; pin_locked: number | null
}
function independentPin(pin: string) {
  const salt = randomBytes(16).toString('hex')
  return { salt, hash: pinDigest(pin, salt) }
}
function planCounts(row: PlanRow) {
  return { JC000: Number(row.count_jc000), JC001: Number(row.count_jc001),
    JC002: Number(row.count_jc002), JC003: Number(row.count_jc003) }
}
export function validatePlanCostFingerprint(
  currentFingerprint: string | null, verifiedFingerprint: string | null,
) {
  if (!currentFingerprint) throw new ControlError('credit_plan_cost_configuration_unavailable', 409)
  if (!verifiedFingerprint) throw new ControlError('credit_plan_cost_configuration_unverified', 409)
  if (currentFingerprint !== verifiedFingerprint) throw new ControlError('credit_plan_cost_configuration_changed', 409)
}

export function validatePlanCost(
  counts: z.infer<typeof planCountsSchema>, costFen: number | null, confirmedAt: Date | null,
  currentFingerprint: string | null, verifiedFingerprint: string | null, now = new Date(),
) {
  if (costFen === null || !confirmedAt ||
      now.getTime() - confirmedAt.getTime() > 30 * 24 * 60 * 60 * 1000 ||
      confirmedAt.getTime() > now.getTime()) throw new ControlError('plan_cost_missing_or_stale', 409)
  validatePlanCostFingerprint(currentFingerprint, verifiedFingerprint)
  for (const sku of FIXED_ASSESSMENT_SKUS) {
    const count = counts[sku.key as keyof typeof counts]
    if (sku.amountFen * 10 < costFen * count * 12) throw new ControlError('plan_cost_buffer_exceeded_' + sku.key, 409)
  }
}
function publicPlan(row: PlanRow, currentFingerprint: string | null) {
  const costVerificationStatus = !row.cost_verified_at || row.estimated_cost_fen === null
    ? 'unverified'
    : Number(row.cost_fresh) !== 1
      ? 'expired'
      : !currentFingerprint
        ? 'model_unavailable'
        : row.cost_config_fingerprint !== currentFingerprint
          ? 'configuration_changed'
          : 'verified'
  const costVerificationLabel = ({
    verified: '有效', unverified: '待核实', expired: '已过期或时间无效',
    model_unavailable: '当前 AI 连接不可用', configuration_changed: 'AI 配置已变更，需重新核算',
  } as const)[costVerificationStatus]
  return { id: row.id, name: row.name, version: Number(row.version), note: row.note,
    creatorUserId: row.creator_user_id, hasObjectPin: Boolean(row.pin_hash),
    counts: planCounts(row), estimatedCostFen: row.estimated_cost_fen === null ? null : Number(row.estimated_cost_fen),
    costVerifiedAt: row.cost_verified_at, costVerificationStatus, costVerificationLabel,
    costVerifiedForCurrentConfig: costVerificationStatus === 'verified',
    status: row.status, createdAt: row.created_at }
}

async function headForUpdate(connection: mysql.PoolConnection) {
  await connection.query('INSERT IGNORE INTO credit_plan_head (id) VALUES (1)')
  const [rows] = await connection.query<PlanHead[]>(
    'SELECT *, (locked_until > CURRENT_TIMESTAMP()) AS pin_locked FROM credit_plan_head WHERE id=1 FOR UPDATE',
  )
  return rows[0]!
}
async function planForUpdate(connection: mysql.PoolConnection, id: string) {
  const [rows] = await connection.query<PlanRow[]>(
    `SELECT *, (locked_until > CURRENT_TIMESTAMP()) AS pin_locked,
       (cost_verified_at IS NOT NULL AND cost_verified_at <= CURRENT_TIMESTAMP()
       AND cost_verified_at >= CURRENT_TIMESTAMP() - INTERVAL 30 DAY) AS cost_fresh
     FROM credit_plan_objects WHERE id=? FOR UPDATE`, [id],
  )
  return rows[0] ?? null
}
async function checkHeadPin(connection: mysql.PoolConnection, head: PlanHead, pin: string) {
  if (Number(head.pin_locked) === 1) throw new ControlError('control_pin_locked', 429)
  if (head.pin_salt && head.pin_hash && verifyPin(pin, head.pin_salt, head.pin_hash)) {
    await connection.query('UPDATE credit_plan_head SET failed_attempts=0,locked_until=NULL WHERE id=1')
    return
  }
  const attempts = Number(head.failed_attempts) + 1
  await connection.query(
    `UPDATE credit_plan_head SET failed_attempts=?,
     locked_until=CASE WHEN ? >= 5 THEN DATE_ADD(CURRENT_TIMESTAMP(), INTERVAL 15 MINUTE) ELSE locked_until END
     WHERE id=1`, [attempts, attempts],
  )
  await connection.commit()
  throw new ControlError('control_pin_invalid', 403)
}
async function checkObjectPin(connection: mysql.PoolConnection, row: PlanRow, pin: string) {
  if (Number(row.pin_locked) === 1) throw new ControlError('object_pin_locked', 429)
  if (!row.pin_salt || !row.pin_hash) throw new ControlError('object_pin_setup_required', 409)
  if (!verifyPin(pin, row.pin_salt, row.pin_hash)) {
    const attempts = Number(row.failed_attempts) + 1
    await connection.query(
      `UPDATE credit_plan_objects SET failed_attempts=?,
       locked_until=CASE WHEN ? >= 5 THEN DATE_ADD(CURRENT_TIMESTAMP(), INTERVAL 15 MINUTE) ELSE locked_until END
       WHERE id=?`, [attempts, attempts, row.id])
    await connection.commit()
    throw new ControlError('object_pin_invalid', 403)
  }
  await connection.query(
    'UPDATE credit_plan_objects SET failed_attempts=0,locked_until=NULL WHERE id=?', [row.id])
}
async function event(connection: mysql.PoolConnection, actorId: string,
  action: string, planId: string | null, version: number) {
  await connection.query(
    'INSERT INTO credit_plan_events (id,plan_id,actor_user_id,action,head_version) VALUES (?,?,?,?,?)',
    [randomUUID(), planId, actorId, action, version],
  )
}
export async function listCreditPlans(pool: mysql.Pool, env: AppEnv) {
  const currentFingerprint = await readAssessmentCostFingerprint(pool, env)
  const [heads] = await pool.query<PlanHead[]>('SELECT active_plan_id,version,initialized FROM credit_plan_head WHERE id=1')
  const [rows] = await pool.query<PlanRow[]>(
    `SELECT *, (cost_verified_at IS NOT NULL AND cost_verified_at <= CURRENT_TIMESTAMP()
       AND cost_verified_at >= CURRENT_TIMESTAMP() - INTERVAL 30 DAY) AS cost_fresh
     FROM credit_plan_objects ORDER BY created_at DESC,id DESC`,
  )
  return { head: { initialized: Boolean(heads[0]?.initialized),
    version: Number(heads[0]?.version ?? 0), activePlanId: heads[0]?.active_plan_id ?? null },
  currentCostConfigFingerprint: currentFingerprint,
  plans: rows.map(row => publicPlan(row, currentFingerprint)), prices: FIXED_ASSESSMENT_SKUS }
}

export async function createCreditPlan(input: {
  pool: mysql.Pool; actorId: string; data: CreditPlanInput; env: AppEnv
}) {
  const data = creditPlanInput.parse(input.data)
  const connection = await input.pool.getConnection()
  const id = randomUUID()
  try {
    await connection.beginTransaction()
    const head = await headForUpdate(connection)
    const currentFingerprint = await readAssessmentCostFingerprint(connection, input.env, true)
    if (data.costConfirmed) {
      if (data.estimatedCostFen === null) throw new ControlError('plan_cost_missing_or_stale', 409)
      if (!currentFingerprint) throw new ControlError('credit_plan_cost_configuration_unavailable', 409)
      if (!data.expectedCostConfigFingerprint) throw new ControlError('credit_plan_cost_configuration_unverified', 409)
      if (data.expectedCostConfigFingerprint !== currentFingerprint) {
        throw new ControlError('credit_plan_cost_configuration_changed', 409)
      }
    }
    const costVerified = data.costConfirmed && data.estimatedCostFen !== null &&
      currentFingerprint !== null && data.expectedCostConfigFingerprint === currentFingerprint
    const verifiedFingerprint = costVerified ? currentFingerprint : null
    const verifiedAt = costVerified ? new Date() : null
    let firstActive = false
    if (!Number(head.initialized)) {
      try {
        validatePlanCost(data.counts, data.estimatedCostFen, verifiedAt, currentFingerprint, verifiedFingerprint)
        firstActive = true
      }
      catch (error) { if (!(error instanceof ControlError)) throw error }
    }
    const objectPin = independentPin(data.pin)
    // MySQL also evaluates freshness, so persist its own clock rather than a
    // mysql2-formatted JavaScript Date from a potentially different time zone.
    await connection.query(
      `INSERT INTO credit_plan_objects
       (id,name,note,creator_user_id,pin_salt,pin_hash,count_jc000,count_jc001,count_jc002,count_jc003,
        estimated_cost_fen,cost_verified_at,cost_config_fingerprint,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,IF(?,CURRENT_TIMESTAMP(),NULL),?,?)`,
      [id, data.name, data.note, input.actorId, objectPin.salt, objectPin.hash,
        data.counts.JC000, data.counts.JC001, data.counts.JC002, data.counts.JC003,
        data.estimatedCostFen, costVerified, verifiedFingerprint, firstActive ? 'active' : 'candidate'],
    )
    if (firstActive) {
      const controlPin = independentPin(data.pin)
      await connection.query(
        'UPDATE credit_plan_head SET active_plan_id=?,version=1,pin_salt=?,pin_hash=?,initialized=1 WHERE id=1',
        [id, controlPin.salt, controlPin.hash],
      )
    }
    await event(connection, input.actorId, firstActive ? 'initialize' : 'create', id,
      firstActive ? 1 : Number(head.version))
    await connection.commit()
    return { id, active: firstActive, version: firstActive ? 1 : Number(head.version) }
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}
export async function activateCreditPlan(input: { pool: mysql.Pool; actorId: string; id: string;
  expectedVersion: number; currentPin: string; targetPin: string; env: AppEnv }) {
  if (!sixDigitPin.safeParse(input.currentPin).success || !sixDigitPin.safeParse(input.targetPin).success) {
    throw new ControlError('pin_must_be_six_digits', 400)
  }
  const connection = await input.pool.getConnection()
  try {
    await connection.beginTransaction()
    const head = await headForUpdate(connection)
    if (Number(head.version) !== input.expectedVersion) throw new ControlError('control_version_conflict', 409)
    const currentFingerprint = await readAssessmentCostFingerprint(connection, input.env, true)
    if (Number(head.initialized)) await checkHeadPin(connection, head, input.currentPin)
    const plan = await planForUpdate(connection, input.id)
    if (!plan || plan.status === 'archived') throw new ControlError('credit_plan_not_found', 404)
    await checkObjectPin(connection, plan, input.targetPin)
    if (!Number(plan.cost_fresh)) throw new ControlError('plan_cost_missing_or_stale', 409)
    validatePlanCost(planCounts(plan), plan.estimated_cost_fen === null ? null : Number(plan.estimated_cost_fen),
      new Date(), currentFingerprint, plan.cost_config_fingerprint)
    if (head.active_plan_id && head.active_plan_id !== input.id) {
      await connection.query("UPDATE credit_plan_objects SET status='candidate' WHERE id=?", [head.active_plan_id])
    }
    await connection.query("UPDATE credit_plan_objects SET status='active',version=version+1,failed_attempts=0,locked_until=NULL WHERE id=?", [input.id])
    const pin = independentPin(input.targetPin)
    const version = Number(head.version) + 1
    await connection.query(
      'UPDATE credit_plan_head SET active_plan_id=?,version=?,pin_salt=?,pin_hash=?,initialized=1,failed_attempts=0,locked_until=NULL WHERE id=1',
      [input.id, version, pin.salt, pin.hash],
    )
    await event(connection, input.actorId, 'activate', input.id, version)
    await connection.commit()
    return { activePlanId: input.id, version }
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}
export async function disableCreditPlan(input: { pool: mysql.Pool; actorId: string;
  expectedVersion: number; currentPin: string }) {
  if (!sixDigitPin.safeParse(input.currentPin).success) throw new ControlError('pin_must_be_six_digits', 400)
  const connection = await input.pool.getConnection()
  try {
    await connection.beginTransaction()
    const head = await headForUpdate(connection)
    if (!Number(head.initialized) || !head.active_plan_id) throw new ControlError('credit_plan_not_active', 409)
    if (Number(head.version) !== input.expectedVersion) throw new ControlError('control_version_conflict', 409)
    await checkHeadPin(connection, head, input.currentPin)
    await connection.query("UPDATE credit_plan_objects SET status='disabled' WHERE id=?", [head.active_plan_id])
    const version = Number(head.version) + 1
    await connection.query('UPDATE credit_plan_head SET active_plan_id=NULL,version=? WHERE id=1', [version])
    await event(connection, input.actorId, 'disable', head.active_plan_id, version)
    await connection.commit()
    return { activePlanId: null, version }
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}
export async function archiveCreditPlan(input: { pool: mysql.Pool; actorId: string; id: string;
  expectedVersion: number; currentPin: string }) {
  if (!sixDigitPin.safeParse(input.currentPin).success) throw new ControlError('pin_must_be_six_digits', 400)
  const connection = await input.pool.getConnection()
  try {
    await connection.beginTransaction()
    const head = await headForUpdate(connection)
    if (!Number(head.initialized)) throw new ControlError('credit_plan_not_initialized', 409)
    if (Number(head.version) !== input.expectedVersion) throw new ControlError('control_version_conflict', 409)
    await checkHeadPin(connection, head, input.currentPin)
    if (head.active_plan_id === input.id) throw new ControlError('credit_plan_active', 409)
    const plan = await planForUpdate(connection, input.id)
    if (!plan) throw new ControlError('credit_plan_not_found', 404)
    await connection.query("UPDATE credit_plan_objects SET status='archived' WHERE id=?", [input.id])
    await event(connection, input.actorId, 'archive', input.id, Number(head.version))
    await connection.commit()
    return { archived: true }
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}
export async function readActiveCreditPlan(pool: mysql.Pool, env: AppEnv) {
  const currentFingerprint = await readAssessmentCostFingerprint(pool, env)
  const [heads] = await pool.query<PlanHead[]>('SELECT active_plan_id,version,initialized FROM credit_plan_head WHERE id=1')
  const head = heads[0]
  if (!head || !Number(head.initialized)) return { initialized: false as const, skus: [] as PlannedCreditSku[] }
  if (!head.active_plan_id) return { initialized: true as const, skus: [] as PlannedCreditSku[] }
  const [rows] = await pool.query<PlanRow[]>(
    `SELECT *, (cost_verified_at IS NOT NULL AND cost_verified_at <= CURRENT_TIMESTAMP()
       AND cost_verified_at >= CURRENT_TIMESTAMP() - INTERVAL 30 DAY) AS cost_fresh
     FROM credit_plan_objects WHERE id=? AND status='active' LIMIT 1`, [head.active_plan_id],
  )
  const plan = rows[0]
  if (!plan) throw new ControlError('credit_plan_pointer_invalid', 503)
  const counts = planCounts(plan)
  const skus: PlannedCreditSku[] = FIXED_ASSESSMENT_SKUS.map((sku) => ({
    ...sku, creditAmount: counts[sku.key as keyof typeof counts], planId: plan.id, planVersion: Number(plan.version),
  }))
  const costVerificationStatus = !plan.cost_verified_at || plan.estimated_cost_fen === null
    ? 'unverified'
    : Number(plan.cost_fresh) !== 1
      ? 'expired'
      : !currentFingerprint
        ? 'model_unavailable'
        : plan.cost_config_fingerprint !== currentFingerprint
          ? 'configuration_changed'
          : 'verified'
  return { initialized: true as const, skus, costVerified: costVerificationStatus === 'verified',
    costVerificationStatus, costVerifiedAt: plan.cost_verified_at }
}

export async function setLegacyCreditPlanPin(input: { pool: mysql.Pool; actorId: string;
  id: string; currentPin: string; newPin: string }) {
  if (!sixDigitPin.safeParse(input.currentPin).success || !sixDigitPin.safeParse(input.newPin).success) {
    throw new ControlError('pin_must_be_six_digits', 400)
  }
  const connection = await input.pool.getConnection()
  try {
    await connection.beginTransaction()
    const head = await headForUpdate(connection)
    if (!Number(head.initialized)) throw new ControlError('credit_plan_not_initialized', 409)
    await checkHeadPin(connection, head, input.currentPin)
    const plan = await planForUpdate(connection, input.id)
    if (!plan) throw new ControlError('credit_plan_not_found', 404)
    if (plan.creator_user_id !== input.actorId) throw new ControlError('credit_plan_creator_required', 403)
    if (plan.pin_hash) throw new ControlError('object_pin_already_configured', 409)
    const pin = independentPin(input.newPin)
    await connection.query('UPDATE credit_plan_objects SET pin_salt=?,pin_hash=? WHERE id=?',
      [pin.salt, pin.hash, plan.id])
    await event(connection, input.actorId, 'set_legacy_pin', plan.id, Number(head.version))
    await connection.commit()
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}
