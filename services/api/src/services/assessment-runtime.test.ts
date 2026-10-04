import assert from 'node:assert/strict'
import test from 'node:test'
import { JsonModelProviderInvalidJsonError } from './ai-provider.js'
import {
  AssessmentEvidenceConflictError,
  AssessmentEvidenceReferenceError,
  AssessmentProviderUnavailableError,
  CompositeAssessmentRetriever,
  createAssessmentRuntimeFromEnv,
  createUnconfiguredAssessmentRuntime,
  executeAssessment,
  type AssessmentKnowledgeSource,
  type AssessmentModelProvider,
  type AssessmentRetriever,
} from './assessment-runtime.js'

const input = {
  profile: {
    university: '示例大学',
    major: '人工智能',
    currentGrade: '大三',
    gpaText: '3.8/4.0',
    rankText: '8/120',
  },
  english: [],
  research: [],
  competitions: [],
  targets: [{ schoolName: '目标大学' }],
}

test('unconfigured assessment runtime fails explicitly without fake output', async () => {
  await assert.rejects(
    executeAssessment(createUnconfiguredAssessmentRuntime(), input),
    AssessmentProviderUnavailableError,
  )
})

test('assessment runtime passes retrieved evidence into provider and validates output', async () => {
  let providerReceivedEvidence = false

  const retriever: AssessmentRetriever = {
    async retrieve() {
      return {
        version: 'case-dataset-v1',
        evidence: [
          {
            ref: 'case:c1',
            kind: 'case',
            sourceType: 'external',
            sourceId: 'c1',
            title: '相似案例',
            sourceLabel: '预处理案例库',
            year: 2026,
          },
        ],
      }
    },
  }

  const provider: AssessmentModelProvider = {
    provider: 'mock-provider',
    model: 'mock-model',
    isConfigured: () => true,
    async analyze({ knowledge }) {
      providerReceivedEvidence = knowledge.evidence.length === 1
      return {
        profileSummary: '背景摘要',
        strengths: [],
        risks: [],
        targetAssessments: [
          {
            schoolName: '目标大学',
            tier: 'match',
            rationale: '基于结构化背景与案例证据进行定性分析。',
            gapItems: [],
            actions: [],
            evidenceRefs: ['case:c1'],
          },
        ],
        recommendedActions: [],
        similarCases: [
          {
            caseId: 'c1',
            sourceType: 'external',
            similarityReason: '背景结构接近。',
            resultSummary: '案例结果摘要。',
            evidenceRef: 'case:c1',
          },
        ],
        uncertainties: [],
        disclaimer: '本结果用于规划辅助，不代表录取承诺。',
      }
    },
  }

  const result = await executeAssessment({ retriever, provider }, input)

  assert.equal(providerReceivedEvidence, true)
  assert.equal(result.provider, 'mock-provider')
  assert.equal(result.model, 'mock-model')
  assert.equal(result.knowledgeVersion, 'case-dataset-v1')
  assert.equal(result.evidence.length, 1)
  assert.equal(result.output.targetAssessments[0].tier, 'match')
})


test('assessment runtime rejects target analysis without retrieved evidence', async () => {
  const retriever: AssessmentRetriever = {
    async retrieve() {
      return {
        version: 'knowledge-empty-v1',
        evidence: [],
      }
    },
  }

  const provider: AssessmentModelProvider = {
    provider: 'mock-provider',
    model: 'mock-model',
    isConfigured: () => true,
    async analyze() {
      return {
        profileSummary: '背景摘要',
        strengths: [
          {
            title: '排名较好',
            detail: '来自用户输入。',
            evidenceRefs: ['input:rank'],
          },
        ],
        risks: [],
        targetAssessments: [
          {
            schoolName: '目标大学',
            tier: 'match',
            rationale: '缺少真实检索证据。',
            gapItems: [],
            actions: [],
            evidenceRefs: ['input:rank'],
          },
        ],
        recommendedActions: [],
        similarCases: [],
        uncertainties: [],
        disclaimer: '本结果用于规划辅助。',
      }
    },
  }

  await assert.rejects(
    executeAssessment({ retriever, provider }, input),
    (error: unknown) =>
      error instanceof AssessmentEvidenceReferenceError &&
      error.message === 'target_assessment_requires_retrieved_evidence',
  )
})

test('assessment runtime rejects invented evidence ids', async () => {
  const retriever: AssessmentRetriever = {
    async retrieve() {
      return {
        version: 'knowledge-v1',
        evidence: [
          {
            ref: 'case:real',
            kind: 'case',
            sourceType: 'external',
            sourceId: 'real',
            title: '真实案例',
            sourceLabel: '案例库',
          },
        ],
      }
    },
  }

  const provider: AssessmentModelProvider = {
    provider: 'mock-provider',
    model: 'mock-model',
    isConfigured: () => true,
    async analyze() {
      return {
        profileSummary: '背景摘要',
        strengths: [],
        risks: [],
        targetAssessments: [
          {
            schoolName: '目标大学',
            tier: 'match',
            rationale: '引用了不存在的案例。',
            gapItems: [],
            actions: [],
            evidenceRefs: ['case:invented'],
          },
        ],
        recommendedActions: [],
        similarCases: [],
        uncertainties: [],
        disclaimer: '本结果用于规划辅助。',
      }
    },
  }

  await assert.rejects(
    executeAssessment({ retriever, provider }, input),
    AssessmentEvidenceReferenceError,
  )
})

test('assessment runtime rejects invented input evidence refs', async () => {
  const retriever: AssessmentRetriever = {
    async retrieve() {
      return {
        version: 'knowledge-v1',
        evidence: [
          {
            ref: 'case:real',
            kind: 'case',
            sourceType: 'external',
            sourceId: 'real',
            title: '真实案例',
            sourceLabel: '案例库',
          },
        ],
      }
    },
  }

  const provider: AssessmentModelProvider = {
    provider: 'mock-provider',
    model: 'mock-model',
    isConfigured: () => true,
    async analyze() {
      return {
        profileSummary: '背景摘要',
        strengths: [{
          title: '虚构输入',
          detail: '引用了不存在的用户输入。',
          evidenceRefs: ['input:invented'],
        }],
        risks: [],
        targetAssessments: [{
          schoolName: '目标大学',
          tier: 'match',
          rationale: '使用真实案例。',
          gapItems: [],
          actions: [],
          evidenceRefs: ['case:real'],
        }],
        recommendedActions: [],
        similarCases: [],
        uncertainties: [],
        disclaimer: '本结果用于规划辅助。',
      }
    },
  }

  await assert.rejects(
    executeAssessment({ retriever, provider }, input),
    AssessmentEvidenceReferenceError,
  )
})

test('assessment runtime allows one bounded repair after invalid model output', async () => {
  let repairs = 0
  const retriever: AssessmentRetriever = {
    async retrieve() {
      return {
        version: 'knowledge-v1',
        evidence: [{
          ref: 'case:real',
          kind: 'case',
          sourceType: 'external',
          sourceId: 'real',
          title: '真实案例',
          sourceLabel: '案例库',
        }],
      }
    },
  }
  const validOutput = {
    profileSummary: '背景摘要',
    strengths: [],
    risks: [],
    targetAssessments: [{
      schoolName: '目标大学',
      tier: 'match',
      rationale: '使用真实案例。',
      gapItems: [],
      actions: [],
      evidenceRefs: ['case:real'],
    }],
    recommendedActions: [],
    similarCases: [],
    uncertainties: [],
    disclaimer: '本结果用于规划辅助。',
  }
  const provider: AssessmentModelProvider = {
    provider: 'mock-provider',
    model: 'mock-model',
    isConfigured: () => true,
    async analyze() {
      return { invalid: true }
    },
    async repair() {
      repairs += 1
      return validOutput
    },
  }

  const result = await executeAssessment({ retriever, provider }, input)
  assert.equal(repairs, 1)
  assert.equal(result.output.targetAssessments[0].tier, 'match')
})


test('assessment runtime repairs a valid JSON scalar that violates output schema', async () => {
  let repairs = 0
  const retriever: AssessmentRetriever = {
    async retrieve() {
      return {
        version: 'knowledge-v1',
        evidence: [{
          ref: 'case:real',
          kind: 'case',
          sourceType: 'external',
          sourceId: 'real',
          title: '真实案例',
          sourceLabel: '案例库',
        }],
      }
    },
  }

  const provider: AssessmentModelProvider = {
    provider: 'mock-provider',
    model: 'mock-model',
    isConfigured: () => true,
    async analyze() {
      return 0.999
    },
    async repair() {
      repairs += 1
      return {
        profileSummary: '背景摘要',
        strengths: [],
        risks: [],
        targetAssessments: [{
          schoolName: '目标大学',
          tier: 'match',
          rationale: '使用真实案例。',
          gapItems: [],
          actions: [],
          evidenceRefs: ['case:real'],
        }],
        recommendedActions: [],
        similarCases: [],
        uncertainties: [],
        disclaimer: '本结果用于规划辅助。',
      }
    },
  }

  const result = await executeAssessment({ retriever, provider }, input)
  assert.equal(repairs, 1)
  assert.equal(result.output.targetAssessments[0].tier, 'match')
})


test('assessment runtime uses the same single repair budget for invalid JSON', async () => {
  let repairs = 0
  const retriever: AssessmentRetriever = {
    async retrieve() {
      return {
        version: 'knowledge-v1',
        evidence: [{
          ref: 'case:real',
          kind: 'case',
          sourceType: 'external',
          sourceId: 'real',
          title: '真实案例',
          sourceLabel: '案例库',
        }],
      }
    },
  }

  const validOutput = {
    profileSummary: '背景摘要',
    strengths: [],
    risks: [],
    targetAssessments: [{
      schoolName: '目标大学',
      tier: 'match',
      rationale: '使用真实案例。',
      gapItems: [],
      actions: [],
      evidenceRefs: ['case:real'],
    }],
    recommendedActions: [],
    similarCases: [],
    uncertainties: [],
    disclaimer: '本结果用于规划辅助。',
  }

  const provider: AssessmentModelProvider = {
    provider: 'mock-provider',
    model: 'mock-model',
    isConfigured: () => true,
    async analyze() {
      throw new JsonModelProviderInvalidJsonError('not-json')
    },
    async repair({ invalidOutput, validationError }) {
      repairs += 1
      assert.equal(invalidOutput, 'not-json')
      assert.equal(validationError, 'ai_provider_invalid_json')
      return validOutput
    },
  }

  const result = await executeAssessment({ retriever, provider }, input)
  assert.equal(repairs, 1)
  assert.equal(result.output.targetAssessments[0].tier, 'match')
})


test('composite retriever merges independent knowledge sources', async () => {
  const sources: AssessmentKnowledgeSource[] = [
    {
      sourceId: 'schools',
      async retrieve() {
        return {
          version: 'schools-v1',
          evidence: [
            {
              ref: 'school:target',
              kind: 'school',
              sourceType: 'official',
              sourceId: 'target',
              title: '目标大学项目要求',
              sourceLabel: '目标大学官网',
            },
          ],
        }
      },
    },
    {
      sourceId: 'cases',
      async retrieve() {
        return {
          version: 'cases-v3',
          evidence: [
            {
              ref: 'case:similar',
              kind: 'case',
              sourceType: 'external',
              sourceId: 'similar',
              title: '相似案例',
              sourceLabel: '案例库',
            },
          ],
        }
      },
    },
  ]

  const retriever = new CompositeAssessmentRetriever(sources)
  const result = await retriever.retrieve(input)

  assert.equal(result.evidence.length, 2)
  assert.deepEqual(
    result.evidence.map((item) => item.ref),
    ['school:target', 'case:similar'],
  )
  assert.match(result.version, /^knowledge-composite-[a-f0-9]{20}$/)
})

test('composite retriever rejects duplicate evidence refs across sources', async () => {
  const duplicate = {
    ref: 'case:duplicate',
    kind: 'case' as const,
    sourceType: 'external' as const,
    sourceId: 'duplicate',
    title: '重复案例',
    sourceLabel: '案例库',
  }

  const sources: AssessmentKnowledgeSource[] = [
    {
      sourceId: 'source-a',
      async retrieve() {
        return {
          version: 'a-v1',
          evidence: [duplicate],
        }
      },
    },
    {
      sourceId: 'source-b',
      async retrieve() {
        return {
          version: 'b-v1',
          evidence: [duplicate],
        }
      },
    },
  ]

  const retriever = new CompositeAssessmentRetriever(sources)

  await assert.rejects(
    retriever.retrieve(input),
    AssessmentEvidenceConflictError,
  )
})



test('assessment runtime prompt forbids unsupported external benchmarks', async () => {
  const originalFetch = globalThis.fetch
  let capturedBody: {
    messages?: Array<{ role?: string; content?: unknown }>
  } | undefined

  globalThis.fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? '{}')) as {
      messages?: Array<{ role?: string; content?: unknown }>
    }

    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  try {
    const runtime = createAssessmentRuntimeFromEnv({
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: 3000,
      ASSESSMENT_AI_BASE_URL: 'https://assessment.example/v1',
      ASSESSMENT_AI_API_KEY: 'assessment-key',
      ASSESSMENT_AI_MODEL: 'assessment-model',
      ASSESSMENT_AI_RESPONSE_FORMAT: 'json_schema',
    })

    await runtime.provider.analyze({
      assessment: input,
      knowledge: {
        version: 'knowledge-v1',
        evidence: [],
      },
    })

    const system = capturedBody?.messages?.find(
      (message) => message.role === 'system',
    )?.content

    assert.equal(typeof system, 'string')
    assert.match(String(system), /外部事实/)
    assert.match(String(system), /不得自行添加/)
    assert.match(String(system), /不得夹带外部基准/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('assessment runtime uses only assessment-scoped AI configuration', () => {
  const runtime = createAssessmentRuntimeFromEnv({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: 3000,
    ASSESSMENT_AI_PROVIDER: 'assessment-test',
    ASSESSMENT_AI_BASE_URL: 'https://assessment.example/v1',
    ASSESSMENT_AI_API_KEY: 'assessment-key',
    ASSESSMENT_AI_MODEL: 'assessment-model',
    CUSTOMER_AI_BASE_URL: 'https://customer.example/v1',
    CUSTOMER_AI_API_KEY: 'customer-key',
    CUSTOMER_AI_MODEL: 'customer-model',
  })

  assert.equal(runtime.provider.isConfigured(), true)
  assert.equal(runtime.provider.provider, 'assessment-test')
  assert.equal(runtime.provider.model, 'assessment-model')

  const customerOnlyRuntime = createAssessmentRuntimeFromEnv({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: 3000,
    CUSTOMER_AI_BASE_URL: 'https://customer.example/v1',
    CUSTOMER_AI_API_KEY: 'customer-key',
    CUSTOMER_AI_MODEL: 'customer-model',
  })

  assert.equal(customerOnlyRuntime.provider.isConfigured(), false)
})
