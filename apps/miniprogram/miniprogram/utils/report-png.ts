/** Streaming true-color PNG: one small canvas strip at a time, no full-image RGBA buffer.
 * Transparent canvas pixels are composited over white before encoding.
 * Stored DEFLATE blocks deliberately avoid a new npm/native image dependency.
 */
function u32(value: number) {
  return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255])
}
function join(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  parts.forEach(p => { result.set(p, offset); offset += p.length })
  return result
}
function chunk(type: string, data: Uint8Array) {
  const body = join([new Uint8Array([...type].map(c => c.charCodeAt(0))), data])
  let crc = 0xffffffff
  for (const byte of body) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return join([u32(data.length), body, u32((crc ^ 0xffffffff) >>> 0)])
}
export class ReportPngEncoder {
  private rows = 0
  private a = 1
  private b = 0
  constructor(readonly width: number, readonly height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 15000000) {
      throw new Error('报告超出单张长图资源预算，请使用文本报告联系老师')
    }
  }
  header() {
    return join([
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', join([u32(this.width), u32(this.height), new Uint8Array([8, 2, 0, 0, 0])])),
      chunk('IDAT', new Uint8Array([0x78, 0x01])),
    ])
  }
  strip(rgba: Uint8ClampedArray, height: number) {
    if (height < 1 || this.rows + height > this.height || rgba.length !== this.width * height * 4) throw new Error('画布分段数据不完整')
    const stride = this.width * 3 + 1
    const raw = new Uint8Array(stride * height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = (y * this.width + x) * 4
        const alpha = rgba[i + 3] / 255
        // Some real devices return transparent pixels around a freshly resized
        // legacy canvas. Composite against the report's white background so
        // those pixels can never become opaque black in the streamed PNG.
        const output = y * stride + x * 3 + 1
        for (let channel = 0; channel < 3; channel++) {
          raw[output + channel] = Math.round(rgba[i + channel] * alpha + 255 * (1 - alpha))
        }
      }
    }
    for (const value of raw) { this.a = (this.a + value) % 65521; this.b = (this.b + this.a) % 65521 }
    const blocks: Uint8Array[] = []
    for (let offset = 0; offset < raw.length; offset += 65535) {
      const part = raw.subarray(offset, offset + 65535), n = part.length
      blocks.push(new Uint8Array([0, n & 255, n >>> 8, (~n) & 255, ((~n) >>> 8) & 255]), part)
    }
    this.rows += height
    return chunk('IDAT', join(blocks))
  }
  finish() {
    if (this.rows !== this.height) throw new Error('长图尚未完整写入')
    return join([chunk('IDAT', join([new Uint8Array([1, 0, 0, 255, 255]), u32((this.b * 65536 + this.a) >>> 0)])), chunk('IEND', new Uint8Array())])
  }
}
