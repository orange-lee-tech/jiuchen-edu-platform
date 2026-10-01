import { createHash } from 'node:crypto'
import type { AppEnv } from '../config/env.js'
import type {
  AssessmentEvidenceItem,
  AssessmentInput,
  AssessmentOutput,
} from '../domain/assessment.js'
import { validateAssessmentOutput } from '../domain/assessment.js'
import {
  createAssessmentAIProvider,
  type JsonModelProvider,
} from './ai-provider.js'

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
        if (refs.has(item.ref)) {
          throw new AssessmentEvidenceConflictError(item.ref)
        }
        refs.add(item.ref)
        evidence.push(item)
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

    return this.modelProvider.generateJson({
      system:
        '你是九辰教育保研评估引擎。只输出一个 JSON 对象，不要 Markdown，不要解释。' +
        '输出必须匹配 assessment-output-v1：包含 profileSummary、strengths、risks、targetAssessments、recommendedActions、similarCases、uncertainties、disclaimer。' +
        '禁止生成精确录取概率。禁止发明 evidence ref、案例、院校事实或来源。' +
        'strengths/risks 可以引用 input: 前缀的用户输入证据；每个 targetAssessments 必须引用至少一条 knowledge.evidence 中真实存在的非 input 证据。' +
        'similarCases 只能引用 kind=case 的真实 evidence。资料不足时明确写入 uncertainties，并使用 insufficient_data，而不是编造结论。',
      user:
        '请根据以下结构化输入和证据快照完成评估：\n' +
        JSON.stringify(input),
      maxTokens: 4500,
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
  return {
    retriever: new CompositeAssessmentRetriever([]),
    provider: new JsonAssessmentModelProvider(
      createAssessmentAIProvider(env),
    ),
  }
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
  const rawOutput = await runtime.provider.analyze({
    assessment: input,
    knowledge,
  })
  const output = validateAssessmentOutput(rawOutput)
  const availableEvidence = new Set(knowledge.evidence.map((item) => item.ref))

  const validateGeneralRefs = (refs: string[]) => {
    for (const ref of refs) {
      if (ref.startsWith('input:')) continue
      if (!availableEvidence.has(ref)) {
        throw new AssessmentEvidenceReferenceError()
      }
    }
  }

  for (const finding of [...output.strengths, ...output.risks]) {
    validateGeneralRefs(finding.evidenceRefs)
  }

  for (const target of output.targetAssessments) {
    validateGeneralRefs(target.evidenceRefs)
    if (!target.evidenceRefs.some((ref) => availableEvidence.has(ref))) {
      throw new AssessmentEvidenceReferenceError(
        'target_assessment_requires_retrieved_evidence',
      )
    }
  }

  for (const similarCase of output.similarCases) {
    if (!availableEvidence.has(similarCase.evidenceRef)) {
      throw new AssessmentEvidenceReferenceError(
        'similar_case_reference_invalid',
      )
    }
  }

  return {
    output,
    evidence: knowledge.evidence,
    knowledgeVersion: knowledge.version,
    provider: runtime.provider.provider,
    model: runtime.provider.model,
  }
}
