import { gunzipSync } from 'node:zlib'
import { normalizeConvertedProductManual } from './normalize-converted-product.js'
import part1 from './bundled-product-yuesheng.part1.js'
import part2 from './bundled-product-yuesheng.part2.js'
import part3 from './bundled-product-yuesheng.part3.js'
import part4 from './bundled-product-yuesheng.part4.js'

const compressed = part1 + part2 + part3 + part4

const decoded = JSON.parse(
  gunzipSync(Buffer.from(compressed, 'base64')).toString('utf8'),
) as unknown

export default normalizeConvertedProductManual(decoded)
