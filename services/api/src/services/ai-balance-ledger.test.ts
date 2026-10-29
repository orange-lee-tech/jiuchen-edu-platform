import test from 'node:test'
import assert from 'node:assert/strict'
import type mysql from 'mysql2/promise'
import { readAiBalanceSnapshots, recordAiBalance } from './ai-balance-ledger.js'

test('manual balance is append-only, bound to a real service object and records operator', async () => {
  const queries: Array<{ sql:string; values:unknown[] }> = []
  const pool={ async query(sql:string,values:unknown[]=[]){ queries.push({sql,values}); return [sql.startsWith('SELECT')?[{provider:'synthetic'}]:[],null] } } as unknown as mysql.Pool
  const id=await recordAiBalance(pool,'admin-1',{objectId:'object-1',currency:'CNY',balance:'10.123456',warningThreshold:'2',verifiedAt:'2026-10-30T00:00:00.000Z'})
  assert.ok(id);assert.match(queries[1]!.sql,/INSERT INTO ai_balance_snapshots/)
  assert.equal(queries[1]!.values[7],'admin-1');assert.equal(queries[1]!.values[3],'CNY')
})
test('unknown cost never produces a certain remaining balance or low-balance decision',async()=>{
  let n=0
  const pool={async query(){ n++; if(n===1)return [[{currency:'CNY',balance:'10.000000',warningThreshold:'2.000000',verifiedAt:new Date()}],null]
    if(n===2)return [[{calls:2,unknownCalls:1,estimatedSpend:'0.500000'}],null]
    if(n===3)return [[{provider:'synthetic',model:'model',calls:2,unknownCalls:1,estimatedSpend:'0.500000'}],null]
    if(n===4)return [[{count:0}],null]
    return [[{remaining:'9.500000',lowBalance:0}],null] }} as unknown as mysql.Pool
  const result=await readAiBalanceSnapshots(pool,'object-1')
  assert.equal(result.estimate?.unknownCalls,1);assert.equal(result.estimate?.estimatedRemaining,null);assert.equal(result.estimate?.lowBalance,null)
})
test('no snapshot returns unknown rather than a fabricated zero balance',async()=>{
  const pool={async query(){return [[],null]}} as unknown as mysql.Pool
  assert.equal((await readAiBalanceSnapshots(pool,'object-1')).estimate,null)
})
test('numeric-string false from MySQL does not raise a false low-balance alert',async()=>{
  let n=0
  const pool={async query(){ n++; if(n===1)return [[{currency:'CNY',balance:'10',warningThreshold:'2',verifiedAt:new Date()}],null]
    if(n===2)return [[{calls:1,unknownCalls:0,estimatedSpend:'1'}],null]
    if(n===3)return [[],null]
    if(n===4)return [[{count:0}],null]
    return [[{remaining:'9',lowBalance:'0'}],null] }} as unknown as mysql.Pool
  assert.equal((await readAiBalanceSnapshots(pool,'object-1')).estimate?.lowBalance,false)
})
