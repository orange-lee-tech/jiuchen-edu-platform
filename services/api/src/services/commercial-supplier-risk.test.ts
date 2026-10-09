import assert from 'node:assert/strict'
import test from 'node:test'
import { computeSupplierRisk } from './commercial-analytics.js'
const now=new Date('2026-10-10T00:00:00.000Z')
const at='2026-10-09T23:00:00.000Z'
test('missing/stale provider balance never claims healthy',()=>{
  assert.equal(computeSupplierRisk({runs7d:120,now}).status,'missing')
  assert.equal(computeSupplierRisk({runs7d:120,balanceFen:1000,costFenPerRun:3,observedAt:'2026-10-08T00:00:00Z',now}).status,'stale')
})
test('critical margin wins even in the early stage',()=>{
  assert.equal(computeSupplierRisk({runs7d:1,balanceFen:20,costFenPerRun:3,observedAt:at,now}).status,'critical')
})
test('7 day average forecasts by actual evaluations, not recharge orders',()=>{
  const x=computeSupplierRisk({runs7d:70,balanceFen:100,costFenPerRun:2,observedAt:at,now})
  assert.equal(x.estimatedDailyFen,20)
  assert.equal(x.estimatedRunwayDays,5)
  assert.equal(x.status,'critical')
})
test('low traffic remains explicitly early stage with no false confidence',()=>{
  const x=computeSupplierRisk({runs7d:5,balanceFen:10000,costFenPerRun:2,observedAt:at,now})
  assert.equal(x.status,'early_stage')
})