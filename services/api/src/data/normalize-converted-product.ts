import { productHandbookV1Schema, type ProductHandbookV1 } from '../domain/product-handbook.js'

type AnyRecord = Record<string, unknown>

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AnyRecord)
    : {}
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item))
      .filter((item): item is string => Boolean(item))
  }
  const one = asString(value)
  return one ? [one] : []
}

function normalizeVerification(value: unknown) {
  return value === 'verified' || value === 'source_only'
    ? value
    : 'unverified'
}

function normalizeTeacher(
  value: unknown,
  sourceDate: string | null,
): AnyRecord {
  const row = asRecord(value)
  const name =
    asString(row.display_name) ??
    asString(row.name) ??
    asString(row.role) ??
    '师资信息'

  const fallbackEducation = [
    asString(row.institution),
    asString(row.school_or_department),
    asString(row.role),
  ]
    .filter(Boolean)
    .join(' · ')

  const educationRaw =
    asString(row.education_raw) ??
    asString(row.education) ??
    asString(row.qualification_claim) ??
    (fallbackEducation || null)

  return {
    ...row,
    display_name: asString(row.display_name) ?? name,
    name: asString(row.name) ?? name,
    education_raw: educationRaw,
    education_items: Array.isArray(row.education_items)
      ? row.education_items
      : [],
    offers_claimed: asStringArray(row.offers_claimed),
    source_date: asString(row.source_date) ?? sourceDate,
    verification_status: normalizeVerification(row.verification_status),
  }
}

function normalizeMarketingClaim(
  value: unknown,
  index: number,
): AnyRecord {
  const row = asRecord(value)
  const status = normalizeVerification(row.verification_status)
  const sourceText =
    asString(row.source_text) ??
    asString(row.claim) ??
    asString(row.text) ??
    `宣传声明 ${index + 1}`

  return {
    ...row,
    claim_id:
      asString(row.claim_id) ??
      `claim-${String(index + 1).padStart(3, '0')}`,
    claim_type:
      asString(row.claim_type) ??
      (row.metric ? 'marketing_performance' : 'marketing_claim'),
    source_text: sourceText,
    verification_status: status,
    display_allowed: status === 'verified' && row.display_allowed === true,
  }
}

function normalizeProduct(value: unknown): AnyRecord {
  const product = asRecord(value)
  const normalized: AnyRecord = { ...product }

  if (!product.price && typeof product.price_cny === 'number') {
    normalized.price = {
      amount: product.price_cny,
      currency: 'CNY',
      display: `${product.price_cny}元`,
    }
  }

  if (
    !product.service_period ||
    typeof product.service_period === 'string'
  ) {
    const display = asString(product.service_period)
    if (display) {
      normalized.service_period = { display }
    }
  }

  if (!product.tagline) {
    const taglines = [
      ...asStringArray(product.cover_highlights),
      ...asStringArray(product.cover_tagline),
    ]
    if (taglines.length) {
      normalized.tagline = taglines
    }
  }

  return normalized
}

export function normalizeConvertedProductManual(
  input: unknown,
): ProductHandbookV1 {
  const raw = asRecord(input)
  const document = asRecord(raw.document)
  const sourceDate = asString(document.source_date)

  const normalized = {
    ...raw,
    document: {
      ...document,
      document_type: 'product_handbook',
      conversion_version: 'handbook-v1',
      language: 'zh-CN',
      dataset_scope: 'jiuchen_product_knowledge',
      case_dataset_separated:
        document.case_dataset_separated === true,
    },
    brand: {
      ...asRecord(raw.brand),
      name: asString(asRecord(raw.brand).name) ?? '九辰教育',
    },
    product: normalizeProduct(raw.product),
    audience: Array.isArray(raw.audience) ? raw.audience : [],
    highlights: Array.isArray(raw.highlights) ? raw.highlights : [],
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
    modules: Array.isArray(raw.modules) ? raw.modules : [],
    core_services: Array.isArray(raw.core_services)
      ? raw.core_services
      : [],
    teachers: Array.isArray(raw.teachers)
      ? raw.teachers.map((item) =>
          normalizeTeacher(item, sourceDate),
        )
      : [],
    marketing_claims: Array.isArray(raw.marketing_claims)
      ? raw.marketing_claims.map(normalizeMarketingClaim)
      : [],
    contact: {
      source_page: 1,
      include_in_product_body: false,
      ...asRecord(raw.contact),
    },
    visual_blocks: Array.isArray(raw.visual_blocks)
      ? raw.visual_blocks
      : [],
  }

  return productHandbookV1Schema.parse(normalized)
}
