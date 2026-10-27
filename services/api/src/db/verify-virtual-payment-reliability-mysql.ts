import assert from 'node:assert/strict'
import mysql from 'mysql2/promise'
import 'dotenv/config'
import { finishVirtualReconcileAttempt,startVirtualReconcileAttempt,
  VIRTUAL_RECONCILE_ATTEMPT_LIMIT } from '../services/virtual-payment-cases.js'

const url=process.env.DATABASE_URL
if(!url) throw new Error('DATABASE_URL is required')
const db=await mysql.createConnection(url)
const orderId='00000000-0000-4000-8000-000000009001'
const caseId='00000000-0000-4000-8000-000000009002'
const actionId='00000000-0000-4000-8000-000000009003'
const phase=process.argv[2]
try {
  if(phase==='prepare') {
    await db.query(
      `INSERT INTO payment_orders(id,user_id,out_trade_no,status,amount_fen,credit_amount)
       VALUES (?,'00000000-0000-4000-8000-000000000001','JCVRELIABILITYCI0001','paid',190,1)`,
      [orderId])
    await db.query(
      `INSERT INTO virtual_payment_cases(id,order_id,event_key,kind,state,reason_code)
       VALUES (?,?,'ci:reliability:1','reconciliation','open','fixture_review')`,
      [caseId,orderId])
    await db.query(
      `INSERT INTO virtual_payment_case_actions(id,case_id,actor_user_id,action,note)
       VALUES (?,?,'00000000-0000-4000-8000-000000000001','reviewed','fixture audit')`,
      [actionId,caseId])
    console.log('VIRTUAL_PAYMENT_RELIABILITY_FIXTURE_READY')
  } else if(phase==='verify') {
    const [order]=await db.query<mysql.RowDataPacket[]>(
      'SELECT status,amount_fen,credit_amount FROM payment_orders WHERE id=?',[orderId])
    assert.deepEqual([order[0]?.status,Number(order[0]?.amount_fen),Number(order[0]?.credit_amount)],
      ['paid',190,1])
    const [cases]=await db.query<mysql.RowDataPacket[]>(
      'SELECT order_id,event_key,state,attempt_count FROM virtual_payment_cases WHERE id=?',[caseId])
    assert.deepEqual([cases[0]?.order_id,cases[0]?.event_key,cases[0]?.state],
      [orderId,'ci:reliability:1','open'])
    assert.equal(Number(cases[0]?.attempt_count),0)
    const [actions]=await db.query<mysql.RowDataPacket[]>(
      'SELECT case_id,actor_user_id FROM virtual_payment_case_actions WHERE id=?',[actionId])
    assert.deepEqual([actions[0]?.case_id,actions[0]?.actor_user_id],
      [caseId,'00000000-0000-4000-8000-000000000001'])
    const [indexes]=await db.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN
         ('virtual_payment_cases','virtual_payment_case_actions')`)
    for(const [table,index,unique] of [
      ['virtual_payment_cases','virtual_payment_cases_event_key_uq',0],
      ['virtual_payment_cases','virtual_payment_cases_order_state_idx',1],
      ['virtual_payment_cases','virtual_payment_cases_kind_state_idx',1],
      ['virtual_payment_case_actions','virtual_payment_case_actions_case_idx',1],
    ] as const) assert(indexes.some(row=>row.TABLE_NAME===table &&
      row.INDEX_NAME===index && Number(row.NON_UNIQUE)===unique))
    const [foreignKeys]=await db.query<mysql.RowDataPacket[]>(
      `SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME IN
         ('virtual_payment_cases','virtual_payment_case_actions')`)
    for(const name of ['virtual_payment_cases_order_fk','virtual_payment_cases_resolver_fk',
      'virtual_payment_case_actions_case_fk','virtual_payment_case_actions_actor_fk'])
      assert(foreignKeys.some(row=>row.CONSTRAINT_NAME===name))
    await assert.rejects(db.query(
      `INSERT INTO virtual_payment_cases(id,order_id,event_key,kind,state,reason_code)
       VALUES ('00000000-0000-4000-8000-000000009004',?,'ci:reliability:1','refund','open','duplicate')`,
      [orderId]),(error:unknown)=>(error as {code?:string}).code==='ER_DUP_ENTRY')
    const pool=mysql.createPool(url)
    try {
      for(let attempt=0;attempt<VIRTUAL_RECONCILE_ATTEMPT_LIMIT;attempt++)
        assert.equal(await startVirtualReconcileAttempt(pool,orderId),true)
      await finishVirtualReconcileAttempt(pool,orderId,'pending')
      assert.equal(await startVirtualReconcileAttempt(pool,orderId),false)
      const [recovery]=await db.query<mysql.RowDataPacket[]>(
        'SELECT attempt_count,state,reason_code FROM virtual_payment_cases WHERE event_key=?',
        ['recovery:'+orderId])
      assert.deepEqual([Number(recovery[0]?.attempt_count),recovery[0]?.state,
        recovery[0]?.reason_code],
        [VIRTUAL_RECONCILE_ATTEMPT_LIMIT,'open','automatic_attempt_limit'])
    } finally {await pool.end()}
    console.log('VIRTUAL_PAYMENT_RELIABILITY_MYSQL_PASS idempotent=true order_and_ledger_unchanged=true')
  } else throw new Error('Expected prepare or verify phase')
} finally {await db.end()}
