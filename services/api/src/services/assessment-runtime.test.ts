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
  type AssessmentRuntime,
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

test('assessment runtime allows insufficient_data without retrieved target evidence', async () => {
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
        strengths: [],
        risks: [],
        targetAssessments: [
          {
            schoolName: '目标大学',
            tier: 'insufficient_data',
            rationale: '当前只有用户输入，缺少足够的真实检索证据。',
            gapItems: [],
            actions: [],
            evidenceRefs: ['input:target:1'],
          },
        ],
        recommendedActions: [],
        similarCases: [],
        uncertainties: ['缺少可用于目标院校判断的检索证据。'],
        disclaimer: '本结果用于规划辅助。',
      }
    },
  }

  const result = await executeAssessment({ retriever, provider }, input)

  assert.equal(result.output.targetAssessments[0].tier, 'insufficient_data')
  assert.deepEqual(
    result.output.targetAssessments[0].evidenceRefs,
    ['input:target:1'],
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


test('assessment runtime contains repeated invalid general refs after bounded repair', async () => {
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

  const invalidOutput = {
    profileSummary: '背景摘要',
    strengths: [{
      title: '无依据优势',
      detail: '该条引用不存在的证据。',
      evidenceRefs: ['case:invented'],
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

  const provider: AssessmentModelProvider = {
    provider: 'mock-provider',
    model: 'mock-model',
    isConfigured: () => true,
    async analyze() { return invalidOutput },
    async repair() {
      repairs += 1
      return invalidOutput
    },
  }

  const result = await executeAssessment({ retriever, provider }, input)

  assert.equal(repairs, 1)
  assert.deepEqual(result.output.strengths, [])
  assert.equal(result.output.targetAssessments[0].tier, 'match')
  assert.deepEqual(result.output.targetAssessments[0].evidenceRefs, ['case:real'])
})

test('assessment runtime conservatively downgrades target when repeated invalid refs survive repair', async () => {
  let repairs = 0
  const retriever: AssessmentRetriever = {
    async retrieve() {
      return {
        version: 'knowledge-empty-v1',
        evidence: [],
      }
    },
  }

  const invalidOutput = {
    profileSummary: '背景摘要',
    strengths: [],
    risks: [],
    targetAssessments: [{
      schoolName: '目标大学',
      tier: 'match',
      rationale: '引用了不存在的案例并据此判断。',
      gapItems: ['无证据差距'],
      actions: ['无证据动作'],
      evidenceRefs: ['case:invented'],
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
    async analyze() { return invalidOutput },
    async repair() {
      repairs += 1
      return invalidOutput
    },
  }

  const result = await executeAssessment({ retriever, provider }, input)
  const target = result.output.targetAssessments[0]

  assert.equal(repairs, 1)
  assert.equal(target.tier, 'insufficient_data')
  assert.equal(target.rationale, '当前检索证据不足，无法对该目标作出可靠梯度判断。')
  assert.deepEqual(target.gapItems, [])
  assert.deepEqual(target.actions, [])
  assert.deepEqual(target.evidenceRefs, ['input:target:1'])
})

test('assessment runtime removes repeated invalid similar cases after bounded repair', async () => {
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

  const invalidOutput = {
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
    similarCases: [{
      caseId: 'invented',
      sourceType: 'external',
      similarityReason: '不存在的案例。',
      resultSummary: '不存在的结果。',
      evidenceRef: 'case:invented',
    }],
    uncertainties: [],
    disclaimer: '本结果用于规划辅助。',
  }

  const provider: AssessmentModelProvider = {
    provider: 'mock-provider',
    model: 'mock-model',
    isConfigured: () => true,
    async analyze() { return invalidOutput },
    async repair() {
      repairs += 1
      return invalidOutput
    },
  }

  const result = await executeAssessment({ retriever, provider }, input)

  assert.equal(repairs, 1)
  assert.deepEqual(result.output.similarCases, [])
})

test('assessment runtime does not sanitize target coverage mismatches', async () => {
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

  const invalidOutput = {
    profileSummary: '背景摘要',
    strengths: [],
    risks: [],
    targetAssessments: [{
      schoolName: '错误目标大学',
      tier: 'match',
      rationale: '目标覆盖错误。',
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
    async analyze() { return invalidOutput },
    async repair() {
      repairs += 1
      return invalidOutput
    },
  }

  await assert.rejects(
    executeAssessment({ retriever, provider }, input),
    (error: unknown) =>
      error instanceof AssessmentEvidenceReferenceError &&
      error.message === 'assessment_target_coverage_invalid',
  )
  assert.equal(repairs, 1)
})

test('documented award with empty strengths gets one evidence-backed repair', async () => {
  const assessment = { ...input, competitions: [{ name: '校内赛事', award: '一等奖' }] }
  const emptyOutput = {
    profileSummary: '用户提供了获奖记录。',
    strengths: [],
    risks: [],
    targetAssessments: [{
      schoolName: '目标大学', tier: 'insufficient_data',
      rationale: '缺少目标院校的官方依据。', gapItems: [], actions: [],
      evidenceRefs: ['input:target:1'],
    }],
    recommendedActions: [], similarCases: [], uncertainties: [],
    disclaimer: '本评估仅供规划参考。',
  }
  let repairs = 0
  const runtime: AssessmentRuntime = {
    retriever: { async retrieve() { return { version: 'empty-v1', evidence: [] } } },
    provider: {
      provider: 'mock', model: 'mock', isConfigured: () => true,
      async analyze() { return emptyOutput },
      async repair({ validationError }) {
        repairs += 1
        assert.equal(validationError, 'assessment_strengths_missing_for_documented_achievement')
        return { ...emptyOutput, strengths: [{
          title: '有可核实的获奖经历',
          detail: '用户记录了一项校内赛事一等奖，具体竞争水平仍需核实。',
          evidenceRefs: ['input:competition:1'],
        }] }
      },
    },
  }
  const result = await executeAssessment(runtime, assessment)
  assert.equal(repairs, 1)
  assert.equal(result.output.strengths.length, 1)
  assert.deepEqual(result.output.strengths[0].evidenceRefs, ['input:competition:1'])
})

test('documented achievement cannot be persisted as a successful empty-strength report', async () => {
  const assessment = { ...input, research: [{ title: '校内研究项目', output: '完成项目报告' }] }
  const emptyOutput = {
    profileSummary: '用户提供了科研产出。',
    strengths: [],
    risks: [],
    targetAssessments: [{
      schoolName: '目标大学', tier: 'insufficient_data',
      rationale: '缺少目标院校的官方依据。', gapItems: [], actions: [],
      evidenceRefs: ['input:target:1'],
    }],
    recommendedActions: [], similarCases: [], uncertainties: [],
    disclaimer: '本评估仅供规划参考。',
  }
  let repairs = 0
  const runtime: AssessmentRuntime = {
    retriever: { async retrieve() { return { version: 'empty-v1', evidence: [] } } },
    provider: {
      provider: 'mock', model: 'mock', isConfigured: () => true,
      async analyze() { return emptyOutput },
      async repair() { repairs += 1; return emptyOutput },
    },
  }
  await assert.rejects(
    executeAssessment(runtime, assessment),
    (error: unknown) => error instanceof AssessmentEvidenceReferenceError &&
      error.message === 'assessment_strengths_missing',
  )
  assert.equal(repairs, 1)
})
