import { randomUUID } from 'node:crypto'
import type mysql from 'mysql2/promise'
import type { DatabaseContext } from '../db/client.js'
import {
  ASSESSMENT_CREDIT_COST,
  assessmentDebitIdempotencyKey,
  freeGrantIdempotencyKey,
} from '../domain/credit-policy.js'

type ConfiguredDatabase = Extract<DatabaseContext, { configured: true }>

const RESERVATION_RECOVERY_WINDOW_MS = 30 * 60 * 1000

export class CommercialStateError extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message)
    this.name = 'CommercialStateError'
  }
}

type CreditLedgerRow = {
  id: string
  type:
    | 'free_grant'
    | 'payment_grant'
    | 'assessment_debit'
    | 'admin_adjustment'
    | 'correction'
  delta: number
  assessmentId: string | null
  paymentOrderId: string | null
  idempotencyKey: string
  note: string | null
  createdAt: Date
}

export type CreditAccountReadModel = {
  settledBalance: number
  heldBalance: number
  availableBalance: number
  ledger: CreditLedgerRow[]
}

export function buildCreditBalance(
  settledBalance: number,
  heldBalance: number,
) {
  return {
    settledBalance,
    heldBalance,
    availableBalance: settledBalance - heldBalance,
  }
}

function isMissingTable(error: unknown) {
  const seen = new Set<unknown>()
  let current: unknown = error
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== 'object' || seen.has(current)) return false
    seen.add(current)
    const candidate = current as {
      code?: unknown
      errno?: unknown
      sqlState?: unknown
      cause?: unknown
    }
    if (
      String(candidate.code ?? '') === 'ER_NO_SUCH_TABLE' ||
      Number(candidate.errno) === 1146 ||
      String(candidate.sqlState ?? '') === '42S02'
    ) return true
    current = candidate.cause
  }
  return false
}

async function withTransaction<T>(
  database: ConfiguredDatabase,
  work: (connection: mysql.PoolConnection) => Promise<T>,
) {
  const connection = await database.pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    if (isMissingTable(error)) {
      throw new CommercialStateError('credit_payment_schema_not_ready')
    }
    throw error
  } finally {
    connection.release()
  }
}

async function lockUser(
  connection: mysql.PoolConnection,
  userId: string,
) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    'SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE',
    [userId],
  )
  if (!rows.length) {
    throw new CommercialStateError('commercial_user_not_found')
  }
}

async function sumSettled(
  connection: mysql.PoolConnection,
  userId: string,
) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    'SELECT COALESCE(SUM(delta), 0) AS balance FROM credit_ledger_entries WHERE user_id = ?',
    [userId],
  )
  return Number(rows[0]?.balance ?? 0)
}

async function sumHeld(
  connection: mysql.PoolConnection,
  userId: string,
  excludeAssessmentId?: string,
) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    excludeAssessmentId
      ? "SELECT COALESCE(SUM(amount), 0) AS held FROM credit_reservations WHERE user_id = ? AND status = 'held' AND assessment_id <> ?"
      : "SELECT COALESCE(SUM(amount), 0) AS held FROM credit_reservations WHERE user_id = ? AND status = 'held'",
    excludeAssessmentId ? [userId, excludeAssessmentId] : [userId],
  )
  return Number(rows[0]?.held ?? 0)
}

export async function readCreditAccount(
  database: ConfiguredDatabase,
  userId: string,
): Promise<CreditAccountReadModel> {
  try {
    const [[balanceRows], [heldRows], [ledgerRows]] = await Promise.all([
      database.pool.query<mysql.RowDataPacket[]>(
        'SELECT COALESCE(SUM(delta), 0) AS balance FROM credit_ledger_entries WHERE user_id = ?',
        [userId],
      ),
      database.pool.query<mysql.RowDataPacket[]>(
        "SELECT COALESCE(SUM(amount), 0) AS held FROM credit_reservations WHERE user_id = ? AND status = 'held'",
        [userId],
      ),
      database.pool.query<mysql.RowDataPacket[]>(
        `SELECT
          id,
          type,
          delta,
          assessment_id AS assessmentId,
          payment_order_id AS paymentOrderId,
          idempotency_key AS idempotencyKey,
          note,
          created_at AS createdAt
        FROM credit_ledger_entries
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 50`,
        [userId],
      ),
    ])

    const settledBalance = Number(balanceRows[0]?.balance ?? 0)
    const heldBalance = Number(heldRows[0]?.held ?? 0)
    return {
      ...buildCreditBalance(settledBalance, heldBalance),
      ledger: ledgerRows.map((row) => ({
        id: String(row.id),
        type: row.type as CreditLedgerRow['type'],
        delta: Number(row.delta),
        assessmentId:
          typeof row.assessmentId === 'string' ? row.assessmentId : null,
        paymentOrderId:
          typeof row.paymentOrderId === 'string' ? row.paymentOrderId : null,
        idempotencyKey: String(row.idempotencyKey),
        note: typeof row.note === 'string' ? row.note : null,
        createdAt: row.createdAt as Date,
      })),
    }
  } catch (error) {
    if (isMissingTable(error)) {
      throw new CommercialStateError('credit_payment_schema_not_ready')
    }
    throw error
  }
}

export async function grantFreeCredits(input: {
  database: ConfiguredDatabase
  userId: string
  grant: { version: string; amount: number } | null
}) {
  if (!input.grant) {
    throw new CommercialStateError('free_credit_grant_not_configured')
  }

  return withTransaction(input.database, async (connection) => {
    await lockUser(connection, input.userId)
    const idempotencyKey = freeGrantIdempotencyKey(
      input.userId,
      input.grant!.version,
    )

    const [existing] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT id FROM credit_ledger_entries WHERE idempotency_key = ? LIMIT 1',
      [idempotencyKey],
    )
    if (existing.length) {
      return {
        granted: false,
        amount: input.grant!.amount,
        idempotencyKey,
      }
    }

    // A new policy version changes future grants; it must never award the
    // same account another guest or student-upgrade grant. The user row is
    // locked above, so two concurrent claims cannot cross this check.
    const [priorGrants] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT idempotency_key AS idempotencyKey FROM credit_ledger_entries
        WHERE user_id = ? AND type = 'free_grant' FOR UPDATE`,
      [input.userId],
    )
    const studentBonus = input.grant!.version.endsWith(':student-bonus')
    if (priorGrants.some((row) =>
      String(row.idempotencyKey).startsWith('free-assessment:') &&
      String(row.idempotencyKey).endsWith(':' + input.userId) &&
      String(row.idempotencyKey).slice(0, -input.userId.length - 1).endsWith(':student-bonus') === studentBonus
    )) {
      return { granted: false, amount: 0, idempotencyKey }
    }

    await connection.query(
      `INSERT INTO credit_ledger_entries
        (id, user_id, type, delta, idempotency_key, note)
       VALUES (?, ?, 'free_grant', ?, ?, ?)`,
      [
        randomUUID(),
        input.userId,
        input.grant!.amount,
        idempotencyKey,
        `server grant version ${input.grant!.version}`,
      ],
    )

    return {
      granted: true,
      amount: input.grant!.amount,
      idempotencyKey,
    }
  })
}

type AssessmentRunStart = {
  assessmentId: string
  inputJson: unknown
}

export async function beginAssessmentRunWithCredit(input: {
  database: ConfiguredDatabase
  userId: string
  assessmentId: string
  startedAt: Date
}): Promise<AssessmentRunStart> {
  return withTransaction(input.database, async (connection) => {
    await lockUser(connection, input.userId)

    const [assessmentRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT
        id,
        status,
        input_json AS inputJson,
        credit_consumed AS creditConsumed
       FROM assessments
       WHERE id = ? AND user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [input.assessmentId, input.userId],
    )
    const assessment = assessmentRows[0]
    if (!assessment) {
      throw new CommercialStateError('assessment_not_found')
    }
    if (assessment.status === 'running') {
      throw new CommercialStateError('assessment_already_running')
    }
    if (assessment.status === 'succeeded') {
      throw new CommercialStateError('assessment_already_succeeded')
    }
    if (Boolean(assessment.creditConsumed)) {
      throw new CommercialStateError('assessment_credit_state_conflict')
    }

    const [reservationRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT id, status, amount
       FROM credit_reservations
       WHERE assessment_id = ?
       LIMIT 1
       FOR UPDATE`,
      [input.assessmentId],
    )
    const reservation = reservationRows[0]
    if (reservation?.status === 'consumed') {
      throw new CommercialStateError('assessment_credit_state_conflict')
    }

    const expiresAt = new Date(
      input.startedAt.getTime() + RESERVATION_RECOVERY_WINDOW_MS,
    )

    if (reservation?.status !== 'held') {
      const settledBalance = await sumSettled(connection, input.userId)
      const heldBalance = await sumHeld(
        connection,
        input.userId,
        input.assessmentId,
      )
      if (settledBalance - heldBalance < ASSESSMENT_CREDIT_COST) {
        throw new CommercialStateError('assessment_credit_insufficient')
      }

      if (reservation) {
        await connection.query(
          `UPDATE credit_reservations
           SET status = 'held', amount = ?, expires_at = ?
           WHERE id = ?`,
          [ASSESSMENT_CREDIT_COST, expiresAt, reservation.id],
        )
      } else {
        await connection.query(
          `INSERT INTO credit_reservations
            (id, user_id, assessment_id, amount, status, expires_at)
           VALUES (?, ?, ?, ?, 'held', ?)`,
          [
            randomUUID(),
            input.userId,
            input.assessmentId,
            ASSESSMENT_CREDIT_COST,
            expiresAt,
          ],
        )
      }
    } else {
      await connection.query(
        'UPDATE credit_reservations SET expires_at = ? WHERE id = ?',
        [expiresAt, reservation.id],
      )
    }

    await connection.query(
      `UPDATE assessments
       SET status = 'running',
           started_at = ?,
           completed_at = NULL,
           failure_code = NULL
       WHERE id = ? AND user_id = ?`,
      [input.startedAt, input.assessmentId, input.userId],
    )

    return {
      assessmentId: String(assessment.id),
      inputJson: assessment.inputJson,
    }
  })
}

export async function persistAssessmentSuccessAndConsumeCredit(input: {
  database: ConfiguredDatabase
  userId: string
  assessmentId: string
  provider: string
  model: string
  knowledgeVersion: string
  evidence: unknown
  output: unknown
  completedAt: Date
}) {
  return withTransaction(input.database, async (connection) => {
    await lockUser(connection, input.userId)

    const [assessmentRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT id, status, credit_consumed AS creditConsumed
       FROM assessments
       WHERE id = ? AND user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [input.assessmentId, input.userId],
    )
    const assessment = assessmentRows[0]
    if (!assessment) {
      throw new CommercialStateError('assessment_not_found')
    }

    const [reservationRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT id, status, amount
       FROM credit_reservations
       WHERE assessment_id = ?
       LIMIT 1
       FOR UPDATE`,
      [input.assessmentId],
    )
    const reservation = reservationRows[0]
    if (!reservation) {
      throw new CommercialStateError('assessment_credit_reservation_missing')
    }

    const idempotencyKey = assessmentDebitIdempotencyKey(input.assessmentId)
    const [debitRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT id, user_id AS userId, delta, assessment_id AS assessmentId
       FROM credit_ledger_entries
       WHERE idempotency_key = ?
       LIMIT 1`,
      [idempotencyKey],
    )
    const debit = debitRows[0]

    if (Boolean(assessment.creditConsumed)) {
      if (
        reservation.status === 'consumed' &&
        debit &&
        debit.userId === input.userId &&
        debit.assessmentId === input.assessmentId &&
        Number(debit.delta) === -ASSESSMENT_CREDIT_COST
      ) {
        return { consumed: false, idempotent: true }
      }
      throw new CommercialStateError('assessment_credit_state_conflict')
    }

    if (reservation.status !== 'held') {
      throw new CommercialStateError('assessment_credit_reservation_not_held')
    }

    await connection.query(
      `UPDATE assessments
       SET status = 'succeeded',
           provider = ?,
           model = ?,
           knowledge_version = ?,
           evidence_json = ?,
           output_json = ?,
           failure_code = NULL,
           credit_consumed = 1,
           completed_at = ?
       WHERE id = ? AND user_id = ?`,
      [
        input.provider,
        input.model,
        input.knowledgeVersion,
        JSON.stringify(input.evidence),
        JSON.stringify(input.output),
        input.completedAt,
        input.assessmentId,
        input.userId,
      ],
    )

    if (!debit) {
      await connection.query(
        `INSERT INTO credit_ledger_entries
          (id, user_id, type, delta, assessment_id, idempotency_key, note)
         VALUES (?, ?, 'assessment_debit', ?, ?, ?, ?)`,
        [
          randomUUID(),
          input.userId,
          -ASSESSMENT_CREDIT_COST,
          input.assessmentId,
          idempotencyKey,
          'settled after successful Assessment result persistence',
        ],
      )
    } else if (
      debit.userId !== input.userId ||
      debit.assessmentId !== input.assessmentId ||
      Number(debit.delta) !== -ASSESSMENT_CREDIT_COST
    ) {
      throw new CommercialStateError('assessment_debit_idempotency_conflict')
    }

    await connection.query(
      `UPDATE credit_reservations
       SET status = 'consumed'
       WHERE id = ?`,
      [reservation.id],
    )

    return { consumed: !debit, idempotent: Boolean(debit) }
  })
}

export async function persistAssessmentFailureAndReleaseCredit(input: {
  database: ConfiguredDatabase
  userId: string
  assessmentId: string
  failureCode: string
  completedAt: Date
}) {
  return withTransaction(input.database, async (connection) => {
    await lockUser(connection, input.userId)

    const [assessmentRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT credit_consumed AS creditConsumed
       FROM assessments
       WHERE id = ? AND user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [input.assessmentId, input.userId],
    )
    if (!assessmentRows.length) {
      throw new CommercialStateError('assessment_not_found')
    }
    if (Boolean(assessmentRows[0].creditConsumed)) {
      throw new CommercialStateError('assessment_credit_state_conflict')
    }

    await connection.query(
      `UPDATE assessments
       SET status = 'failed',
           failure_code = ?,
           credit_consumed = 0,
           completed_at = ?
       WHERE id = ? AND user_id = ?`,
      [
        input.failureCode,
        input.completedAt,
        input.assessmentId,
        input.userId,
      ],
    )
    const [released] = await connection.query<mysql.ResultSetHeader>(
      `UPDATE credit_reservations
       SET status = 'released'
       WHERE assessment_id = ? AND user_id = ? AND status = 'held'`,
      [input.assessmentId, input.userId],
    )
    return { released: released.affectedRows === 1 }
  })
}

export async function resetAssessmentDraftAndReleaseCredit(input: {
  database: ConfiguredDatabase
  userId: string
  assessmentId: string
}) {
  return withTransaction(input.database, async (connection) => {
    await lockUser(connection, input.userId)
    await connection.query(
      `UPDATE assessments
       SET status = 'draft',
           started_at = NULL,
           completed_at = NULL,
           failure_code = NULL,
           credit_consumed = 0
       WHERE id = ? AND user_id = ? AND credit_consumed = 0`,
      [input.assessmentId, input.userId],
    )
    await connection.query(
      `UPDATE credit_reservations
       SET status = 'released'
       WHERE assessment_id = ? AND user_id = ? AND status = 'held'`,
      [input.assessmentId, input.userId],
    )
  })
}
