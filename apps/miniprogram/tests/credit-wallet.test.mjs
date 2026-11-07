import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import Module from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const originalLoad = Module._load
const filename = path.resolve(import.meta.dirname, '../miniprogram/components/credit-wallet/credit-wallet.ts')
const storage = new Map()
let owner = 'student-a', platform = 'android', grants = 0, orderReads = 0, orderCreates = 0, metaFails = false
let reconcileFails = false, reconcileState = 'paid', afterSales = 0
let definition
globalThis.Component = value => { definition = value }
globalThis.wx = {
  getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key),
  getSystemInfoSync: () => ({ platform }), showModal() {}, showToast() {},
}
Module._load = function (id, parent, isMain) {
  if (id.endsWith('/auth')) return { getSavedAuthResult: () => ({ user: { id: owner } }) }
  if (id.endsWith('/request')) return {
    friendlyRequestError: () => '网络失败',
    getCommercialMeta: async () => { if (metaFails) throw new Error('offline'); return { policy: { enforcementEnabled: true }, payment: { checkoutEnabled: true,
      skus: [{ key: 'JC000', creditAmount: 1, amountFen: 100 }, { key: 'JC001', creditAmount: 3, amountFen: 300 }] } } },
    grantMyFreeCredits: async () => { grants += 1 },
    getMyCreditAccount: async () => ({ availableBalance: 2 }),
    getMyVirtualPurchaseOrders: async () => { orderReads += 1; return [{ id: 'paid-1', skuKey: 'JC001', amountFen: 300, purchasedCredits: 3, credited: 3, status: 'paid' }] },
    createVirtualAssessmentOrder: async () => { orderCreates += 1; throw new Error('should not create') },
    reconcileVirtualAssessmentOrder: async () => { if (reconcileFails) throw new Error('query failed'); return { state: reconcileState, credited: reconcileState === 'paid', deliveryPending: false } },
    requestVirtualPurchaseAfterSales: async () => { afterSales += 1 }, endUnpaidVirtualAssessmentOrder: async () => ({ state: 'closed', credited: false }),
  }
  return originalLoad.call(this, id, parent, isMain)
}
const source = readFileSync(filename, 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const loaded = new Module(filename)
loaded.filename = filename
loaded.paths = Module._nodeModulePaths(path.dirname(filename))
loaded._compile(output, filename)
Module._load = originalLoad

function wallet() {
  return { ...definition.methods, data: { ...structuredClone(definition.data), mode: 'full', accountId: owner },
    setData(patch) { Object.assign(this.data, patch) } }
}

test('wallet reads server balance and platform SKU; orders stay lazy', async () => {
  owner = 'student-a'; platform = 'ios'; orderReads = 0; grants = 0
  const view = wallet()
  await view.loadCredits()
  assert.equal(view.data.creditAvailable, 2)
  assert.deepEqual(view.data.skuChoices.map(item => item.key), ['JC001'])
  assert.equal(orderReads, 0)
  view.onToggleOrders()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(orderReads, 1)
  assert.equal(view.data.purchaseOrders[0].statusLabel, '已付款')
  await view.loadCredits()
  assert.equal(grants, 1)
  platform = 'android'; owner = 'student-b'
  view.data.accountId = owner
  await view.loadCredits()
  assert.deepEqual(view.data.skuChoices.map(item => item.key), ['JC000', 'JC001'])
  assert.equal(view.data.ordersOpen, false)
})

test('pending order blocks another purchase and verified payment clears its owner marker', async () => {
  owner = 'student-c'; platform = 'android'; orderCreates = 0
  const view = wallet()
  storage.set('jiuchen:virtual-order:student-c', 'pending-c')
  view.restorePending()
  await view.loadCredits()
  await view.beginCreditPurchase('JC001')
  assert.equal(orderCreates, 0)
  assert.equal(view.data.pendingPaymentOrderId, 'pending-c')
  await view.verifyCreditPayment()
  assert.equal(storage.has('jiuchen:virtual-order:student-c'), false)
  assert.equal(view.data.pendingPaymentOrderId, '')
  owner = 'student-d'; view.data.accountId = owner
  view.restorePending()
  assert.equal(view.data.pendingPaymentOrderId, '')
})

test('network failure reports an error without exposing stale balance', async () => {
  owner = 'student-e'; metaFails = true
  const view = wallet()
  await view.loadCredits()
  assert.equal(view.data.creditAvailable, null)
  assert.equal(view.data.creditError, '网络失败')
  metaFails = false
})

test('failed official query keeps pending protection; refund and after-sales use existing contracts', async () => {
  owner = 'student-f'; reconcileFails = true; reconcileState = 'paid'; afterSales = 0
  const view = wallet()
  storage.set('jiuchen:virtual-order:student-f', 'pending-f')
  view.restorePending()
  await assert.rejects(view.verifyCreditPayment())
  assert.equal(view.data.pendingPaymentOrderId, 'pending-f')
  reconcileFails = false; reconcileState = 'refunded'
  await view.verifyCreditPayment()
  assert.equal(storage.has('jiuchen:virtual-order:student-f'), false)
  await view.requestAfterSales('paid-1')
  assert.equal(afterSales, 1)
  reconcileState = 'paid'
})
