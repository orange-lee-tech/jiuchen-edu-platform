import {
  createDecipheriv,
  createHash,
  randomBytes,
  sign,
  verify,
} from 'node:crypto'
import type { AppEnv } from '../config/env.js'

export type WechatPayClientParams = {
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'RSA'
  paySign: string
}

export type VerifiedWechatPayNotification = {
  notificationId: string
  outTradeNo: string
  providerTransactionId: string
  amountFen: number
  currency: 'CNY'
  merchantId: string
  appId: string
  success: true
  payloadHash: string
}

export type WechatPayCreateOrderInput = {
  outTradeNo: string
  description: string
  amountFen: number
  openId: string
}

export interface WechatPayGateway {
  isConfigured(): boolean
  missingConfiguration(): string[]
  createJsapiOrder(
    input: WechatPayCreateOrderInput,
  ): Promise<WechatPayClientParams>
  verifyAndDecryptNotification(input: {
    rawBody: Buffer
    headers: Record<string, string | undefined>
  }): Promise<VerifiedWechatPayNotification>
}

type GatewayConfig = {
  appId: string
  merchantId: string
  apiV3Key: string
  merchantSerialNo: string
  privateKeyPem: string
  platformSerialNo: string
  platformCertificatePem: string
  notifyUrl: string
}

export class WechatPayGatewayError extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message)
    this.name = 'WechatPayGatewayError'
  }
}

function normalizePem(value: string) {
  return value.includes('\\n') ? value.replaceAll('\\n', '\n') : value
}

function createGatewayConfig(env: AppEnv): {
  config: GatewayConfig | null
  missing: string[]
} {
  const fields = [
    ['WECHAT_APP_ID', env.WECHAT_APP_ID],
    ['WECHAT_PAY_MCH_ID', env.WECHAT_PAY_MCH_ID],
    ['WECHAT_PAY_API_V3_KEY', env.WECHAT_PAY_API_V3_KEY],
    ['WECHAT_PAY_MERCHANT_SERIAL_NO', env.WECHAT_PAY_MERCHANT_SERIAL_NO],
    ['WECHAT_PAY_PRIVATE_KEY_PEM', env.WECHAT_PAY_PRIVATE_KEY_PEM],
    ['WECHAT_PAY_PLATFORM_SERIAL_NO', env.WECHAT_PAY_PLATFORM_SERIAL_NO],
    ['WECHAT_PAY_PLATFORM_CERT_PEM', env.WECHAT_PAY_PLATFORM_CERT_PEM],
    ['WECHAT_PAY_NOTIFY_URL', env.WECHAT_PAY_NOTIFY_URL],
  ] as const

  const missing = fields
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length) return { config: null, missing }

  if (Buffer.byteLength(env.WECHAT_PAY_API_V3_KEY!, 'utf8') !== 32) {
    return { config: null, missing: ['WECHAT_PAY_API_V3_KEY(32-bytes-required)'] }
  }

  return {
    missing: [],
    config: {
      appId: env.WECHAT_APP_ID!,
      merchantId: env.WECHAT_PAY_MCH_ID!,
      apiV3Key: env.WECHAT_PAY_API_V3_KEY!,
      merchantSerialNo: env.WECHAT_PAY_MERCHANT_SERIAL_NO!,
      privateKeyPem: normalizePem(env.WECHAT_PAY_PRIVATE_KEY_PEM!),
      platformSerialNo: env.WECHAT_PAY_PLATFORM_SERIAL_NO!,
      platformCertificatePem: normalizePem(env.WECHAT_PAY_PLATFORM_CERT_PEM!),
      notifyUrl: env.WECHAT_PAY_NOTIFY_URL!,
    },
  }
}

function nonce() {
  return randomBytes(16).toString('hex')
}

function paymentSignatureMessage(
  appId: string,
  timeStamp: string,
  nonceStr: string,
  packageValue: string,
) {
  return `${appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`
}

function requestSignatureMessage(
  method: string,
  pathWithQuery: string,
  timestamp: string,
  nonceStr: string,
  body: string,
) {
  return `${method}\n${pathWithQuery}\n${timestamp}\n${nonceStr}\n${body}\n`
}

function callbackSignatureMessage(
  timestamp: string,
  nonceStr: string,
  rawBody: Buffer,
) {
  return Buffer.concat([
    Buffer.from(`${timestamp}\n${nonceStr}\n`, 'utf8'),
    rawBody,
    Buffer.from('\n', 'utf8'),
  ])
}

function decryptNotificationResource(
  resource: {
    ciphertext: string
    nonce: string
    associated_data?: string
  },
  apiV3Key: string,
) {
  const encrypted = Buffer.from(resource.ciphertext, 'base64')
  if (encrypted.byteLength <= 16) {
    throw new WechatPayGatewayError('wechat_pay_invalid_ciphertext')
  }

  const data = encrypted.subarray(0, encrypted.byteLength - 16)
  const authTag = encrypted.subarray(encrypted.byteLength - 16)
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(apiV3Key, 'utf8'),
    Buffer.from(resource.nonce, 'utf8'),
  )

  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'))
  }
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    'utf8',
  )
}

class UnconfiguredWechatPayGateway implements WechatPayGateway {
  constructor(private readonly missing: string[]) {}

  isConfigured() {
    return false
  }

  missingConfiguration() {
    return [...this.missing]
  }

  async createJsapiOrder(): Promise<never> {
    throw new WechatPayGatewayError('wechat_pay_not_configured')
  }

  async verifyAndDecryptNotification(): Promise<never> {
    throw new WechatPayGatewayError('wechat_pay_not_configured')
  }
}

class ConfiguredWechatPayGateway implements WechatPayGateway {
  constructor(
    private readonly config: GatewayConfig,
    private readonly httpClient: typeof fetch,
  ) {}

  isConfigured() {
    return true
  }

  missingConfiguration() {
    return []
  }

  async createJsapiOrder(
    input: WechatPayCreateOrderInput,
  ): Promise<WechatPayClientParams> {
    const url = new URL(
      'https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi',
    )
    const requestBody = JSON.stringify({
      appid: this.config.appId,
      mchid: this.config.merchantId,
      description: input.description,
      out_trade_no: input.outTradeNo,
      notify_url: this.config.notifyUrl,
      amount: {
        total: input.amountFen,
        currency: 'CNY',
      },
      payer: {
        openid: input.openId,
      },
    })

    const timestamp = String(Math.floor(Date.now() / 1000))
    const nonceStr = nonce()
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(
        requestSignatureMessage(
          'POST',
          url.pathname + url.search,
          timestamp,
          nonceStr,
          requestBody,
        ),
        'utf8',
      ),
      this.config.privateKeyPem,
    ).toString('base64')

    const authorization =
      'WECHATPAY2-SHA256-RSA2048 ' +
      `mchid="${this.config.merchantId}",` +
      `nonce_str="${nonceStr}",` +
      `timestamp="${timestamp}",` +
      `serial_no="${this.config.merchantSerialNo}",` +
      `signature="${signature}"`

    const response = await this.httpClient(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: authorization,
        'User-Agent': 'jiuchen-api/credit-payment-v1',
      },
      body: requestBody,
    })

    if (!response.ok) {
      throw new WechatPayGatewayError(
        'wechat_pay_create_order_failed',
        `wechat_pay_create_order_failed:${response.status}`,
      )
    }

    const payload = (await response.json()) as { prepay_id?: unknown }
    if (typeof payload.prepay_id !== 'string' || !payload.prepay_id) {
      throw new WechatPayGatewayError('wechat_pay_prepay_id_missing')
    }

    const clientTimestamp = String(Math.floor(Date.now() / 1000))
    const clientNonce = nonce()
    const packageValue = `prepay_id=${payload.prepay_id}`
    const paySign = sign(
      'RSA-SHA256',
      Buffer.from(
        paymentSignatureMessage(
          this.config.appId,
          clientTimestamp,
          clientNonce,
          packageValue,
        ),
        'utf8',
      ),
      this.config.privateKeyPem,
    ).toString('base64')

    return {
      timeStamp: clientTimestamp,
      nonceStr: clientNonce,
      package: packageValue,
      signType: 'RSA',
      paySign,
    }
  }

  async verifyAndDecryptNotification(input: {
    rawBody: Buffer
    headers: Record<string, string | undefined>
  }): Promise<VerifiedWechatPayNotification> {
    const timestamp = input.headers['wechatpay-timestamp']
    const nonceStr = input.headers['wechatpay-nonce']
    const signature = input.headers['wechatpay-signature']
    const serial = input.headers['wechatpay-serial']

    if (!timestamp || !nonceStr || !signature || !serial) {
      throw new WechatPayGatewayError('wechat_pay_callback_headers_missing')
    }
    if (serial !== this.config.platformSerialNo) {
      throw new WechatPayGatewayError('wechat_pay_platform_serial_mismatch')
    }

    const signatureValid = verify(
      'RSA-SHA256',
      callbackSignatureMessage(timestamp, nonceStr, input.rawBody),
      this.config.platformCertificatePem,
      Buffer.from(signature, 'base64'),
    )
    if (!signatureValid) {
      throw new WechatPayGatewayError('wechat_pay_callback_signature_invalid')
    }

    let envelope: {
      id?: unknown
      resource?: {
        ciphertext?: unknown
        nonce?: unknown
        associated_data?: unknown
      }
    }
    try {
      envelope = JSON.parse(input.rawBody.toString('utf8'))
    } catch {
      throw new WechatPayGatewayError('wechat_pay_callback_invalid_json')
    }

    if (
      typeof envelope.id !== 'string' ||
      !envelope.id ||
      !envelope.resource ||
      typeof envelope.resource.ciphertext !== 'string' ||
      typeof envelope.resource.nonce !== 'string'
    ) {
      throw new WechatPayGatewayError('wechat_pay_callback_invalid_resource')
    }

    const plaintext = decryptNotificationResource(
      {
        ciphertext: envelope.resource.ciphertext,
        nonce: envelope.resource.nonce,
        associated_data:
          typeof envelope.resource.associated_data === 'string'
            ? envelope.resource.associated_data
            : undefined,
      },
      this.config.apiV3Key,
    )

    let transaction: {
      mchid?: unknown
      appid?: unknown
      out_trade_no?: unknown
      transaction_id?: unknown
      trade_state?: unknown
      amount?: {
        total?: unknown
        currency?: unknown
      }
    }
    try {
      transaction = JSON.parse(plaintext)
    } catch {
      throw new WechatPayGatewayError('wechat_pay_callback_invalid_plaintext')
    }

    if (
      transaction.mchid !== this.config.merchantId ||
      transaction.appid !== this.config.appId
    ) {
      throw new WechatPayGatewayError('wechat_pay_callback_merchant_mismatch')
    }
    if (transaction.trade_state !== 'SUCCESS') {
      throw new WechatPayGatewayError('wechat_pay_callback_not_success')
    }
    if (
      typeof transaction.out_trade_no !== 'string' ||
      typeof transaction.transaction_id !== 'string' ||
      !transaction.amount ||
      typeof transaction.amount.total !== 'number' ||
      transaction.amount.currency !== 'CNY'
    ) {
      throw new WechatPayGatewayError('wechat_pay_callback_invalid_transaction')
    }

    return {
      notificationId: envelope.id,
      outTradeNo: transaction.out_trade_no,
      providerTransactionId: transaction.transaction_id,
      amountFen: transaction.amount.total,
      currency: 'CNY',
      merchantId: transaction.mchid as string,
      appId: transaction.appid as string,
      success: true,
      payloadHash: createHash('sha256').update(input.rawBody).digest('hex'),
    }
  }
}

export function createWechatPayGatewayFromEnv(
  env: AppEnv,
  httpClient: typeof fetch = fetch,
): WechatPayGateway {
  const resolved = createGatewayConfig(env)
  if (!resolved.config) {
    return new UnconfiguredWechatPayGateway(resolved.missing)
  }

  return new ConfiguredWechatPayGateway(resolved.config, httpClient)
}
