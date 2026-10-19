import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import 'dotenv/config'
import { loadEnv } from '../config/env.js'
import { createDatabaseContext } from '../db/client.js'
import {
  productKnowledgeChunks,
  productKnowledgeDocuments,
} from '../db/schema.js'
import { productHandbookV1Schema } from '../domain/product-handbook.js'
import { buildProductKnowledgeChunks } from '../domain/product-knowledge.js'

const target = process.argv[2]

if (!target) {
  console.error(
    'Usage: npm run data:import:product-handbook -- <path-to-content.json>',
  )
  process.exit(2)
}

const env = loadEnv(process.env)
const database = createDatabaseContext(env)

if (!database.configured) {
  throw new Error('Database is not configured')
}

const fullPath = path.resolve(process.cwd(), target)
const raw = await fs.readFile(fullPath, 'utf8')
const payload = JSON.parse(raw)
const parsed = productHandbookV1Schema.parse(payload)
const chunks = buildProductKnowledgeChunks(parsed)

try {
  const [existing] = await database.db
    .select({
      id: productKnowledgeDocuments.id,
      status: productKnowledgeDocuments.status,
    })
    .from(productKnowledgeDocuments)
    .where(
      eq(
        productKnowledgeDocuments.documentKey,
        parsed.document.document_id,
      ),
    )
    .limit(1)

  const documentId = existing?.id ?? randomUUID()

  await database.db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(productKnowledgeDocuments)
        .set({
          title: parsed.document.title,
          productName: parsed.product.name,
          sourceFile: parsed.document.source_file,
          sourceDate: parsed.document.source_date ?? null,
          conversionVersion: parsed.document.conversion_version,
          contentJson: parsed,
        })
        .where(eq(productKnowledgeDocuments.id, documentId))

      await tx
        .delete(productKnowledgeChunks)
        .where(eq(productKnowledgeChunks.documentId, documentId))
    } else {
      await tx.insert(productKnowledgeDocuments).values({
        id: documentId,
        documentKey: parsed.document.document_id,
        title: parsed.document.title,
        productName: parsed.product.name,
        sourceFile: parsed.document.source_file,
        sourceDate: parsed.document.source_date ?? null,
        conversionVersion: parsed.document.conversion_version,
        status: 'draft',
        contentJson: parsed,
      })
    }

    if (chunks.length > 0) {
      await tx.insert(productKnowledgeChunks).values(
        chunks.map((chunk) => ({
          id: randomUUID(),
          documentId,
          chunkKey: chunk.chunkKey,
          kind: chunk.kind,
          title: chunk.title,
          text: chunk.text,
          sourcePage: chunk.sourcePage,
          retrievalAllowed: chunk.retrievalAllowed,
          assessmentEvidenceAllowed: chunk.assessmentEvidenceAllowed,
          displayAllowed: chunk.displayAllowed,
          metadataJson: chunk.metadata,
        })),
      )
    }
  })

  console.log(
    existing
      ? `✓ product handbook updated: ${parsed.document.document_id}`
      : `✓ product handbook imported as draft: ${parsed.document.document_id}`,
  )
  console.log(`✓ product: ${parsed.product.name}`)
  console.log(`✓ chunks: ${chunks.length}`)
  console.log(
    `✓ retrievable chunks: ${chunks.filter((chunk) => chunk.retrievalAllowed).length}`,
  )
  console.log(
    `✓ admission-evidence chunks: ${chunks.filter((chunk) => chunk.assessmentEvidenceAllowed).length}`,
  )
  console.log(
    `✓ status preserved: ${existing?.status ?? 'draft'} (import never auto-publishes)`,
  )
} finally {
  await database.pool.end()
}
