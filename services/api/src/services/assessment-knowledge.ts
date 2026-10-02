import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { BUNDLED_PRODUCT_HANDBOOKS } from '../data/bundled-products.js'
import { buildProductKnowledgeChunks } from '../domain/product-knowledge.js'
import {
  assessmentEvidenceItemSchema,
  type AssessmentEvidenceItem,
  type AssessmentInput,
} from '../domain/assessment.js'
import type {
  AssessmentKnowledgeContext,
  AssessmentKnowledgeSource,
} from './assessment-runtime.js'

export type CaseKnowledgeMode = 'eval_safe' | 'production'

const RAG_FILES: Record<CaseKnowledgeMode, string> = {
  eval_safe: 'rag_reference_eval_safe_train_dev.jsonl',
  production: 'rag_reference_production_all.jsonl',
}

const ragRowSchema = z.object({
  doc_id: z.string().trim().min(1).max(110),
  case_id: z.string().trim().min(1).max(160),
  dataset_version: z.string().trim().min(1).max(120),
  split: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(255),
  content: z.string().trim().min(1).max(2000),
  metadata: z.object({
    undergraduate_school: z.string().nullable().optional(),
    major: z.string().nullable().optional(),
    discipline: z.string().nullable().optional(),
    source_class: z.string().nullable().optional(),
    jiuchen_success_case: z.boolean().nullable().optional(),
  }).passthrough(),
}).passthrough()

type RagRow = z.infer<typeof ragRowSchema>

function compactText(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase('zh-CN') ?? ''
}

function searchTerms(value: string) {
  const normalized = compactText(value)
  const terms = new Set<string>()

  for (const token of normalized.match(/[a-z0-9]+|[\p{Script=Han}]+/gu) ?? []) {
    if (/^[\p{Script=Han}]+$/u.test(token)) {
      if (token.length <= 2) terms.add(token)
      for (let index = 0; index < token.length - 1; index += 1) {
        terms.add(token.slice(index, index + 2))
      }
    } else if (token.length > 1) {
      terms.add(token)
    }
  }

  return terms
}

function assessmentSearchText(input: AssessmentInput) {
  return [
    input.profile.university,
    input.profile.major,
    input.profile.currentGrade,
    input.profile.gpaText,
    input.profile.rankText,
    input.profile.backgroundNote,
    ...input.english.flatMap((item) => [item.type, item.score, item.note]),
    ...input.research.flatMap((item) => [
      item.title,
      item.type,
      item.role,
      item.organization,
      item.level,
      item.description,
      item.output,
    ]),
    ...input.competitions.flatMap((item) => [
      item.name,
      item.level,
      item.award,
      item.role,
      item.description,
    ]),
    ...input.targets.flatMap((item) => [
      item.schoolName,
      item.programName,
      item.researchDirection,
      item.note,
    ]),
    ...(input.preferences?.preferredRegions ?? []),
    input.preferences?.researchDirection,
    input.preferences?.note,
  ].filter((value): value is string => Boolean(value)).join(' ')
}

function scoreCase(row: RagRow, input: AssessmentInput, queryTerms: Set<string>) {
  const school = compactText(row.metadata.undergraduate_school)
  const major = compactText(row.metadata.major)
  const haystack = compactText([
    row.title,
    row.content,
    school,
    major,
    row.metadata.discipline,
  ].filter(Boolean).join(' '))
  const documentTerms = searchTerms(haystack)
  let score = 0

  if (school && school === compactText(input.profile.university)) score += 18
  if (major && major === compactText(input.profile.major)) score += 18
  if (major && (major.includes(compactText(input.profile.major)) || compactText(input.profile.major).includes(major))) {
    score += 8
  }

  for (const target of input.targets) {
    const targetSchool = compactText(target.schoolName)
    if (targetSchool && haystack.includes(targetSchool)) score += 14
    const program = compactText(target.programName)
    if (program && haystack.includes(program)) score += 6
  }

  let overlap = 0
  for (const term of queryTerms) {
    if (documentTerms.has(term)) overlap += 1
  }

  return score + Math.min(overlap, 24)
}

function defaultCaseDataRoots() {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url))
  return [
    resolve(process.cwd(), 'data-source/cases'),
    resolve(process.cwd(), '../../data-source/cases'),
    resolve(moduleDirectory, '../../../../data-source/cases'),
  ]
}

export class CaseKnowledgeSource implements AssessmentKnowledgeSource {
  readonly sourceId: string
  private rowsPromise?: Promise<{ rows: RagRow[]; version: string }>

  constructor(
    private readonly options: {
      mode: CaseKnowledgeMode
      dataRoot?: string
      topK?: number
    },
  ) {
    this.sourceId = `cases-${options.mode}`
  }

  private async loadRows() {
    if (!this.rowsPromise) this.rowsPromise = this.readRows()
    return this.rowsPromise
  }

  private async readRows() {
    const roots = this.options.dataRoot
      ? [resolve(this.options.dataRoot)]
      : defaultCaseDataRoots()
    const relativePath = `ai/rag/v1.0.0/${RAG_FILES[this.options.mode]}`
    let lastError: unknown

    for (const root of roots) {
      const path = resolve(root, relativePath)
      try {
        const text = await readFile(path, 'utf8')
        const rows = text
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line, index) => {
            try {
              return ragRowSchema.parse(JSON.parse(line) as unknown)
            } catch (error) {
              throw new Error(`assessment_case_data_invalid:${index + 1}`, {
                cause: error,
              })
            }
          })

        if (this.options.mode === 'eval_safe' && rows.some((row) => row.split === 'eval')) {
          throw new Error('assessment_eval_safe_data_contains_eval_split')
        }

        const uniqueRefs = new Set(rows.map((row) => row.doc_id))
        if (uniqueRefs.size !== rows.length) {
          throw new Error('assessment_case_data_duplicate_doc_id')
        }

        const fingerprint = createHash('sha256')
          .update(rows.map((row) => `${row.doc_id}:${row.dataset_version}`).join('\n'))
          .digest('hex')
          .slice(0, 20)

        return {
          rows,
          version: `cases-${this.options.mode}-${fingerprint}`,
        }
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          (error as { code?: unknown }).code === 'ENOENT'
        ) {
          lastError = error
          continue
        }
        throw error
      }
    }

    throw new Error('assessment_case_data_unavailable', { cause: lastError })
  }

  async retrieve(input: AssessmentInput): Promise<AssessmentKnowledgeContext> {
    const { rows, version } = await this.loadRows()
    const queryTerms = searchTerms(assessmentSearchText(input))
    const topK = Math.min(Math.max(this.options.topK ?? 10, 1), 12)
    const selected = rows
      .map((row) => ({ row, score: scoreCase(row, input, queryTerms) }))
      .sort((left, right) => right.score - left.score || left.row.doc_id.localeCompare(right.row.doc_id))
      .slice(0, topK)

    const evidence = selected.map(({ row }) => assessmentEvidenceItemSchema.parse({
      ref: `case:${row.doc_id}`,
      kind: 'case',
      sourceType: row.metadata.jiuchen_success_case ? 'jiuchen' : 'external',
      sourceId: row.case_id,
      title: row.title,
      sourceLabel: row.metadata.jiuchen_success_case
        ? '九辰服务案例库'
        : '历史真实案例库（非九辰自有成功案例）',
      excerpt: row.content,
    }))

    return { version, evidence }
  }
}

export class ProductKnowledgeSource implements AssessmentKnowledgeSource {
  readonly sourceId = 'products-bundled'

  constructor(private readonly topK = 3) {}

  async retrieve(input: AssessmentInput): Promise<AssessmentKnowledgeContext> {
    const queryTerms = searchTerms(assessmentSearchText(input))
    const allowedKinds = new Set([
      'product',
      'audience',
      'highlight',
      'timeline',
      'module',
      'core_service',
    ])
    const candidates = BUNDLED_PRODUCT_HANDBOOKS.flatMap((handbook) =>
      buildProductKnowledgeChunks(handbook)
        .filter((chunk) => chunk.retrievalAllowed && allowedKinds.has(chunk.kind))
        .map((chunk) => {
          const terms = searchTerms(`${handbook.product.name} ${chunk.title} ${chunk.text}`)
          let score = 0
          for (const term of queryTerms) if (terms.has(term)) score += 1
          return { handbook, chunk, score }
        }),
    )

    const selected = candidates
      .sort((left, right) => right.score - left.score || left.chunk.chunkKey.localeCompare(right.chunk.chunkKey))
      .slice(0, Math.min(Math.max(this.topK, 1), 5))

    const evidence: AssessmentEvidenceItem[] = selected.map(({ handbook, chunk }) =>
      assessmentEvidenceItemSchema.parse({
        ref: `product:${createHash('sha256').update(chunk.chunkKey).digest('hex').slice(0, 24)}`,
        kind: 'other',
        sourceType: 'internal',
        sourceId: chunk.chunkKey,
        title: `${handbook.product.name} · ${chunk.title}`.slice(0, 255),
        sourceLabel: '九辰产品手册基线',
        excerpt: chunk.text.slice(0, 1800),
      }),
    )

    const fingerprint = createHash('sha256')
      .update(BUNDLED_PRODUCT_HANDBOOKS.map((item) =>
        `${item.document.document_id}:${item.document.conversion_version}`,
      ).join('\n'))
      .digest('hex')
      .slice(0, 20)

    return {
      version: `products-bundled-${fingerprint}`,
      evidence,
    }
  }
}
