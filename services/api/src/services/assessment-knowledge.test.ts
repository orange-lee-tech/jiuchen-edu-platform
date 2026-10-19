import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  CaseKnowledgeSource,
  ProductKnowledgeSource,
} from './assessment-knowledge.js'

const input = {
  profile: {
    university: '示例理工大学',
    major: '计算机科学与技术',
    currentGrade: '大三',
    gpaText: '3.7/4.0',
    rankText: '10/120',
  },
  english: [],
  research: [],
  competitions: [],
  targets: [{ schoolName: '目标大学', programName: '计算机学院' }],
}

async function createFixture(rows: unknown[]) {
  const root = await mkdtemp(join(tmpdir(), 'jiuchen-assessment-'))
  const ragDirectory = join(root, 'ai', 'rag', 'v1.0.0')
  await mkdir(ragDirectory, { recursive: true })
  await writeFile(
    join(ragDirectory, 'rag_reference_eval_safe_train_dev.jsonl'),
    rows.map((row) => JSON.stringify(row)).join('\n') + '\n',
    'utf8',
  )
  return root
}

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    doc_id: `doc-${id}`,
    case_id: `case-${id}`,
    dataset_version: 'fixture-v1',
    split: 'train',
    title: `案例 ${id}`,
    content: '本科背景与申请结果均来自脱敏历史记录。',
    metadata: {
      undergraduate_school: '其他大学',
      major: '其他专业',
      discipline: '工学',
      source_class: 'historical_real_case',
      jiuchen_success_case: false,
    },
    ...overrides,
  }
}

test('case knowledge source deterministically returns only bounded real evidence', async () => {
  const root = await createFixture([
    row('other'),
    row('matching', {
      title: '计算机学院相似案例',
      content: '示例理工大学计算机科学与技术专业学生申请目标大学。',
      metadata: {
        undergraduate_school: '示例理工大学',
        major: '计算机科学与技术',
        discipline: '工学',
        source_class: 'historical_real_case',
        jiuchen_success_case: false,
      },
    }),
  ])

  try {
    const source = new CaseKnowledgeSource({ mode: 'eval_safe', dataRoot: root, topK: 1 })
    const first = await source.retrieve(input)
    const second = await source.retrieve(input)

    assert.equal(first.evidence.length, 1)
    assert.equal(first.evidence[0].ref, 'case:doc-matching')
    assert.equal(first.evidence[0].sourceId, 'case-matching')
    assert.equal(first.evidence[0].sourceType, 'external')
    assert.equal(first.version, second.version)
    assert.deepEqual(first.evidence, second.evidence)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('eval-safe case source rejects any evaluation split', async () => {
  const root = await createFixture([row('leak', { split: 'eval' })])
  try {
    const source = new CaseKnowledgeSource({ mode: 'eval_safe', dataRoot: root })
    await assert.rejects(source.retrieve(input), /assessment_eval_safe_data_contains_eval_split/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('product knowledge source returns bounded stable handbook evidence', async () => {
  const source = new ProductKnowledgeSource(2)
  const first = await source.retrieve(input)
  const second = await source.retrieve(input)

  assert.equal(first.evidence.length, 2)
  assert.ok(first.evidence.every((item) => item.ref.startsWith('product:')))
  assert.ok(first.evidence.every((item) => item.sourceType === 'internal'))
  assert.equal(first.version, second.version)
})
