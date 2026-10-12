import assert from 'node:assert/strict'
import test from 'node:test'
import { analyticsCalendar } from './commercial-analytics.js'

test('analytics weeks yield seven consecutive local days even over month boundary', () => {
  const x = analyticsCalendar('week', new Date('2026-10-09T15:00:00.000Z'))
  assert.deepEqual(x.buckets.map(b => b.key), [
    '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06',
    '2026-10-07', '2026-10-08', '2026-10-09',
  ])
  assert.equal(x.before, '2026-10-10 00:00:00')
})

test('monthly and yearly periods include zero-filled buckets', () => {
  const monthly = analyticsCalendar('month', new Date('2026-10-09T02:00:00.000Z'))
  assert.equal(monthly.buckets.length, 12)
  assert.equal(monthly.buckets[0].key, '2025-11')
  assert.equal(monthly.buckets[11].key, '2026-10')
  const yearly = analyticsCalendar('year', new Date('2026-10-09T02:00:00.000Z'))
  assert.deepEqual(yearly.buckets.map(b => b.key), ['2022','2023','2024','2025','2026'])
  assert.equal(yearly.buckets.every(b => b.assessmentCount === 0 && b.rechargeCount === 0), true)
})

import {readAssessmentCommerceAnalytics} from './commercial-analytics.js'
import type mysql from 'mysql2/promise'
function fakePool(paymentError=false,ledgerError=false,assessmentError=false){
 const calls:Array<{sql:string;params:unknown[]}>=[];let released=false
 const conn={async query(sql:string,params:unknown[]=[]){
  calls.push({sql,params})
  if(sql.includes('@@session.time_zone'))return [[{timeZone:'SYSTEM'}]]
  if(sql.startsWith('SET '))return [[]]
  if(sql.includes('payment_orders')){
   if(paymentError)throw Object.assign(new Error('synthetic'),{code:'ER_NO_SUCH_TABLE'})
   return sql.includes('INNER JOIN users')?[[{userId:'synthetic-payer',displayName:'合成昵称',rechargeCount:1,amountFen:1690}]]:[[{bucketKey:'2026-10-12',cnt:1,creditCount:10,amountFen:1690}]]
  }
  if(sql.includes('credit_ledger_entries')){
   if(ledgerError)throw Object.assign(new Error('synthetic'),{code:'ER_NO_SUCH_TABLE'})
   if(sql.includes('NOT EXISTS'))return [[{cnt:2}]]
   if(sql.includes('freeGranted'))return [[{freeGranted:5,paidGranted:10,debitedCredits:2,balance:13,correctionCredits:0}]]
   return [[{bucketKey:'2026-10-12',cnt:2}]]
  }
  if(sql.includes('credit_reservations'))return sql.includes('GROUP BY bucketKey')?[[{bucketKey:'2026-10-12',cnt:1}]]:[[{status:'held',amount:1},{status:'released',amount:1}]]
  if(assessmentError)throw new Error('synthetic_assessment_failure')
  if(sql.includes('completed_at IS NULL'))return [[{cnt:1}]]
  if(sql.includes('GROUP BY bucketKey'))return [[{bucketKey:'2026-10-12',cnt:2}]]
  return [[{cnt:2}]]
 },release(){released=true},destroy(){}}
 return {pool:{async getConnection(){return conn}} as unknown as mysql.Pool,calls,released:()=>released}
}
test('real analytics separates payment/ledger errors from successful assessments and preserves timezone',async()=>{
 const f=fakePool(true,true),data=await readAssessmentCommerceAnalytics(f.pool,'week',new Date('2026-10-12T04:00:00Z'))
 assert.equal(data.summary.assessmentCount,2)
 assert.equal(data.summary.rechargeCount,null);assert.equal(data.summary.consumptionCount,null)
 assert.equal(data.sources.payments.status,'error');assert.equal(data.sources.ledger.status,'error')
 assert.equal(data.gaps.successWithoutDebit,null)
 assert.equal(data.range.timezone,'Asia/Shanghai');assert.equal(data.range.from,'2026-10-06 00:00:00')
 assert.ok(f.calls.some(c=>c.params.includes('2026-10-05 16:00:00')))
 assert.deepEqual(f.calls.at(-1)?.params,['SYSTEM']);assert.equal(f.released(),true)
})
test('analytics uses paid amounts in fen, interval-scoped ranking and explicit unattributed debits',async()=>{
 const f=fakePool(),data=await readAssessmentCommerceAnalytics(f.pool,'week',new Date('2026-10-12T04:00:00Z'))
 assert.equal(data.summary.rechargeAmountFen,1690);assert.equal(data.payers[0].amountFen,1690)
 assert.equal(data.ledger.freeGranted,5);assert.equal(data.ledger.paidGranted,10);assert.equal(data.ledger.freeUsed,null)
 assert.equal(data.ledger.unallocatedConsumption,2);assert.equal(data.gaps.successWithoutCompletedAt,1)
 assert.equal(data.summary.releasedCount,1);assert.equal(data.reservations.released,1)
 assert.ok(f.calls.filter(c=>c.sql.includes('payment_orders')).every(c=>c.sql.includes("status='paid'")&&c.params.includes('2026-10-05 16:00:00')))
})
test('assessment query failure propagates rather than inventing empty or zero metrics',async()=>{
 const f=fakePool(false,false,true)
 await assert.rejects(readAssessmentCommerceAnalytics(f.pool,'week'),/synthetic_assessment_failure/)
 assert.equal(f.released(),true);assert.deepEqual(f.calls.at(-1)?.params,['SYSTEM'])
})
