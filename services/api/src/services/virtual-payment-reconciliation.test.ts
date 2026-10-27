import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { DatabaseContext } from '../db/client.js'
import { loadEnv } from '../config/env.js'
import { reconcileVirtualOrder, type VirtualOrder } from './virtual-payment-reconciliation.js'

const env = loadEnv({ WECHAT_APP_ID: 'local-app', WECHAT_APP_SECRET: 'local-secret' })
const config = { offerId: 'local-offer', appKey: 'local-key', env: 1 as const,
  products: { JC000: 'product-test', JC001: 'product-one', JC002: 'product-five', JC003: 'product-ten' } }
const order: VirtualOrder = { id: 'local-order', outTradeNo: 'JCV12345678901234567890',
  amountFen: 190, status: 'pending', openId: 'local-openid', deliveryConfirmedAt: null,
  payEnvironment: 'sandbox', wechatProductId: 'product-one' }

function fakeDatabase(query: (sql: string, params?: unknown[]) => Promise<unknown>) {
  return { configured: true, pool: { query } } as unknown as Extract<DatabaseContext, { configured: true }>
}

test('trusted closed query records terminal state without credit settlement', async () => {
  const calls: string[] = []
  const fetchMock = mock.method(globalThis, 'fetch', async (url: string | URL) => {
    const path = String(url)
    if (path.includes('stable_token')) return { ok: true, json: async () => ({ access_token: 'local-token', expires_in: 3600 }) } as Response
    assert.match(path, /\/xpay\/query_order/)
    return { ok: true, json: async () => ({ errcode: 0, order: {
      order_id: order.outTradeNo, order_fee: 190, product_id: 'product-one', status: 6,
    } }) } as Response
  })
  try {
    const database = fakeDatabase(async (sql, params) => {
      calls.push(sql)
      assert.deepEqual(params, ['closed', order.id])
      return [{ affectedRows: 1 }]
    })
    assert.deepEqual(await reconcileVirtualOrder({ database, env, config, order }),
      { state: 'closed', credited: false })
    assert.equal(calls.length, 1)
    assert.match(calls[0]!, /status = 'pending'/)
  } finally { fetchMock.mock.restore() }
})

test('delivery failure remains pending and a later retry confirms without settling again', async () => {
  let deliveryCalls = 0
  let writes = 0
  const fetchMock = mock.method(globalThis, 'fetch', async (url: string | URL) => {
    const path = String(url)
    if (path.includes('stable_token')) return { ok: true, json: async () => ({ access_token: 'local-token', expires_in: 3600 }) } as Response
    assert.match(path, /\/xpay\/notify_provide_goods/)
    deliveryCalls++
    return { ok: true, json: async () => ({ errcode: deliveryCalls === 1 ? 1 : 0 }) } as Response
  })
  try {
    const database = fakeDatabase(async () => { writes++; return [{ affectedRows: 1 }] })
    const paid = { ...order, status: 'paid' }
    assert.deepEqual(await reconcileVirtualOrder({ database, env, config, order: paid }),
      { state: 'paid', credited: true, deliveryPending: true })
    assert.deepEqual(await reconcileVirtualOrder({ database, env, config, order: paid }),
      { state: 'paid', credited: true, deliveryPending: false })
    assert.equal(deliveryCalls, 2)
    assert.equal(writes, 1)
  } finally { fetchMock.mock.restore() }
})

test('verified goods push marks delivery without invoking active compensation endpoint',async()=>{
  const paths:string[]=[]
  let writes=0
  const fetchMock=mock.method(globalThis,'fetch',async(url:string|URL)=>{
    const path=String(url);paths.push(path)
    if(path.includes('stable_token'))return {ok:true,json:async()=>({access_token:'local-token',expires_in:3600})} as Response
    assert.match(path,/\/xpay\/query_order/)
    return {ok:true,json:async()=>({errcode:0,order:{order_id:order.outTradeNo,
      order_fee:190,paid_fee:190,product_id:'product-one',status:2,
      wx_order_id:'platform-paid',env_type:2,order_type:0}})} as Response
  })
  try {
    const database=fakeDatabase(async(sql)=>{
      assert.match(sql,/virtual_delivery_confirmed_at/);writes++
      return [{affectedRows:1}]
    })
    assert.deepEqual(await reconcileVirtualOrder({database,env,config,
      order:{...order,status:'paid'},checkPaidState:true,deliveryPush:true}),
      {state:'paid',credited:true,deliveryPending:false})
    assert.equal(writes,1)
    assert.ok(!paths.some(path=>path.includes('notify_provide_goods')))
  } finally {fetchMock.mock.restore()}
})

test('late official payment evidence on a closed order enters review without granting credits',async()=>{
  let providerQueries=0
  const writes:string[]=[]
  const fetchMock=mock.method(globalThis,'fetch',async(url:string|URL)=>{
    if(String(url).includes('stable_token'))return {ok:true,json:async()=>({access_token:'local-token',expires_in:3600})} as Response
    providerQueries++
    return {ok:true,json:async()=>({errcode:0,order:{order_id:order.outTradeNo,
      order_fee:190,paid_fee:190,status:2,wx_order_id:'late-platform-order'}})} as Response
  })
  try {
    const database=fakeDatabase(async(sql)=>{writes.push(sql);return [{affectedRows:1}]})
    assert.deepEqual(await reconcileVirtualOrder({database,env,config,
      order:{...order,status:'closed'},checkPaidState:true}),
      {state:'review',credited:false,requiresFinanceReview:true})
    assert.equal(providerQueries,2)
    assert.equal(writes.length,1)
    assert.match(writes[0]!,/INSERT INTO virtual_payment_cases/)
  } finally {fetchMock.mock.restore()}
})
