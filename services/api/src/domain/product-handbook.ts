import { z } from 'zod'

const sourcedSchema = z
  .object({
    source_page: z.number().int().positive().optional(),
    source_pages: z.array(z.number().int().positive()).min(1).optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.source_page === undefined && !value.source_pages?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'source_page or source_pages is required',
      })
    }
  })

const displayValueSchema = z.object({
  amount: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  display: z.string().min(1),
}).passthrough()

const servicePeriodSchema = z.object({
  duration_months: z.number().nullable().optional(),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  display: z.string().min(1),
}).passthrough()

const educationItemSchema = z.object({
  institution: z.string().min(1),
  degree: z.string().min(1).nullable().optional(),
  discipline: z.string().min(1).nullable().optional(),
}).passthrough()

const teacherSchema = z.object({
  display_name: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  education_raw: z.string().min(1).nullable().optional(),
  education_items: z.array(educationItemSchema).default([]),
  offers_claimed: z.array(z.string().min(1)).default([]),
  source_page: z.number().int().positive(),
  source_date: z.string().nullable(),
  verification_status: z.enum(['verified', 'unverified', 'source_only']),
}).passthrough().superRefine((value, ctx) => {
  if (!value.display_name && !value.name) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'teacher requires display_name or name',
    })
  }

  if (value.education_items.length > 0 && !value.education_raw) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'structured teacher education requires education_raw',
      path: ['education_raw'],
    })
  }
})

const marketingClaimSchema = z.object({
  claim_id: z.string().min(1),
  claim_type: z.string().min(1),
  source_text: z.string().min(1),
  source_page: z.number().int().positive(),
  verification_status: z.enum(['verified', 'unverified', 'source_only']),
  display_allowed: z.boolean(),
}).passthrough().superRefine((value, ctx) => {
  if (value.verification_status !== 'verified' && value.display_allowed) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'unverified marketing claim must not be display_allowed',
      path: ['display_allowed'],
    })
  }
})

export const productHandbookV1Schema = z.object({
  document: z.object({
    document_id: z.string().min(1),
    title: z.string().min(1),
    document_type: z.literal('product_handbook'),
    source_file: z.string().min(1),
    source_page_count: z.number().int().positive(),
    source_date: z.string().nullable().optional(),
    source_date_basis: z.string().nullable().optional(),
    conversion_version: z.string().min(1),
    language: z.literal('zh-CN'),
    dataset_scope: z.literal('jiuchen_product_knowledge'),
    case_dataset_separated: z.boolean().optional(),
  }).passthrough(),
  brand: z.object({
    name: z.string().min(1),
  }).passthrough(),
  product: z.object({
    name: z.string().min(1),
    price: displayValueSchema.nullable().optional(),
    service_period: servicePeriodSchema.nullable().optional(),
  }).passthrough(),
  audience: z.array(sourcedSchema),
  highlights: z.array(sourcedSchema),
  timeline: z.array(z.object({
    order: z.number().int().positive(),
    stage: z.string().min(1),
    time_range: z.string().nullable().optional(),
    tasks: z.array(z.string().min(1)),
    source_page: z.number().int().positive(),
  }).passthrough()),
  modules: z.array(sourcedSchema),
  core_services: z.array(sourcedSchema),
  teachers: z.array(teacherSchema),
  marketing_claims: z.array(marketingClaimSchema),
  contact: z.object({
    source_page: z.number().int().positive(),
    include_in_product_body: z.boolean().optional(),
  }).passthrough(),
  visual_blocks: z.array(sourcedSchema),
}).passthrough().superRefine((value, ctx) => {
  const maxPage = value.document.source_page_count

  const pages: Array<{ page: number; path: (string | number)[] }> = []

  for (const [key, rows] of [
    ['audience', value.audience],
    ['highlights', value.highlights],
    ['timeline', value.timeline],
    ['modules', value.modules],
    ['core_services', value.core_services],
    ['teachers', value.teachers],
    ['marketing_claims', value.marketing_claims],
    ['visual_blocks', value.visual_blocks],
  ] as const) {
    rows.forEach((row, index) => {
      if ('source_page' in row && typeof row.source_page === 'number') {
        pages.push({
          page: row.source_page,
          path: [key, index, 'source_page'],
        })
      }

      if ('source_pages' in row && Array.isArray(row.source_pages)) {
        row.source_pages.forEach((page, pageIndex) => {
          if (typeof page === 'number') {
            pages.push({
              page,
              path: [key, index, 'source_pages', pageIndex],
            })
          }
        })
      }
    })
  }

  pages.push({
    page: value.contact.source_page,
    path: ['contact', 'source_page'],
  })

  for (const item of pages) {
    if (item.page > maxPage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `source_page ${item.page} exceeds source_page_count ${maxPage}`,
        path: item.path,
      })
    }
  }
})

export type ProductHandbookV1 = z.infer<typeof productHandbookV1Schema>
