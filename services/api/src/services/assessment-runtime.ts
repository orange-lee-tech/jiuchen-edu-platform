import { createHash } from 'node:crypto'
import type { AppEnv } from '../config/env.js'
import type {
  AssessmentEvidenceItem,
  AssessmentInput,
  AssessmentOutput,
} from '../domain/assessment.js'
import {
  assessmentEvidenceItemSchema,
  validateAssessmentOutput,
} from '../domain/assessment.js'
import {
  createAssessmentAIProvider,
  JsonModelProviderInvalidJsonError,
  type JsonModelProvider,
} from './ai-provider.js'
import {
  CaseKnowledgeSource,
  ProductKnowledgeSource,
} from './assessment-knowledge.js'

export type AssessmentKnowledgeContext = {
  version: string
  evidence: AssessmentEvidenceItem[]
}

export interface AssessmentRetriever {
  retrieve(input: AssessmentInput): Promise<AssessmentKnowledgeContext>
}

export interface AssessmentKnowledgeSource {
  readonly sourceId: string
  retrieve(input: AssessmentInput): Promise<AssessmentKnowledgeContext>
}

export interface AssessmentModelProvider {
  readonly provider: string
  readonly model: string
  isConfigured(): boolean
  analyze(input: {
    assessment: AssessmentInput
    knowledge: AssessmentKnowledgeContext
  }): Promise<unknown>
  repair?(input: {
    assessment: AssessmentInput
    knowledge: AssessmentKnowledgeContext
    invalidOutput: unknown
    validationError: string
  }): Promise<unknown>
}

export type AssessmentRuntime = {
  retriever: AssessmentRetriever
  provider: AssessmentModelProvider
}

export class AssessmentProviderUnavailableError extends Error {
  constructor() {
    super('assessment_provider_not_configured')
    this.name = 'AssessmentProviderUnavailableError'
  }
}

export class AssessmentEvidenceReferenceError extends Error {
  constructor(message = 'assessment_evidence_reference_invalid') {
    super(message)
    this.name = 'AssessmentEvidenceReferenceError'
  }
}

export class AssessmentEvidenceConflictError extends Error {
  constructor(ref: string) {
    super('assessment_evidence_ref_conflict:' + ref)
    this.name = 'AssessmentEvidenceConflictError'
  }
}

export class CompositeAssessmentRetriever implements AssessmentRetriever {
  constructor(
    private readonly sources: readonly AssessmentKnowledgeSource[],
  ) {}

  async retrieve(input: AssessmentInput): Promise<AssessmentKnowledgeContext> {
    if (this.sources.length === 0) {
      return {
        version: 'knowledge-empty-v0',
        evidence: [],
      }
    }

    const contexts = await Promise.all(
      this.sources.map(async (source) => ({
        sourceId: source.sourceId,
        context: await source.retrieve(input),
      })),
    )

    const refs = new Set<string>()
    const evidence: AssessmentEvidenceItem[] = []

    for (const { context } of contexts) {
      for (const item of context.evidence) {
        const parsedItem = assessmentEvidenceItemSchema.parse(item)
        if (refs.has(parsedItem.ref)) {
          throw new AssessmentEvidenceConflictError(parsedItem.ref)
        }
        refs.add(parsedItem.ref)
        evidence.push(parsedItem)
      }
    }

    const fingerprint = contexts.map(({ sourceId, context }) => ({
      sourceId,
      version: context.version,
    }))

    const digest = createHash('sha256')
      .update(JSON.stringify(fingerprint))
      .digest('hex')
      .slice(0, 20)

    return {
      version: 'knowledge-composite-' + digest,
      evidence,
    }
  }
}

class UnconfiguredAssessmentProvider implements AssessmentModelProvider {
  readonly provider = 'unconfigured'
  readonly model = 'unconfigured'

  isConfigured() {
    return false
  }

  async analyze(): Promise<never> {
    throw new AssessmentProviderUnavailableError()
  }
}

class JsonAssessmentModelProvider implements AssessmentModelProvider {
  constructor(private readonly modelProvider: JsonModelProvider) {}

  get provider() {
    return this.modelProvider.provider
  }

  get model() {
    return this.modelProvider.model
  }

  isConfigured() {
    return this.modelProvider.isConfigured()
  }

  async analyze(input: {
    assessment: AssessmentInput
    knowledge: AssessmentKnowledgeContext
  }): Promise<unknown> {
    if (!this.isConfigured()) {
      throw new AssessmentProviderUnavailableError()
    }

    return this.generate(input)
  }

  private generate(
    input: {
      assessment: AssessmentInput
      knowledge: AssessmentKnowledgeContext
    },
    repair?: { invalidOutput: unknown; validationError: string },
  ) {
    const allowedInputEvidenceRefs = getAllowedInputEvidenceRefs(input.assessment)
    const outputShape =
      '{"profileSummary":"string","strengths":[{"title":"string","detail":"string","evidenceRefs":["ref"]}],"risks":[{"title":"string","detail":"string","evidenceRefs":["ref"]}],"targetAssessments":[{"schoolName":"string","programName":null,"tier":"reach|match|conservative|insufficient_data","rationale":"string","gapItems":["string"],"actions":["string"],"evidenceRefs":["ref"]}],"recommendedActions":[{"priority":"high|medium|low","title":"string","rationale":"string","timeframe":null}],"similarCases":[{"caseId":"string","sourceType":"jiuchen|external","similarityReason":"string","resultSummary":"string","evidenceRef":"case:..."}],"uncertainties":["string"],"disclaimer":"string"}'

    return this.modelProvider.generateJson({
      system:
        '你是九辰教育保研评估引擎。只输出一个完整 JSON 对象，不要 Markdown，不要解释。' +
        '顶层必须是 object；第一个非空白字符必须是 {，最后一个非空白字符必须是 }。禁止只输出数字、字符串、数组、布尔值或 null。' +
        '输出必须匹配 assessment-output-v1。以下仅是字段与类型骨架，不是事实示例：' +
        outputShape +
        '。可以使用空数组，但不得省略顶层字段。' +
        '禁止生成精确录取概率。禁止发明 evidence ref、案例、院校事实或来源。' +
        'strengths/risks 只能引用 allowedInputEvidenceRefs 或 knowledge.evidence 中的 ref；每个 targetAssessments 必须引用至少一条 kind=school/program/case 的真实检索证据。' +
        'similarCases 只能引用 kind=case 的真实 evidence，caseId 必须等于该 evidence 的 sourceId，sourceType 必须一致。' +
        'targetAssessments 要逐一覆盖用户输入的目标院校。资料不足时明确写入 uncertainties，并使用 insufficient_data，而不是编造结论。' +
        (repair
          ? '这是唯一一次修复机会。上次输出未通过 assessment-output-v1；请完全重写为上述完整 JSON 对象，不要只修局部，也不要重复输出数字/字符串/数组。保持有证据的有效内容，不要添加新事实。'
          : ''),
      user:
        (repair
          ? `上次输出校验失败：${repair.validationError}\n上次输出：${JSON.stringify(repair.invalidOutput)}\n`
          : '') +
        '请根据以下结构化输入、允许的输入引用和证据快照完成评估：\n' +
        JSON.stringify({ ...input, allowedInputEvidenceRefs }),
    })
  }

  async repair(input: {
    assessment: AssessmentInput
    knowledge: AssessmentKnowledgeContext
    invalidOutput: unknown
    validationError: string
  }): Promise<unknown> {
    return this.generate(input, {
      invalidOutput: input.invalidOutput,
      validationError: input.validationError,
    })
  }
}

export function createUnconfiguredAssessmentRuntime(): AssessmentRuntime {
  return {
    retriever: new CompositeAssessmentRetriever([]),
    provider: new UnconfiguredAssessmentProvider(),
  }
}

export function createAssessmentRuntimeFromEnv(env: AppEnv): AssessmentRuntime {
  const mode = env.NODE_ENV === 'production' ? 'production' : 'eval_safe'
  return {
    retriever: new CompositeAssessmentRetriever([
      new CaseKnowledgeSource({
        mode,
        dataRoot: env.ASSESSMENT_CASE_DATA_ROOT,
        topK: 10,
      }),
      new ProductKnowledgeSource(3),
    ]),
    provider: new JsonAssessmentModelProvider(
      createAssessmentAIProvider(env),
    ),
  }
}

export function getAllowedInputEvidenceRefs(input: AssessmentInput) {
  const refs = ['input:profile']
  if (input.profile.gpaText) refs.push('input:gpa')
  if (input.profile.rankText) refs.push('input:rank')
  if (input.profile.backgroundNote) refs.push('input:background')
  input.english.forEach((_, index) => refs.push(`input:english:${index + 1}`))
  input.research.forEach((_, index) => refs.push(`input:research:${index + 1}`))
  input.competitions.forEach((_, index) => refs.push(`input:competition:${index + 1}`))
  input.targets.forEach((_, index) => refs.push(`input:target:${index + 1}`))
  if (input.preferences) refs.push('input:preferences')
  return refs
}

function validateAssessmentResult(
  rawOutput: unknown,
  input: AssessmentInput,
  knowledge: AssessmentKnowledgeContext,
) {
  const output = validateAssessmentOutput(rawOutput)
  const evidenceByRef = new Map(knowledge.evidence.map((item) => [item.ref, item]))
  const allowedInputEvidence = new Set(getAllowedInputEvidenceRefs(input))
  const targetKey = (schoolName: string, programName?: string | null) =>
    `${schoolName.trim().toLocaleLowerCase('zh-CN')}|${programName?.trim().toLocaleLowerCase('zh-CN') ?? ''}`
  const expectedTargets = input.targets.map((target) =>
    targetKey(target.schoolName, target.programName),
  ).sort()
  const actualTargets = output.targetAssessments.map((target) =>
    targetKey(target.schoolName, target.programName),
  ).sort()

  if (JSON.stringify(expectedTargets) !== JSON.stringify(actualTargets)) {
    throw new AssessmentEvidenceReferenceError(
      'assessment_target_coverage_invalid',
    )
  }

  const validateGeneralRefs = (refs: string[]) => {
    for (const ref of refs) {
      if (allowedInputEvidence.has(ref)) continue
      if (!evidenceByRef.has(ref)) {
        throw new AssessmentEvidenceReferenceError()
      }
    }
  }

  for (const finding of [...output.strengths, ...output.risks]) {
    validateGeneralRefs(finding.evidenceRefs)
  }

  for (const target of output.targetAssessments) {
    validateGeneralRefs(target.evidenceRefs)
    if (!target.evidenceRefs.some((ref) => {
      const evidence = evidenceByRef.get(ref)
      return evidence && ['school', 'program', 'case'].includes(evidence.kind)
    })) {
      throw new AssessmentEvidenceReferenceError(
        'target_assessment_requires_retrieved_evidence',
      )
    }
  }

  for (const similarCase of output.similarCases) {
    const evidence = evidenceByRef.get(similarCase.evidenceRef)
    if (
      !evidence ||
      evidence.kind !== 'case' ||
      evidence.sourceId !== similarCase.caseId ||
      evidence.sourceType !== similarCase.sourceType
    ) {
      throw new AssessmentEvidenceReferenceError(
        'similar_case_reference_invalid',
      )
    }
  }

  return output
}

export async function executeAssessment(
  runtime: AssessmentRuntime,
  input: AssessmentInput,
): Promise<{
  output: AssessmentOutput
  evidence: AssessmentEvidenceItem[]
  knowledgeVersion: string
  provider: string
  model: string
}> {
  if (!runtime.provider.isConfigured()) {
    throw new AssessmentProviderUnavailableError()
  }

  const knowledge = await runtime.retriever.retrieve(input)
  let rawOutput: unknown
  let repairUsed = false

  try {
    rawOutput = await runtime.provider.analyze({
      assessment: input,
      knowledge,
    })
  } catch (error) {
    if (
      !(error instanceof JsonModelProviderInvalidJsonError) ||
      !runtime.provider.repair
    ) {
      throw error
    }

    repairUsed = true
    rawOutput = await runtime.provider.repair({
      assessment: input,
      knowledge,
      invalidOutput: error.rawText,
      validationError: error.message,
    })
  }

  let output: AssessmentOutput

  try {
    output = validateAssessmentResult(rawOutput, input, knowledge)
  } catch (error) {
    if (!runtime.provider.repair || repairUsed) throw error

    repairUsed = true
    rawOutput = await runtime.provider.repair({
      assessment: input,
      knowledge,
      invalidOutput: rawOutput,
      validationError:
        error instanceof Error ? error.message : 'assessment_output_invalid',
    })
    output = validateAssessmentResult(rawOutput, input, knowledge)
  }

  return {
    output,
    evidence: knowledge.evidence,
    knowledgeVersion: knowledge.version,
    provider: runtime.provider.provider,
    model: runtime.provider.model,
  }
}
