import { asc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import { productKnowledgeDocuments } from '../db/schema.js'
import { productHandbookV1Schema } from '../domain/product-handbook.js'
import { buildPublicProductContent } from '../domain/product-knowledge.js'

function isMissingTable(error: unknown) {
  return (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    String((error as { code?: unknown }).code ?? '') === 'ER_NO_SUCH_TABLE'
  )
}

export function registerProductRoutes(
  app: FastifyInstance,
  database: DatabaseContext,
) {
  app.get('/products', async (_request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    try {
      const rows = await database.db
        .select({
          documentKey: productKnowledgeDocuments.documentKey,
          title: productKnowledgeDocuments.title,
          productName: productKnowledgeDocuments.productName,
          sourceDate: productKnowledgeDocuments.sourceDate,
          conversionVersion: productKnowledgeDocuments.conversionVersion,
          contentJson: productKnowledgeDocuments.contentJson,
        })
        .from(productKnowledgeDocuments)
        .where(eq(productKnowledgeDocuments.status, 'active'))
        .orderBy(asc(productKnowledgeDocuments.productName))
        .limit(100)

      const products = rows.flatMap((row) => {
        const parsed = productHandbookV1Schema.safeParse(row.contentJson)
        if (!parsed.success) {
          app.log.warn(
            {
              documentKey: row.documentKey,
              issues: parsed.error.issues,
            },
            'Skipping invalid active product handbook',
          )
          return []
        }

        const publicContent = buildPublicProductContent(parsed.data)

        return [{
          documentKey: row.documentKey,
          title: row.title,
          productName: row.productName,
          sourceDate: row.sourceDate,
          conversionVersion: row.conversionVersion,
          product: publicContent.product,
          highlights: publicContent.highlights,
        }]
      })

      return {
        ok: true,
        products,
      }
    } catch (error) {
      if (isMissingTable(error)) {
        return reply.code(503).send({
          ok: false,
          error: 'product_knowledge_schema_not_ready',
        })
      }
      throw error
    }
  })

  app.get<{ Params: { documentKey: string } }>(
    '/products/:documentKey',
    async (request, reply) => {
      if (!database.configured) {
        return reply.code(503).send({
          ok: false,
          error: 'database_not_configured',
        })
      }

      try {
        const [row] = await database.db
          .select({
            documentKey: productKnowledgeDocuments.documentKey,
            title: productKnowledgeDocuments.title,
            sourceDate: productKnowledgeDocuments.sourceDate,
            conversionVersion: productKnowledgeDocuments.conversionVersion,
            contentJson: productKnowledgeDocuments.contentJson,
          })
          .from(productKnowledgeDocuments)
          .where(eq(productKnowledgeDocuments.documentKey, request.params.documentKey))
          .limit(1)

        if (!row) {
          return reply.code(404).send({
            ok: false,
            error: 'product_not_found',
          })
        }

        const [active] = await database.db
          .select({ status: productKnowledgeDocuments.status })
          .from(productKnowledgeDocuments)
          .where(eq(productKnowledgeDocuments.documentKey, request.params.documentKey))
          .limit(1)

        if (!active || active.status !== 'active') {
          return reply.code(404).send({
            ok: false,
            error: 'product_not_found',
          })
        }

        const parsed = productHandbookV1Schema.safeParse(row.contentJson)
        if (!parsed.success) {
          app.log.error(
            {
              documentKey: row.documentKey,
              issues: parsed.error.issues,
            },
            'Active product handbook failed schema validation',
          )
          return reply.code(503).send({
            ok: false,
            error: 'product_content_invalid',
          })
        }

        return {
          ok: true,
          documentKey: row.documentKey,
          title: row.title,
          sourceDate: row.sourceDate,
          conversionVersion: row.conversionVersion,
          content: buildPublicProductContent(parsed.data),
        }
      } catch (error) {
        if (isMissingTable(error)) {
          return reply.code(503).send({
            ok: false,
            error: 'product_knowledge_schema_not_ready',
          })
        }
        throw error
      }
    },
  )
}
