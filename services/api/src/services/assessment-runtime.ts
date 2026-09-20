import type {
  AssessmentEvidenceItem,
  AssessmentInput,
  AssessmentOutput,
} from '../domain/assessment.js'
import { validateAssessmentOutput } from '../domain/assessment.js'

export type AssessmentKnowledgeContext = {
  version: string
  evidence: AssessmentEvidenceItem[]
}

export interface AssessmentRetriever {
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

class EmptyAssessmentRetriever implements AssessmentRetriever {
  async retrieve(): Promise<AssessmentKnowledgeContext> {
    return {
      version: 'knowledge-empty-v0',
      evidence: [],
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

export function createUnconfiguredAssessmentRuntime(): AssessmentRuntime {
  return {
    retriever: new EmptyAssessmentRetriever(),
    provider: new UnconfiguredAssessmentProvider(),
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

  return {
    output,
    evidence: knowledge.evidence,
    knowledgeVersion: knowledge.version,
    provider: runtime.provider.provider,
    model: runtime.provider.model,
  }
}
