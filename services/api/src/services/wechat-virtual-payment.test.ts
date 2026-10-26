import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import {loadEnv} from '../config/env.js'
import {virtualPaymentConfig,buildVirtualPayment,paySig,verifyVirtualQuery} from './wechat-virtual-payment.js'
import { FIXED_ASSESSMENT_SKUS } from './commercial-config.js'
const config={offerId:'offer-x',appKey:'key-x',env:1 as const,products:{JC000:'test',JC001:'one',JC002:'five',JC003:'ten'}}
const sku=FIXED_ASSESSMENT_SKUS[1]!
test('virtual payments default closed, production requires separate approval',()=>{
  assert.equal(virtualPaymentConfig(loadEnv({})),null)
  assert.equal(virtualPaymentConfig(loadEnv({WECHAT_VIRTUAL_PAY_ENABLED:'true'})),null)
  const env={WECHAT_VIRTUAL_PAY_ENABLED:'true',WECHAT_VIRTUAL_PAY_APP_KEY:'hidden',WECHAT_VIRTUAL_PAY_OFFER_ID:'offer',WECHAT_VIRTUAL_PAY_PRODUCT_TEST:'test',WECHAT_VIRTUAL_PAY_PRODUCT_ONE:'one',WECHAT_VIRTUAL_PAY_PRODUCT_FIVE:'five',WECHAT_VIRTUAL_PAY_PRODUCT_TEN:'ten',WECHAT_VIRTUAL_PAY_ENV:'production'}
  assert.equal(virtualPaymentConfig(loadEnv(env)),null)
  assert.equal(virtualPaymentConfig(loadEnv({...env,WECHAT_VIRTUAL_PAY_PRODUCTION_APPROVED:'true'})),null)
  const ready = {...env,WECHAT_VIRTUAL_PAY_PRODUCTION_APPROVED:'true',WECHAT_APP_ID:'wx-test',
    WECHAT_VIRTUAL_PUSH_TOKEN:'test-token',WECHAT_VIRTUAL_PUSH_AES_KEY:'A'.repeat(43)}
  assert.equal(virtualPaymentConfig(loadEnv(ready))?.env,0)
  assert.equal(virtualPaymentConfig(loadEnv({...ready,WECHAT_VIRTUAL_PAY_PRODUCT_FIVE:'one'})),null)
  assert.equal(virtualPaymentConfig(loadEnv({...ready,WECHAT_VIRTUAL_PAY_PRODUCT_TEST:'one'})),null)
})
test('virtual signing preserves exact JSON bytes and protects keys',()=>{
  const p=buildVirtualPayment({config,sku,orderNo:'JC12345678901234567',sessionKey:'private-session'})
  assert.equal(p.paySig,createHmac('sha256','key-x').update('requestVirtualPayment&'+p.signData).digest('hex'))
  assert.equal(p.signature,createHmac('sha256','private-session').update(p.signData).digest('hex'))
  assert.ok(!p.signData.includes('private-session') && !p.signData.includes('key-x'))
  assert.equal(JSON.parse(p.signData).goodsPrice,190)
  assert.equal(p.mode,'short_series_goods')
  assert.equal(JSON.parse(p.signData).productId,'one')
  assert.equal(JSON.parse(p.signData).mode,undefined)
  for(const fixed of FIXED_ASSESSMENT_SKUS) {
    const signed=buildVirtualPayment({config,sku:fixed,orderNo:'JCV1234567890123456789012345678',sessionKey:'session'})
    assert.equal(JSON.parse(signed.signData).goodsPrice,fixed.amountFen)
    assert.equal(JSON.parse(signed.signData).productId,config.products[fixed.key as keyof typeof config.products])
  }
  assert.throws(()=>paySig('https://bad.site','foo','bar'),/not_allowed/)
})
test('never credit pending, refunded, wrongly priced or unverified orders',()=>{
  const paid={errcode:0,order:{order_id:'JC12345678901234567',order_fee:190,paid_fee:190,wx_order_id:'wechat123',status:2}}
  assert.equal(verifyVirtualQuery(paid,'JC12345678901234567',190).state,'paid')
  assert.equal(verifyVirtualQuery({...paid,order:{...paid.order,status:1}},'JC12345678901234567',190).state,'pending')
  assert.equal(verifyVirtualQuery({...paid,order:{...paid.order,status:5}},'JC12345678901234567',190).state,'refunded')
  assert.throws(()=>verifyVirtualQuery(paid,'JC12345678901234567',1690),/order_mismatch/)
  assert.throws(()=>verifyVirtualQuery({...paid,order:{...paid.order,product_id:'wrong'}},'JC12345678901234567',190,'one'),/product_mismatch/)
  assert.throws(()=>verifyVirtualQuery({...paid,order:{...paid.order,wx_order_id:''}},'JC12345678901234567',190),/evidence_incomplete/)
})
