import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCipheriv,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
} from 'node:crypto'
import { loadEnv } from '../config/env.js'
import { createWechatPayGatewayFromEnv } from './wechat-pay.js'

function keyPair() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
}

function configuredEnv(
  merchantPrivateKey: string,
  platformPublicKey: string,
  apiV3Key: string,
) {
  return loadEnv({
    WECHAT_APP_ID: 'wx-test-app',
    WECHAT_PAY_MCH_ID: '1900000001',
    WECHAT_PAY_API_V3_KEY: apiV3Key,
    WECHAT_PAY_MERCHANT_SERIAL_NO: 'MERCHANT-SERIAL',
    WECHAT_PAY_PRIVATE_KEY_PEM: merchantPrivateKey,
    WECHAT_PAY_PLATFORM_SERIAL_NO: 'PLATFORM-SERIAL',
    WECHAT_PAY_PLATFORM_CERT_PEM: platformPublicKey,
    WECHAT_PAY_NOTIFY_URL: 'https://api.example.com/payments/wechat/callback',
  })
}

test('gateway remains explicitly unconfigured without merchant material', () => {
  const gateway = createWechatPayGatewayFromEnv(loadEnv({}))
  assert.equal(gateway.isConfigured(), false)
  assert.ok(gateway.missingConfiguration().includes('WECHAT_PAY_MCH_ID'))
})

test('JSAPI order params are signed server-side', async () => {
  const merchant = keyPair()
  const platform = keyPair()
  const apiV3Key = '12345678901234567890123456789012'

  let authorization = ''
  const fakeFetch: typeof fetch = async (_input, init) => {
    authorization = String(
      (init?.headers as Record<string, string> | undefined)?.Authorization ?? '',
    )
    return new Response(JSON.stringify({ prepay_id: 'wx-prepay-123' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  const gateway = createWechatPayGatewayFromEnv(
    configuredEnv(merchant.privateKey, platform.publicKey, apiV3Key),
    fakeFetch,
  )

  const params = await gateway.createJsapiOrder({
    outTradeNo: 'JC202610040001',
    description: 'AI评估额度',
    amountFen: 100,
    openId: 'openid-1',
  })

  assert.match(authorization, /^WECHATPAY2-SHA256-RSA2048 /)
  assert.equal(params.package, 'prepay_id=wx-prepay-123')
  assert.equal(params.signType, 'RSA')

  const message =
    `wx-test-app\n${params.timeStamp}\n${params.nonceStr}\n${params.package}\n`
  assert.equal(
    verify(
      'RSA-SHA256',
      Buffer.from(message),
      merchant.publicKey,
      Buffer.from(params.paySign, 'base64'),
    ),
    true,
  )
})

test('callback is verified and APIv3 resource decrypted before settlement', async () => {
  const merchant = keyPair()
  const platform = keyPair()
  const apiV3Key = '12345678901234567890123456789012'
  const gateway = createWechatPayGatewayFromEnv(
    configuredEnv(merchant.privateKey, platform.publicKey, apiV3Key),
  )

  const plaintext = JSON.stringify({
    mchid: '1900000001',
    appid: 'wx-test-app',
    out_trade_no: 'JC202610040001',
    transaction_id: '4200000000001',
    trade_state: 'SUCCESS',
    amount: { total: 100, currency: 'CNY' },
  })
  const nonce = randomBytes(12).toString('base64url').slice(0, 12)
  const associatedData = 'transaction'
  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(apiV3Key),
    Buffer.from(nonce),
  )
  cipher.setAAD(Buffer.from(associatedData))
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext)),
    cipher.final(),
    cipher.getAuthTag(),
  ])

  const rawBody = Buffer.from(
    JSON.stringify({
      id: 'notification-1',
      resource: {
        ciphertext: encrypted.toString('base64'),
        nonce,
        associated_data: associatedData,
      },
    }),
  )
  const timestamp = '1791100000'
  const callbackNonce = 'callback-nonce'
  const signature = sign(
    'RSA-SHA256',
    Buffer.concat([
      Buffer.from(`${timestamp}\n${callbackNonce}\n`),
      rawBody,
      Buffer.from('\n'),
    ]),
    platform.privateKey,
  ).toString('base64')

  const notification = await gateway.verifyAndDecryptNotification({
    rawBody,
    headers: {
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': callbackNonce,
      'wechatpay-signature': signature,
      'wechatpay-serial': 'PLATFORM-SERIAL',
    },
  })

  assert.equal(notification.notificationId, 'notification-1')
  assert.equal(notification.outTradeNo, 'JC202610040001')
  assert.equal(notification.providerTransactionId, '4200000000001')
  assert.equal(notification.amountFen, 100)
  assert.match(notification.payloadHash, /^[a-f0-9]{64}$/)
})
