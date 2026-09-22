import assert from 'node:assert/strict'
import test from 'node:test'
import { productHandbookV1Schema } from './product-handbook.js'

function validHandbook() {
  return {
    document: {
      document_id: 'sample',
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
      price: {
        amount: 13800,
        currency: 'CNY',
        display: '13800元',
      },
      service_period: {
        duration_months: 14,
        from: '大三9月',
        to: '大四10月',
        display: '14个月（大三9月至大四10月）',
      },
    },
    audience: [{ text: '大三本科学生', source_page: 4 }],
    highlights: [{ title: '重信息', source_page: 4 }],
    timeline: [{
      order: 1,
      stage: '大三上',
      time_range: '大三上',
      tasks: ['背景盘点'],
      source_page: 5,
    }],
    modules: [{ name: '定位规划', source_page: 6 }],
    core_services: [{ name: '实时信息汇总服务', source_page: 7 }],
    teachers: [{
      display_name: '李老师',
      education_raw: '中南大学本科浙江大学硕士工科类',
      education_items: [],
      offers_claimed: [],
      source_page: 9,
      source_date: '2026-09-11',
      verification_status: 'source_only',
    }],
    marketing_claims: [{
      claim_id: 'claim-rate',
      claim_type: 'marketing_performance',
      source_text: '整体录取率达96%',
      source_page: 2,
      verification_status: 'unverified',
      display_allowed: false,
    }],
    contact: {
      source_page: 10,
      include_in_product_body: false,
    },
    visual_blocks: [],
  }
}

test('accepts a handbook with provenance and display text', () => {
  const result = productHandbookV1Schema.safeParse(validHandbook())
  assert.equal(result.success, true)
})

test('rejects unverified marketing claims marked displayable', () => {
  const input = validHandbook()
  input.marketing_claims[0].display_allowed = true

  const result = productHandbookV1Schema.safeParse(input)
  assert.equal(result.success, false)
})

test('rejects source pages outside the original PDF page count', () => {
  const input = validHandbook()
  input.timeline[0].source_page = 11

  const result = productHandbookV1Schema.safeParse(input)
  assert.equal(result.success, false)
})

test('requires raw teacher education when structured education is supplied', () => {
  const input = validHandbook()
  input.teachers[0].education_raw = ''
  input.teachers[0].education_items = [
    { institution: '中南大学', degree: '本科', discipline: '工科类' },
  ]

  const result = productHandbookV1Schema.safeParse(input)
  assert.equal(result.success, false)
})
