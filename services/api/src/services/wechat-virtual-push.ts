import { createDecipheriv, createHash, timingSafeEqual } from 'node:crypto'

const xmlTag = (xml: string, name: string): string => {
  const matches = [...xml.matchAll(new RegExp(`<${name}>(?:<!\\[CDATA\\[([^\\]]*)\\]\\]>|([^<]*))<\\/${name}>`, 'g'))]
  if (matches.length !== 1) throw new Error('virtual_push_field_invalid')
  return matches[0]![1] ?? matches[0]![2] ?? ''
}
const optionalXmlTag=(xml:string,name:string):string|null=>{
  if(!new RegExp(`<${name}>`).test(xml)) return null
  return xmlTag(xml,name)
}
const xmlBlock=(xml:string,name:string):string=>{
  const matches=[...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`,'g'))]
  if(matches.length!==1) throw new Error('virtual_push_nested_field_invalid')
  return matches[0]![1]!
}
const optionalXmlBlock=(xml:string,name:string):string|null=>
  new RegExp(`<${name}>`).test(xml)?xmlBlock(xml,name):null
function rootXml(xml:string) {
  if(xml.length>16_384 || /<!DOCTYPE|<!ENTITY/i.test(xml) ||
      !/^\s*(?:<\?xml[^>]*>\s*)?<xml>[\s\S]*<\/xml>\s*$/.test(xml))
    throw new Error('virtual_push_xml_invalid')
  return xmlBlock(xml,'xml')
}
export const virtualPushEvent=(xml:string)=>xmlTag(rootXml(xml),'Event')

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

export function verifyVirtualServerSignature(input: {
  token: string; timestamp: string; nonce: string; signature: string
}): boolean {
  if (!/^\d{1,16}$/.test(input.timestamp) || !/^[\w-]{1,128}$/.test(input.nonce) ||
      !/^[a-fA-F0-9]{40}$/.test(input.signature)) return false
  const expected = createHash('sha1').update(
    [input.token, input.timestamp, input.nonce].sort().join(''),
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
  const root=rootXml(xml)
  if (xmlTag(root, 'Event') !== 'xpay_goods_deliver_notify')
    throw new Error('virtual_push_event_unsupported')
  const outTradeNo = xmlTag(root, 'OutTradeNo')
  const openId = xmlTag(root, 'OpenId')
  const env=Number(xmlTag(root,'Env'))
  const goods=xmlBlock(root,'GoodsInfo')
  const pay=optionalXmlBlock(root,'WeChatPayInfo')
  const productId = xmlTag(goods, 'ProductId')
  const quantity = xmlTag(goods, 'Quantity')
  const price=optionalXmlTag(goods,'ActualPrice')
  const wxOrderId=pay===null?null:optionalXmlTag(pay,'MchOrderNo')
  const transactionId=pay===null?null:optionalXmlTag(pay,'TransactionId')
  if (!/^JCV[A-Z0-9]{8,29}$/.test(outTradeNo) || !/^[A-Za-z0-9_-]{1,128}$/.test(openId) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(productId) || quantity !== '1' ||
      ![0,1].includes(env) || (price!==null && !/^\d{1,9}$/.test(price)))
    throw new Error('virtual_push_goods_invalid')
  return { outTradeNo, openId, productId, env, actualPriceFen:price===null?null:Number(price),
    platformOrderId:wxOrderId||transactionId||null }
}

export type VirtualRefundPush={event:'refund';outTradeNo:string;openId:string;
  refundId:string;refundFeeFen:number;retCode:number;env:number;wxOrderId:string|null}
export type VirtualComplaintPush={event:'complaint';outTradeNo:string|null;
  requestId:string;openId:string}
export function parseVirtualAncillaryPush(xml:string):VirtualRefundPush|VirtualComplaintPush {
  const root=rootXml(xml)
  const event=xmlTag(root,'Event')
  if(event==='xpay_refund_notify') {
    const outTradeNo=xmlTag(root,'MchOrderId')
    const refundId=xmlTag(root,'MchRefundId')
    const openId=xmlTag(root,'OpenId')
    const refundFee=xmlTag(root,'RefundFee')
    const retCode=xmlTag(root,'RetCode')
    const env=xmlTag(root,'Env')
    const wxOrderId=optionalXmlTag(root,'WxOrderId')
    if(!/^JCV[A-Z0-9]{8,29}$/.test(outTradeNo) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(openId) ||
      !/^[A-Za-z0-9_-]{8,96}$/.test(refundId) ||
      !/^\d{1,9}$/.test(refundFee) || !/^-?\d{1,9}$/.test(retCode) ||
      (wxOrderId!==null && !/^[A-Za-z0-9_-]{1,64}$/.test(wxOrderId)) ||
      !['0','1'].includes(env)) throw new Error('virtual_refund_push_invalid')
    return {event:'refund',outTradeNo,openId,refundId,
      refundFeeFen:Number(refundFee),retCode:Number(retCode),env:Number(env),wxOrderId}
  }
  if(event==='xpay_complaint_notify') {
    const requestId=xmlTag(root,'RequestId')
    const openId=xmlTag(root,'OpenId')
    const outTradeNo=optionalXmlTag(root,'MchOrderId')
    if(!/^[A-Za-z0-9_-]{1,96}$/.test(requestId) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(openId) ||
      (outTradeNo!==null && !/^JCV[A-Z0-9]{8,29}$/.test(outTradeNo)))
      throw new Error('virtual_complaint_push_invalid')
    return {event:'complaint',outTradeNo,openId,requestId}
  }
  throw new Error('virtual_push_event_unsupported')
}

export function encryptedVirtualPushBody(xml: string): string {
  if (xml.length > 16_384) throw new Error('virtual_push_body_too_large')
  const encrypted = xmlTag(xml, 'Encrypt')
  if (!/^[A-Za-z0-9+/=]{24,16384}$/.test(encrypted))
    throw new Error('virtual_push_ciphertext_invalid')
  return encrypted
}
