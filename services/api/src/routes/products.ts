import { asc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import { productKnowledgeDocuments } from '../db/schema.js'
import { productHandbookV1Schema, type ProductHandbookV1 } from '../domain/product-handbook.js'
import { buildPublicProductContent } from '../domain/product-knowledge.js'
import {
  BUNDLED_PRODUCT_HANDBOOKS,
  findBundledProduct,
} from '../data/bundled-products.js'

type ProductSource = 'bundled' | 'database'

const BUNDLED_COVER_ASSETS = new Map<string, string>([
  [
    'jiuchen-dasan-chongding-product-manual-2026-sample-v1',
    '/assets/products/chongding/cover-mountain-main-visual.webp',
  ],
  [
    'jiuchen-baoyan-navigation-card-product-manual-2026-v1',
    '/assets/products/navigation-card/cover-main-visual.webp',
  ],
])

function applyRuntimeAssets(
  handbook: ProductHandbookV1,
  source: ProductSource,
) {
  const publicContent = buildPublicProductContent(handbook)

  if (source !== 'bundled') return publicContent

  const coverAsset = BUNDLED_COVER_ASSETS.get(handbook.document.document_id)
  if (!coverAsset) return publicContent

  return {
    ...publicContent,
    product: {
      ...publicContent.product,
      cover_asset: coverAsset,
    },
  }
}

function isMissingTable(error: unknown) {
  return (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    String((error as { code?: unknown }).code ?? '') === 'ER_NO_SUCH_TABLE'
  )
}

function serializeProductSummary(
  handbook: ProductHandbookV1,
  source: ProductSource,
) {
  const publicContent = applyRuntimeAssets(handbook, source)

  return {
    documentKey: handbook.document.document_id,
    title: handbook.document.title,
    productName: handbook.product.name,
    sourceDate: handbook.document.source_date ?? null,
    conversionVersion: handbook.document.conversion_version,
    source,
    product: publicContent.product,
    highlights: publicContent.highlights,
  }
}

function serializeProductDetail(
  handbook: ProductHandbookV1,
  source: ProductSource,
) {
  return {
    ok: true as const,
    documentKey: handbook.document.document_id,
    title: handbook.document.title,
    sourceDate: handbook.document.source_date ?? null,
    conversionVersion: handbook.document.conversion_version,
    source,
    content: applyRuntimeAssets(handbook, source),
  }
}

function bundledProductMap() {
  return new Map(
    BUNDLED_PRODUCT_HANDBOOKS.map((handbook) => [
      handbook.document.document_id,
      serializeProductSummary(handbook, 'bundled'),
    ]),
  )
}

export function registerProductRoutes(
  app: FastifyInstance,
  database: DatabaseContext,
) {
  app.get('/products', async () => {
    const products = bundledProductMap()

    if (database.configured) {
      try {
        const rows = await database.db
          .select({
            documentKey: productKnowledgeDocuments.documentKey,
            status: productKnowledgeDocuments.status,
            contentJson: productKnowledgeDocuments.contentJson,
          })
          .from(productKnowledgeDocuments)
          .orderBy(asc(productKnowledgeDocuments.productName))
          .limit(100)

        for (const row of rows) {
          if (row.status !== 'active') {
            products.delete(row.documentKey)
            continue
          }

          const parsed = productHandbookV1Schema.safeParse(row.contentJson)
          if (!parsed.success) {
            products.delete(row.documentKey)
            app.log.warn(
              {
                documentKey: row.documentKey,
                issues: parsed.error.issues,
              },
              'Skipping invalid active product handbook',
            )
            continue
          }

          products.set(
            row.documentKey,
            serializeProductSummary(parsed.data, 'database'),
          )
        }
      } catch (error) {
        if (!isMissingTable(error)) {
          throw error
        }

        app.log.info(
          'Product knowledge tables are not ready; serving bundled baseline catalog',
        )
      }
    }

    return {
      ok: true,
      products: [...products.values()].sort((a, b) =>
        a.productName.localeCompare(b.productName, 'zh-CN'),
      ),
    }
  })

  app.get<{ Params: { documentKey: string } }>(
    '/products/:documentKey',
    async (request, reply) => {
      if (database.configured) {
        try {
          const [row] = await database.db
            .select({
              status: productKnowledgeDocuments.status,
              contentJson: productKnowledgeDocuments.contentJson,
            })
            .from(productKnowledgeDocuments)
            .where(
              eq(
                productKnowledgeDocuments.documentKey,
                request.params.documentKey,
              ),
            )
            .limit(1)

          if (row) {
            if (row.status !== 'active') {
              return reply.code(404).send({
                ok: false,
                error: 'product_not_found',
              })
            }

            const parsed = productHandbookV1Schema.safeParse(row.contentJson)
            if (!parsed.success) {
              app.log.error(
                {
                  documentKey: request.params.documentKey,
                  issues: parsed.error.issues,
                },
                'Active product handbook failed schema validation',
              )
              return reply.code(503).send({
                ok: false,
                error: 'product_content_invalid',
              })
            }

            return serializeProductDetail(parsed.data, 'database')
          }
        } catch (error) {
          if (!isMissingTable(error)) {
            throw error
          }

          app.log.info(
            'Product knowledge tables are not ready; using bundled product detail',
          )
        }
      }

      const bundled = findBundledProduct(request.params.documentKey)
      if (!bundled) {
        return reply.code(404).send({
          ok: false,
          error: 'product_not_found',
        })
      }

      return serializeProductDetail(bundled, 'bundled')
    },
  )
}
