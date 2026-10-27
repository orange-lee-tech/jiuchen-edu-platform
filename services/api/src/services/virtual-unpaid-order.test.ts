import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { DatabaseContext } from '../db/client.js'
import { loadEnv } from '../config/env.js'
import { endRejectedVirtualOrder, UnpaidOrderError } from './virtual-unpaid-order.js'

const env=loadEnv({WECHAT_APP_ID:'test-app',WECHAT_APP_SECRET:'test-secret'})
const config={offerId:'test-offer',appKey:'test-key',env:0 as const,
  products:{JC000:'product-0',JC001:'product-1',JC002:'product-2',JC003:'product-3'}}
const base={id:'test-order',outTradeNo:'JCV12345678901234567890',status:'pending',
  amountFen:10,creditAmount:2,skuKey:'JC000',openId:'test-openid',
  payEnvironment:'production',providerTransactionId:null,paidAt:null,
  deliveryConfirmedAt:null,checkoutExpired:1}

function fixture(options:{status?:string;expired?:number;ledger?:boolean;push?:boolean;
  affectedRows?:number;owner?:string}={}) {
  const state={status:options.status??'pending',writes:0,commits:0,rollbacks:0,officialQueries:0}
  const row=()=>({...base,status:state.status,checkoutExpired:options.expired??1})
  const query=async(sql:string,params?:unknown[])=>{
    if(sql.includes('FROM payment_orders p JOIN users'))
      return [params?.[1]===options.owner?[]:[row()]]
    if(sql.startsWith('UPDATE payment_orders')) {
      state.writes++
      if(options.affectedRows!==0) state.status='closed'
      return [{affectedRows:options.affectedRows??1}]
    }
    if(sql.includes('FROM credit_ledger_entries')) return [options.ledger?[{id:'evidence'}]:[]]
    if(sql.includes('FROM payment_notifications')) return [options.push?[{id:'evidence'}]:[]]
    throw new Error('unexpected_sql')
  }
  const connection={query,beginTransaction:async()=>{},commit:async()=>{state.commits++},
    rollback:async()=>{state.rollbacks++},release:()=>{}}
  const database={configured:true,pool:{query,getConnection:async()=>connection}} as unknown as
    Extract<DatabaseContext,{configured:true}>
  return {state,database}
}
const input=(database:Extract<DatabaseContext,{configured:true}>,userId='owner')=>({
  database,env,config,orderId:base.id,userId,prePaymentErrorCode:-15013,confirmUnpaid:true,
})

test('pre-checkout refusal closes only an expired owner order after official missing response and no ledger evidence',async()=>{
  const f=fixture()
  const fetchMock=mock.method(globalThis,'fetch',async(url:string|URL)=>{
    if(String(url).includes('stable_token'))
      return {ok:true,json:async()=>({access_token:'test-token',expires_in:3600})} as Response
    assert.match(String(url),/\/xpay\/query_order/)
    f.state.officialQueries++
    return {ok:true,json:async()=>({errcode:268490002,errmsg:'数据不存在'})} as Response
  })
  try {
    assert.deepEqual(await endRejectedVirtualOrder(input(f.database)),{state:'closed',credited:false})
    assert.equal(f.state.writes,1)
    const alternate=fixture()
    assert.deepEqual(await endRejectedVirtualOrder({...input(alternate.database),prePaymentErrorCode:-15014}),
      {state:'closed',credited:false},'client code is diagnostic; verified server evidence decides')
    assert.equal(f.state.commits,1)
    assert.equal(f.state.officialQueries,2)
    assert.deepEqual(await endRejectedVirtualOrder(input(f.database)),{state:'closed',credited:false},
      'a repeated close does not issue a second update')
    assert.equal(f.state.writes,1)
  } finally {fetchMock.mock.restore()}
})

test('other users, unexpired checkout, settlement evidence and missing owner confirmation never close',async()=>{
  const f=fixture({owner:'other'})
  await assert.rejects(endRejectedVirtualOrder(input(f.database,'other')),
    (error:unknown)=>error instanceof UnpaidOrderError && error.code==='virtual_order_not_found')
  const young=fixture({expired:0})
  await assert.rejects(endRejectedVirtualOrder(input(young.database)),
    (error:unknown)=>error instanceof UnpaidOrderError && error.code==='virtual_order_checkout_window_open')
  for(const options of [{ledger:true},{push:true},{status:'paid'}]) {
    const guarded=fixture(options)
    await assert.rejects(endRejectedVirtualOrder(input(guarded.database)),UnpaidOrderError)
    assert.equal(guarded.state.writes,0)
  }
  const invalid=fixture()
  await assert.rejects(endRejectedVirtualOrder({...input(invalid.database),confirmUnpaid:false}),
    (error:unknown)=>error instanceof UnpaidOrderError && error.code==='virtual_order_rejection_not_confirmed')
  assert.equal(invalid.state.writes,0)
})

test('an existing WeChat order or concurrent local state change keeps the order unresolved',async()=>{
  let official:{errcode:number;order?:{order_id:string;status:number}}=
    {errcode:0,order:{order_id:base.outTradeNo,status:2}}
  const fetchMock=mock.method(globalThis,'fetch',async(url:string|URL)=>{
    if(String(url).includes('stable_token'))
      return {ok:true,json:async()=>({access_token:'test-token',expires_in:3600})} as Response
    return {ok:true,json:async()=>official} as Response
  })
  try {
    const existing=fixture()
    await assert.rejects(endRejectedVirtualOrder(input(existing.database)),
      (error:unknown)=>error instanceof UnpaidOrderError && error.code==='virtual_order_payment_review_required')
    assert.equal(existing.state.writes,0)
    official={errcode:268490002}
    const racing=fixture({affectedRows:0})
    await assert.rejects(endRejectedVirtualOrder(input(racing.database)),
      (error:unknown)=>error instanceof UnpaidOrderError && error.code==='virtual_order_state_changed')
    assert.equal(racing.state.commits,0)
    assert.equal(racing.state.rollbacks,1)
  } finally {fetchMock.mock.restore()}
})
