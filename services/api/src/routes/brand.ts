import type { FastifyInstance } from 'fastify'
import { BUNDLED_BRAND_PUBLIC } from '../data/bundled-brand-public.js'

function publicBrandContent() {
  return {
    document: BUNDLED_BRAND_PUBLIC.document,
    brand: BUNDLED_BRAND_PUBLIC.brand,
    product: BUNDLED_BRAND_PUBLIC.product,
    audience: BUNDLED_BRAND_PUBLIC.audience,
    highlights: BUNDLED_BRAND_PUBLIC.highlights,
    timeline: BUNDLED_BRAND_PUBLIC.timeline,
    core_services: BUNDLED_BRAND_PUBLIC.core_services,
    teacher_summary: BUNDLED_BRAND_PUBLIC.teacher_summary,
    office_achievements: BUNDLED_BRAND_PUBLIC.office_achievements.filter(
      (item) => item.verification_status === 'verified',
    ),
    marketing_claims: BUNDLED_BRAND_PUBLIC.marketing_claims.filter(
      (item) =>
        item.verification_status === 'verified' &&
        item.display_allowed === true,
    ),
  }
}

export function registerBrandRoutes(app: FastifyInstance) {
  app.get('/brand', async () => ({
    ok: true,
    content: publicBrandContent(),
  }))
}
