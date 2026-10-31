import { randomUUID } from 'node:crypto'
import type mysql from 'mysql2/promise'
import { ControlError, verifyPin, sixDigitPin } from './admin-control-boxes.js'

export async function grantAdminCredits(input: { pool: mysql.Pool; actorId: string; userId: string;
  amount: number; reason: string; pin: string; idempotencyKey: string }) {
  if(!Number.isInteger(input.amount)||input.amount<1||input.amount>10000||!input.reason.trim()||input.reason.length>300)
    throw new ControlError('invalid_credit_adjustment',400)
  if(!sixDigitPin.safeParse(input.pin).success)throw new ControlError('pin_must_be_six_digits',400)
  const connection = await input.pool.getConnection()
  let committed = false
  try {
    await connection.beginTransaction()
    const [boxes] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT *, (locked_until > CURRENT_TIMESTAMP()) AS pin_locked FROM admin_control_boxes WHERE box='settings' FOR UPDATE")
    const box = boxes[0]
    if (!box) throw new ControlError('settings_control_not_configured',503)
    if (Number(box.pin_locked) === 1) throw new ControlError('control_pin_locked',429)
    if (!verifyPin(input.pin,String(box.pin_salt),String(box.pin_hash))) {
      const attempts = Number(box.failed_attempts) + 1
      await connection.query(`UPDATE admin_control_boxes SET failed_attempts=?,
        locked_until=CASE WHEN ? >= 5 THEN DATE_ADD(CURRENT_TIMESTAMP(),INTERVAL 15 MINUTE) ELSE locked_until END
        WHERE box='settings'`,[attempts,attempts])
      await connection.commit(); committed = true
      throw new ControlError('control_pin_invalid',403)
    }
    const [users] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT u.id FROM users u INNER JOIN students s ON s.user_id=u.id WHERE u.id=? AND u.status='active' FOR UPDATE",[input.userId])
    if (!users.length) throw new ControlError('student_account_not_found',404)
    const key = 'admin-grant:' + input.idempotencyKey
    const [existing] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT * FROM credit_ledger_entries WHERE idempotency_key=? LIMIT 1',[key])
    const note = JSON.stringify({actorId:input.actorId,reason:input.reason})
    if (existing.length) {
      const row = existing[0]
      if (row.user_id !== input.userId || Number(row.delta) !== input.amount || row.note !== note)
        throw new ControlError('credit_adjustment_idempotency_conflict',409)
      const [audit] = await connection.query<mysql.RowDataPacket[]>(
        'SELECT * FROM admin_credit_adjustments WHERE ledger_entry_id=?',[row.id])
      if (!audit[0]) throw new ControlError('credit_adjustment_audit_missing',409)
      await connection.commit(); committed = true
      return { idempotent:true,ledgerEntryId:row.id,before:Number(audit[0].balance_before),
        after:Number(audit[0].balance_after),amount:input.amount,reason:input.reason,actorId:input.actorId,createdAt:audit[0].created_at }
    }
    const [balance] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT COALESCE(SUM(delta),0) AS balance FROM credit_ledger_entries WHERE user_id=?',[input.userId])
    const before = Number(balance[0]?.balance ?? 0), id = randomUUID()
    await connection.query(`INSERT INTO credit_ledger_entries (id,user_id,type,delta,idempotency_key,note)
      VALUES (?,?,'admin_adjustment',?,?,?)`,[id,input.userId,input.amount,key,note])
    await connection.query(`INSERT INTO admin_credit_adjustments
      (ledger_entry_id,actor_user_id,target_user_id,amount,reason,balance_before,balance_after)
      VALUES (?,?,?,?,?,?,?)`,[id,input.actorId,input.userId,input.amount,input.reason,before,before+input.amount])
    await connection.query("UPDATE admin_control_boxes SET failed_attempts=0,locked_until=NULL WHERE box='settings'")
    await connection.query('INSERT INTO admin_control_audit (id,box,actor_user_id,action,version) VALUES (?,?,?,?,?)',
      [randomUUID(),'settings',input.actorId,'grant_credits',box.version])
    const [auditRows]=await connection.query<mysql.RowDataPacket[]>('SELECT * FROM admin_credit_adjustments WHERE ledger_entry_id=?',[id])
    await connection.commit(); committed = true
    return {idempotent:false,ledgerEntryId:id,before,after:before+input.amount,amount:input.amount,
      reason:input.reason,actorId:input.actorId,createdAt:auditRows[0]?.created_at}
  } catch(error) {if(!committed)await connection.rollback();throw error}
  finally {connection.release()}
}
