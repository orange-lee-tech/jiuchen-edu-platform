import assert from 'node:assert/strict'
import test from 'node:test'
import { productHandbookV1Schema } from './product-handbook.js'
import {
  buildProductKnowledgeChunks,
  buildPublicProductContent,
} from './product-knowledge.js'

function handbook() {
  return productHandbookV1Schema.parse({
    document: {
      document_id: 'sample-product',
      title: 'Sample',
      document_type: 'product_handbook',
      source_file: 'sample.pdf',
      source_page_count: 10,
      conversion_version: 'handbook-v1',
      language: 'zh-CN',
      dataset_scope: 'jiuchen_product_knowledge',
      case_dataset_separated: true,
    },
    brand: { name: '九辰教育' },
    product: {
      name: '大三冲顶计划',
      short_name: '冲顶计划',
      price: {
        amount: 13800,
        currency: 'CNY',
        display: '13800元',
      },
      service_period: {
        duration_months: 14,
        from: '大三9月',
        to: '大四10月',
        display: '14个月',
      },
      positioning: '大三冲刺',
      source_pages: [1, 4, 9],
    },
    audience: [{ text: '大三本科学生', source_page: 4 }],
    highlights: [
      {
        title: '重信息',
        description: '汇总关键信息',
        source_page: 4,
      },
    ],
    timeline: [
      {
        order: 1,
        stage: '大三上',
        time_range: '9-12月',
        tasks: ['背景盘点', '目标梳理'],
        source_page: 5,
      },
    ],
    modules: [
      {
        name: '定位规划',
        summary: '盘点背景',
        details: ['形成定位方案'],
        source_page: 6,
      },
    ],
    core_services: [
      {
        name: '信息汇总',
        summary: '持续更新',
        bullets: ['院校信息'],
        source_page: 7,
      },
    ],
    teachers: [
      {
        display_name: '李老师',
        education_raw: '中南大学本科',
        education_items: [],
        offers_claimed: ['清华大学'],
        source_page: 9,
        source_date: '2026-09',
        verification_status: 'source_only',
      },
    ],
    marketing_claims: [
      {
        claim_id: 'claim-unverified',
        claim_type: 'marketing_performance',
        source_text: '整体录取率达96%',
        source_page: 2,
        verification_status: 'unverified',
        display_allowed: false,
      },
      {
        claim_id: 'claim-verified',
        claim_type: 'marketing_performance',
        source_text: '经审核声明',
        source_page: 2,
        verification_status: 'verified',
        display_allowed: true,
      },
    ],
    contact: {
      source_page: 10,
      include_in_product_body: false,
    },
    visual_blocks: [],
  })
}

test('builds deterministic chunks and keeps product knowledge out of admission evidence', () => {
  const chunks = buildProductKnowledgeChunks(handbook())

  assert.equal(chunks[0].chunkKey, 'sample-product:product:001')
  assert.ok(chunks.length > 1)
  assert.equal(
    chunks.every((chunk) => chunk.assessmentEvidenceAllowed === false),
    true,
  )
})

test('keeps unverified marketing claims out of retrieval and display', () => {
  const chunks = buildProductKnowledgeChunks(handbook())
  const claims = chunks.filter((chunk) => chunk.kind === 'marketing_claim')

  assert.equal(claims.length, 2)
  assert.equal(claims[0].retrievalAllowed, false)
  assert.equal(claims[0].displayAllowed, false)
  assert.equal(claims[1].retrievalAllowed, true)
  assert.equal(claims[1].displayAllowed, true)
})

test('public product content removes unverified claims and hidden contact info', () => {
  const content = buildPublicProductContent(handbook())

  assert.equal(content.marketing_claims.length, 1)
  assert.equal(content.contact, null)
  assert.equal(content.product.name, '大三冲顶计划')
})


test('chunk builder preserves common handbook aliases without using them as admission evidence', () => {
  const payload = handbook() as unknown as {
    product: Record<string, unknown>
    highlights: Array<Record<string, unknown>>
    modules: Array<Record<string, unknown>>
    core_services: Array<Record<string, unknown>>
  }

  payload.product.positioning = undefined
  payload.product.positioning_statement = '聚焦大三保研关键冲刺周期'
  payload.highlights[0].description = undefined
  payload.highlights[0].text = '一站式汇总关键信息'
  payload.modules[0].summary = undefined
  payload.modules[0].details = undefined
  payload.modules[0].core_content = ['背景盘点', '目标方向梳理']
  payload.core_services[0].summary = undefined
  payload.core_services[0].bullets = undefined
  payload.core_services[0].description = '持续同步更新'
  payload.core_services[0].items = ['夏令营通知', '预推免通知']

  const chunks = buildProductKnowledgeChunks(
    payload as Parameters<typeof buildProductKnowledgeChunks>[0],
  )

  assert.match(
    chunks.find((chunk) => chunk.kind === 'product')?.text ?? '',
    /聚焦大三保研关键冲刺周期/,
  )
  assert.match(
    chunks.find((chunk) => chunk.kind === 'highlight')?.text ?? '',
    /一站式汇总关键信息/,
  )
  assert.match(
    chunks.find((chunk) => chunk.kind === 'module')?.text ?? '',
    /背景盘点.*目标方向梳理/,
  )
  assert.match(
    chunks.find((chunk) => chunk.kind === 'core_service')?.text ?? '',
    /持续同步更新.*夏令营通知.*预推免通知/,
  )
  assert.equal(
    chunks.every((chunk) => chunk.assessmentEvidenceAllowed === false),
    true,
  )
})
