import { gunzipSync } from 'node:zlib'
import { productHandbookV1Schema, type ProductHandbookV1 } from '../domain/product-handbook.js'
import part1 from './bundled-products.part1.js'
import part2 from './bundled-products.part2.js'
import part3 from './bundled-products.part3.js'
import part4 from './bundled-products.part4.js'

const compressedCatalog = [part1, part2, part3, part4].join('')

const decoded = JSON.parse(
  gunzipSync(Buffer.from(compressedCatalog, 'base64')).toString('utf8'),
) as unknown

if (!Array.isArray(decoded)) {
  throw new Error('bundled_product_catalog_invalid')
}

export const BUNDLED_PRODUCT_HANDBOOKS: ProductHandbookV1[] = decoded.map(
  (entry) => productHandbookV1Schema.parse(entry),
)

export function findBundledProduct(documentKey: string) {
  return BUNDLED_PRODUCT_HANDBOOKS.find(
    (item) => item.document.document_id === documentKey,
  )
}
