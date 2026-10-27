import assert from 'node:assert/strict'
import test from 'node:test'
import type mysql from 'mysql2/promise'
import { recordVirtualAncillaryPush } from './virtual-payment-cases.js'

const config={offerId:'fixture',appKey:'fixture',env:0 as const,products:{JC000:'product'}}
const base={event:'refund' as const,outTradeNo:'JCV12345678901234567890',
  openId:'owner',refundId:'refund-12345678',refundFeeFen:10,retCode:0,env:0,
  wxOrderId:'platform-order'}

function fixture() {
  const state={caseWrites:0,refundedWrites:0,ledgerWrites:0,commits:0,rollbacks:0}
  const order={id:'local-order',amountFen:10,status:'paid',payEnvironment:'production',
    providerTransactionId:'platform-order',openId:'owner'}
  const query=async(sql:string)=>{
    if(sql.includes('FROM payment_orders p JOIN users'))return [[order]]
    if(sql.includes('INSERT INTO virtual_payment_cases')){state.caseWrites++;return [{affectedRows:1}]}
    if(sql.includes("UPDATE payment_orders SET status='refunded'")) {
      state.refundedWrites++;order.status='refunded';return [{affectedRows:1}]
    }
    if(sql.includes('UPDATE virtual_payment_cases'))return [{affectedRows:1}]
    if(sql.includes('credit_ledger_entries'))state.ledgerWrites++
    throw new Error('unexpected_sql')
  }
  const connection={query,beginTransaction:async()=>{},
    commit:async()=>{state.commits++},rollback:async()=>{state.rollbacks++},release:()=>{}}
  const pool={query,getConnection:async()=>connection} as unknown as mysql.Pool
  return {pool,state}
}

test('trusted full refund notification changes order state but never edits credit ledger',async()=>{
  const f=fixture()
  await recordVirtualAncillaryPush(f.pool,config,base)
  assert.equal(f.state.caseWrites,1)
  assert.equal(f.state.refundedWrites,1)
  assert.equal(f.state.ledgerWrites,0)
  assert.equal(f.state.commits,1)
  assert.equal(f.state.rollbacks,0)
})

test('failed, partial and mismatched refund evidence cannot mark payment fully refunded',async()=>{
  for(const push of [
    {...base,retCode:1},
    {...base,refundFeeFen:5},
    {...base,wxOrderId:'other-platform-order'},
  ]) {
    const f=fixture()
    await recordVirtualAncillaryPush(f.pool,config,push)
    assert.equal(f.state.caseWrites,1)
    assert.equal(f.state.refundedWrites,0)
    assert.equal(f.state.ledgerWrites,0)
  }
})
