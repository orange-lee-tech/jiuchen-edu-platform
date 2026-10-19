import fs from 'node:fs/promises'
import path from 'node:path'
import { productHandbookV1Schema } from '../domain/product-handbook.js'

const target = process.argv[2]

if (!target) {
  console.error(
    'Usage: npm run data:validate:product-handbook -- <path-to-content.json>',
  )
  process.exit(2)
}

const fullPath = path.resolve(process.cwd(), target)
const raw = await fs.readFile(fullPath, 'utf8')
const payload = JSON.parse(raw)

const result = productHandbookV1Schema.safeParse(payload)

if (!result.success) {
  console.error('✗ product handbook validation failed')

  for (const issue of result.error.issues) {
    console.error(`- ${issue.path.join('.') || '<root>'}: ${issue.message}`)
  }

  process.exit(1)
}

console.log('✓ product handbook content.json is valid')
console.log(`✓ document: ${result.data.document.document_id}`)
console.log(`✓ pages: ${result.data.document.source_page_count}`)
console.log(`✓ timeline stages: ${result.data.timeline.length}`)
console.log(`✓ core services: ${result.data.core_services.length}`)
console.log(`✓ teachers: ${result.data.teachers.length}`)
console.log(`✓ marketing claims: ${result.data.marketing_claims.length}`)
