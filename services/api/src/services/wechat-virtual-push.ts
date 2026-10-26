import { createDecipheriv, createHash, timingSafeEqual } from 'node:crypto'

const xmlTag = (xml: string, name: string): string => {
  const matches = [...xml.matchAll(new RegExp(`<${name}>(?:<!\\[CDATA\\[([^\\]]*)\\]\\]>|([^<]*))<\\/${name}>`, 'g'))]
  if (matches.length !== 1) throw new Error('virtual_push_field_invalid')
  return matches[0]![1] ?? matches[0]![2] ?? ''
}

export function verifyVirtualPushSignature(input: {
  token: string; timestamp: string; nonce: string; encrypted: string; signature: string
}): boolean {
  if (!/^\d{1,16}$/.test(input.timestamp) || !/^[\w-]{1,128}$/.test(input.nonce) ||
      !/^[a-fA-F0-9]{40}$/.test(input.signature)) return false
  const expected = createHash('sha1').update(
    [input.token, input.timestamp, input.nonce, input.encrypted].sort().join(''),
  ).digest()
  return timingSafeEqual(expected, Buffer.from(input.signature, 'hex'))
}

export function decryptVirtualPush(input: {
  encrypted: string; aesKey: string; appId: string
}): string {
  if (!/^[A-Za-z0-9+/]{43}$/.test(input.aesKey)) throw new Error('virtual_push_key_invalid')
  const key = Buffer.from(`${input.aesKey}=`, 'base64')
  const cipherText = Buffer.from(input.encrypted, 'base64')
  if (key.length !== 32 || cipherText.length === 0 || cipherText.length % 16 !== 0)
    throw new Error('virtual_push_ciphertext_invalid')
  const decipher = createDecipheriv('aes-256-cbc', key, key.subarray(0, 16))
  decipher.setAutoPadding(false)
  const padded = Buffer.concat([decipher.update(cipherText), decipher.final()])
  const padding = padded[padded.length - 1]!
  if (padding < 1 || padding > 32 || !padded.subarray(-padding).every(byte => byte === padding))
    throw new Error('virtual_push_padding_invalid')
  const plain = padded.subarray(0, -padding)
  if (plain.length < 20) throw new Error('virtual_push_message_invalid')
  const length = plain.readUInt32BE(16)
  if (length < 1 || 20 + length >= plain.length ||
      plain.subarray(20 + length).toString('utf8') !== input.appId)
    throw new Error('virtual_push_app_mismatch')
  return plain.subarray(20, 20 + length).toString('utf8')
}

export function parseVirtualGoodsPush(xml: string) {
  if (xml.length > 16_384 || xmlTag(xml, 'Event') !== 'xpay_goods_deliver_notify')
    throw new Error('virtual_push_event_unsupported')
  const outTradeNo = xmlTag(xml, 'OutTradeNo')
  const openId = xmlTag(xml, 'OpenId')
  const productId = xmlTag(xml, 'ProductId')
  const quantity = xmlTag(xml, 'Quantity')
  if (!/^JCV[A-Z0-9]{8,29}$/.test(outTradeNo) || !/^[A-Za-z0-9_-]{1,128}$/.test(openId) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(productId) || quantity !== '1')
    throw new Error('virtual_push_goods_invalid')
  return { outTradeNo, openId, productId }
}

export function encryptedVirtualPushBody(xml: string): string {
  if (xml.length > 16_384) throw new Error('virtual_push_body_too_large')
  const encrypted = xmlTag(xml, 'Encrypt')
  if (!/^[A-Za-z0-9+/=]{24,16384}$/.test(encrypted))
    throw new Error('virtual_push_ciphertext_invalid')
  return encrypted
}
