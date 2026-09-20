import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AssessmentProviderUnavailableError,
  createUnconfiguredAssessmentRuntime,
  executeAssessment,
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
