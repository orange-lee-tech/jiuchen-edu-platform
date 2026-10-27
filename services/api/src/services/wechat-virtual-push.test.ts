import assert from 'node:assert/strict'
import { createCipheriv, createHash } from 'node:crypto'
import test from 'node:test'
import { buildApp } from '../app.js'
import { loadEnv } from '../config/env.js'
import { decryptVirtualPush, encryptedVirtualPushBody, parseVirtualGoodsPush, parseVirtualAncillaryPush,
  verifyVirtualPushSignature, verifyVirtualServerSignature } from './wechat-virtual-push.js'

const token = 'fixture-token'
const appId = 'wx-fixture-app'
const key = Buffer.alloc(32, 17)
const aesKey = key.toString('base64').slice(0, 43)
const timestamp = '1793000000'
const nonce = 'fixture-nonce'
const goods = '<xml><Event><![CDATA[xpay_goods_deliver_notify]]></Event>' +
  '<Env>0</Env>' +
  '<OpenId><![CDATA[fixture_openid]]></OpenId>' +
  '<OutTradeNo><![CDATA[JCV1234567890123456789012345678]]></OutTradeNo>' +
  '<GoodsInfo><ProductId><![CDATA[product_000]]></ProductId>' +
  '<Quantity>1</Quantity><ActualPrice>10</ActualPrice></GoodsInfo>' +
  '<WeChatPayInfo><MchOrderNo>wechat-order</MchOrderNo></WeChatPayInfo></xml>'

function fixture(plain: string) {
  const message = Buffer.from(plain)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(message.length)
  const source = Buffer.concat([Buffer.alloc(16, 7), length, message, Buffer.from(appId)])
  const padding = 32 - (source.length % 32)
  const cipher = createCipheriv('aes-256-cbc', key, key.subarray(0, 16))
  cipher.setAutoPadding(false)
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([source,
    Buffer.alloc(padding, padding)])), cipher.final()]).toString('base64')
  const signature = createHash('sha1').update([token, timestamp, nonce, encrypted].sort().join('')).digest('hex')
  return { encrypted, signature }
}

test('verified encrypted virtual goods push parses one matching product and order', () => {
  const { encrypted, signature } = fixture(goods)
  assert.equal(verifyVirtualPushSignature({ token, timestamp, nonce, encrypted, signature }), true)
  assert.equal(verifyVirtualPushSignature({ token, timestamp, nonce, encrypted, signature: '0'.repeat(40) }), false)
  assert.equal(encryptedVirtualPushBody(`<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`), encrypted)
  assert.deepEqual(parseVirtualGoodsPush(decryptVirtualPush({ encrypted, aesKey, appId })), {
    outTradeNo: 'JCV1234567890123456789012345678', openId: 'fixture_openid',
    productId: 'product_000',env:0,actualPriceFen:10,platformOrderId:'wechat-order',
  })
  assert.throws(() => decryptVirtualPush({ encrypted, aesKey, appId: 'wrong-app' }), /app_mismatch/)
  assert.throws(() => parseVirtualGoodsPush(goods.replace('<Quantity>1</Quantity>',
    '<Quantity>2</Quantity>')), /goods_invalid/)
})

test('verified refund and complaint XML distinguish outcome from notification acceptance',()=>{
  const refund='<xml><Event>xpay_refund_notify</Event><MchOrderId>JCV1234567890123456789012345678</MchOrderId>'+
    '<MchRefundId>refund_12345678</MchRefundId><OpenId>fixture_openid</OpenId>'+
    '<RefundFee>10</RefundFee><RetCode>0</RetCode><Env>0</Env></xml>'
  assert.deepEqual(parseVirtualAncillaryPush(refund),{event:'refund',
    outTradeNo:'JCV1234567890123456789012345678',refundId:'refund_12345678',
    openId:'fixture_openid',refundFeeFen:10,retCode:0,env:0,wxOrderId:null})
  const failed=parseVirtualAncillaryPush(refund.replace('<RetCode>0</RetCode>','<RetCode>1</RetCode>'))
  assert.equal(failed.event,'refund')
  if(failed.event==='refund') assert.equal(failed.retCode,1)
  const complaint='<xml><Event>xpay_complaint_notify</Event><RequestId>request-123</RequestId>'+
    '<MchOrderId>JCV1234567890123456789012345678</MchOrderId><OpenId>fixture_openid</OpenId></xml>'
  assert.deepEqual(parseVirtualAncillaryPush(complaint),{event:'complaint',
    requestId:'request-123',outTradeNo:'JCV1234567890123456789012345678',openId:'fixture_openid'})
})

test('standard WeChat server challenge verifies signature and echoes plain text unchanged', async () => {
  const app = buildApp(loadEnv({ WECHAT_VIRTUAL_PUSH_TOKEN: token }))
  const echostr = 'plain-challenge_123'
  const signature = createHash('sha1').update([token, timestamp, nonce].sort().join('')).digest('hex')
  const query = new URLSearchParams({ signature, timestamp, nonce, echostr })
  try {
    assert.equal(verifyVirtualServerSignature({ token, timestamp, nonce, signature }), true)
    const verified = await app.inject({ method: 'GET',
      url: `/payments/wechat/virtual-push?${query}` })
    assert.equal(verified.statusCode, 200)
    assert.match(String(verified.headers['content-type']), /^text\/plain/)
    assert.equal(verified.body, echostr)
    const wrong = await app.inject({ method: 'GET',
      url: `/payments/wechat/virtual-push?${query.toString().replace(signature, '0'.repeat(40))}` })
    assert.equal(wrong.statusCode, 403)
    const missing = await app.inject({ method: 'GET',
      url: `/payments/wechat/virtual-push?timestamp=${timestamp}&nonce=${nonce}&echostr=${echostr}` })
    assert.equal(missing.statusCode, 403)
  } finally { await app.close() }
})

test('push challenge works with payment switch off; unsolicited delivery cannot settle', async () => {
  const app = buildApp(loadEnv({ WECHAT_APP_ID: appId,
    WECHAT_VIRTUAL_PUSH_TOKEN: token, WECHAT_VIRTUAL_PUSH_AES_KEY: aesKey }))
  const challenge = fixture('challenge-ok')
  const query = new URLSearchParams({ timestamp, nonce, msg_signature: challenge.signature,
    echostr: challenge.encrypted })
  try {
    const verified = await app.inject({ method: 'GET',
      url: `/payments/wechat/virtual-push?${query}` })
    assert.equal(verified.statusCode, 200)
    assert.equal(verified.body, 'challenge-ok')
    const wrong = await app.inject({ method: 'GET',
      url: `/payments/wechat/virtual-push?${query.toString().replace(challenge.signature, '0'.repeat(40))}` })
    assert.equal(wrong.statusCode, 403)
    const push = fixture(goods)
    const response = await app.inject({ method: 'POST',
      url: `/payments/wechat/virtual-push?timestamp=${timestamp}&nonce=${nonce}&msg_signature=${push.signature}`,
      headers: { 'content-type': 'application/xml' },
      payload: `<xml><Encrypt><![CDATA[${push.encrypted}]]></Encrypt></xml>` })
    assert.equal(response.statusCode, 503)
    assert.match(response.body, /<ErrCode>1<\/ErrCode>/)
  } finally { await app.close() }
})
