import type { ProductHandbookV1 } from './product-handbook.js'

export type ProductKnowledgeChunkKind =
  | 'product'
  | 'audience'
  | 'highlight'
  | 'timeline'
  | 'module'
  | 'core_service'
  | 'teacher'
  | 'marketing_claim'
  | 'contact'
  | 'other'

export type ProductKnowledgeChunkDraft = {
  chunkKey: string
  kind: ProductKnowledgeChunkKind
  title: string
  text: string
  sourcePage: number | null
  retrievalAllowed: boolean
  assessmentEvidenceAllowed: boolean
  displayAllowed: boolean
  metadata: Record<string, unknown> | null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => asString(item))
        .filter((item): item is string => Boolean(item))
    : []
}

function joinParts(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part)).join('；')
}

function displayText(value: unknown) {
  return asString(asRecord(value).display)
}

function sourcePage(value: unknown) {
  const page = asRecord(value).source_page
  return typeof page === 'number' && Number.isInteger(page) && page > 0
    ? page
    : null
}

export function buildProductKnowledgeChunks(
  handbook: ProductHandbookV1,
): ProductKnowledgeChunkDraft[] {
  const documentKey = handbook.document.document_id
  const chunks: ProductKnowledgeChunkDraft[] = []

  const push = (
    kind: ProductKnowledgeChunkKind,
    index: number,
    input: Omit<ProductKnowledgeChunkDraft, 'chunkKey' | 'kind'>,
  ) => {
    chunks.push({
      ...input,
      kind,
      chunkKey: `${documentKey}:${kind}:${String(index + 1).padStart(3, '0')}`,
    })
  }

  const product = asRecord(handbook.product)
  push('product', 0, {
    title: handbook.product.name,
    text: joinParts([
      asString(product.short_name),
      asString(product.positioning),
      displayText(product.price),
      displayText(product.service_period),
      typeof product.one_to_one_hours === 'number'
        ? `一对一课时：${product.one_to_one_hours}`
        : null,
    ]) || handbook.product.name,
    sourcePage: Array.isArray(product.source_pages)
      ? (product.source_pages.find(
          (page) => typeof page === 'number' && Number.isInteger(page),
        ) as number | undefined) ?? null
      : null,
    retrievalAllowed: true,
    assessmentEvidenceAllowed: false,
    displayAllowed: true,
    metadata: product,
  })

  handbook.audience.forEach((item, index) => {
    const record = asRecord(item)
    const text = asString(record.text) ?? JSON.stringify(record)
    push('audience', index, {
      title: `适用人群 ${index + 1}`,
      text,
      sourcePage: sourcePage(record),
      retrievalAllowed: true,
      assessmentEvidenceAllowed: false,
      displayAllowed: true,
      metadata: record,
    })
  })

  handbook.highlights.forEach((item, index) => {
    const record = asRecord(item)
    push('highlight', index, {
      title: asString(record.title) ?? `产品亮点 ${index + 1}`,
      text:
        joinParts([
          asString(record.title),
          asString(record.description),
        ]) || JSON.stringify(record),
      sourcePage: sourcePage(record),
      retrievalAllowed: true,
      assessmentEvidenceAllowed: false,
      displayAllowed: true,
      metadata: record,
    })
  })

  handbook.timeline.forEach((item, index) => {
    const record = asRecord(item)
    const tasks = asStringArray(record.tasks)
    push('timeline', index, {
      title: joinParts([
        asString(record.stage),
        asString(record.time_range),
      ]) || `服务阶段 ${index + 1}`,
      text:
        joinParts([
          asString(record.stage),
          asString(record.time_range),
          tasks.length ? `任务：${tasks.join('、')}` : null,
        ]) || JSON.stringify(record),
      sourcePage: sourcePage(record),
      retrievalAllowed: true,
      assessmentEvidenceAllowed: false,
      displayAllowed: true,
      metadata: record,
    })
  })

  handbook.modules.forEach((item, index) => {
    const record = asRecord(item)
    push('module', index, {
      title: asString(record.name) ?? `辅导模块 ${index + 1}`,
      text:
        joinParts([
          asString(record.name),
          asString(record.summary),
          ...asStringArray(record.details),
          asString(record.teacher_requirement),
        ]) || JSON.stringify(record),
      sourcePage: sourcePage(record),
      retrievalAllowed: true,
      assessmentEvidenceAllowed: false,
      displayAllowed: true,
      metadata: record,
    })
  })

  handbook.core_services.forEach((item, index) => {
    const record = asRecord(item)
    push('core_service', index, {
      title: asString(record.name) ?? `核心服务 ${index + 1}`,
      text:
        joinParts([
          asString(record.name),
          asString(record.summary),
          ...asStringArray(record.bullets),
        ]) || JSON.stringify(record),
      sourcePage: sourcePage(record),
      retrievalAllowed: true,
      assessmentEvidenceAllowed: false,
      displayAllowed: true,
      metadata: record,
    })
  })

  handbook.teachers.forEach((item, index) => {
    const record = asRecord(item)
    push('teacher', index, {
      title:
        asString(record.display_name) ??
        asString(record.name) ??
        `师资 ${index + 1}`,
      text:
        joinParts([
          asString(record.display_name) ?? asString(record.name),
          asString(record.education_raw) ?? asString(record.education),
          ...asStringArray(record.offers_claimed),
          ...asStringArray(record.specialties),
        ]) || JSON.stringify(record),
      sourcePage: sourcePage(record),
      retrievalAllowed: true,
      assessmentEvidenceAllowed: false,
      displayAllowed: true,
      metadata: record,
    })
  })

  handbook.marketing_claims.forEach((item, index) => {
    const record = asRecord(item)
    const verified = record.verification_status === 'verified'
    const allowed = record.display_allowed === true && verified

    push('marketing_claim', index, {
      title: `宣传声明 ${index + 1}`,
      text:
        asString(record.source_text) ??
        asString(record.claim) ??
        JSON.stringify(record),
      sourcePage: sourcePage(record),
      retrievalAllowed: allowed,
      assessmentEvidenceAllowed: false,
      displayAllowed: allowed,
      metadata: record,
    })
  })

  const contact = asRecord(handbook.contact)
  push('contact', 0, {
    title: '联系信息',
    text: JSON.stringify(contact),
    sourcePage: sourcePage(contact),
    retrievalAllowed: false,
    assessmentEvidenceAllowed: false,
    displayAllowed: contact.include_in_product_body === true,
    metadata: contact,
  })

  return chunks
}

export function buildPublicProductContent(handbook: ProductHandbookV1) {
  return {
    document: handbook.document,
    brand: handbook.brand,
    product: handbook.product,
    audience: handbook.audience,
    highlights: handbook.highlights,
    timeline: handbook.timeline,
    modules: handbook.modules,
    core_services: handbook.core_services,
    teachers: handbook.teachers,
    marketing_claims: handbook.marketing_claims.filter((claim) => {
      const record = asRecord(claim)
      return (
        record.verification_status === 'verified' &&
        record.display_allowed === true
      )
    }),
    contact:
      asRecord(handbook.contact).include_in_product_body === true
        ? handbook.contact
        : null,
    visual_blocks: handbook.visual_blocks,
  }
}
