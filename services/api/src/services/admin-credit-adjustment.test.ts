import assert from 'node:assert/strict'
import test from 'node:test'
import type mysql from 'mysql2/promise'
import { pinDigest } from './admin-control-boxes.js'
import { grantAdminCredits } from './admin-credit-adjustment.js'

function fixture(){
  const state={balance:7,attempts:0,locked:false,ledger:[] as Record<string,unknown>[],audit:[] as Record<string,unknown>[],commits:0,rollbacks:0}
  const salt='11'.repeat(16),hash=pinDigest('123456',salt)
  const connection={async beginTransaction(){},async commit(){state.commits++},async rollback(){state.rollbacks++},release(){},
    async query(sql:string,args:unknown[]=[]){
      if(sql.startsWith('SELECT *, (locked_until'))return [[{pin_salt:salt,pin_hash:hash,pin_locked:state.locked?1:0,failed_attempts:state.attempts,version:2}],[]]
      if(sql.startsWith('UPDATE admin_control_boxes SET failed_attempts=?')){state.attempts=Number(args[0]);state.locked=state.attempts>=5;return [[],[]]}
      if(sql.startsWith('SELECT u.id'))return [args[0]==='missing'?[]:[{id:args[0]}],[]]
      if(sql.startsWith('SELECT * FROM credit_ledger_entries'))return [state.ledger.filter(r=>r.idempotency_key===args[0]),[]]
      if(sql.startsWith('SELECT * FROM admin_credit_adjustments'))return [state.audit.filter(r=>r.ledger_entry_id===args[0]),[]]
      if(sql.startsWith('SELECT COALESCE'))return [[{balance:state.balance}],[]]
      if(sql.startsWith('INSERT INTO credit_ledger_entries')){state.ledger.push({id:args[0],user_id:args[1],delta:args[2],idempotency_key:args[3],note:args[4]});state.balance+=Number(args[2]);return [[],[]]}
      if(sql.startsWith('INSERT INTO admin_credit_adjustments')){state.audit.push({ledger_entry_id:args[0],balance_before:args[5],balance_after:args[6],created_at:new Date()});return [[],[]]}
      if(sql.startsWith('UPDATE admin_control_boxes SET failed_attempts=0')){state.attempts=0;return [[],[]]}
      if(sql.startsWith('INSERT INTO admin_control_audit'))return [[],[]]
      throw new Error('Unexpected grant query')
    }}
  return {state,pool:{async getConnection(){return connection}} as unknown as mysql.Pool}
}
const operation={actorId:'admin-a',userId:'student-a',amount:3,reason:'合成补偿',pin:'123456',idempotencyKey:'11111111-1111-4111-8111-111111111111'}
test('admin grants reuse ledger and replay exactly once with unchanged before/after audit',async()=>{
  const {pool,state}=fixture()
  const first=await grantAdminCredits({pool,...operation}),retry=await grantAdminCredits({pool,...operation})
  assert.equal(first.before,7);assert.equal(first.after,10);assert.equal(retry.ledgerEntryId,first.ledgerEntryId)
  assert.equal(retry.idempotent,true);assert.equal(state.ledger.length,1);assert.equal(state.audit.length,1);assert.equal(state.balance,10)
  await assert.rejects(grantAdminCredits({pool,...operation,amount:4}),{code:'credit_adjustment_idempotency_conflict'})
  assert.equal(state.balance,10)
})
test('incorrect PIN persists attempts and locks before any ledger write',async()=>{
  const {pool,state}=fixture()
  for(let i=0;i<5;i++)await assert.rejects(grantAdminCredits({pool,...operation,pin:'000000'}),{code:'control_pin_invalid'})
  await assert.rejects(grantAdminCredits({pool,...operation}),{code:'control_pin_locked'})
  assert.equal(state.balance,7);assert.equal(state.ledger.length,0);assert.equal(state.attempts,5)
})
test('unbound target fails with rollback and no ledger event',async()=>{
  const {pool,state}=fixture()
  await assert.rejects(grantAdminCredits({pool,...operation,userId:'missing'}),{code:'student_account_not_found'})
  assert.equal(state.rollbacks,1);assert.equal(state.ledger.length,0)
})
