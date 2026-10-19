import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assessmentInputSchema,
  assessmentOutputSchema,
  normalizeAssessmentInput,
} from './assessment.js'

const validInput = {
  profile: {
    university: '示例大学',
    major: '人工智能',
    currentGrade: '大三',
    gpaText: '3.8/4.0',
    rankText: '8/120',
  },
  english: [{ type: 'cet6', score: '560' }],
  research: [],
  competitions: [],
  targets: [
    {
      schoolName: '目标大学',
      programName: '计算机学院',
    },
  ],
}

test('assessment input accepts structured research achievement tier', () => {
  const result = normalizeAssessmentInput({
    ...validInput,
    research: [
      {
        title: '示例论文',
        type: 'paper',
        achievementTier: 'SCI/SSCI',
      },
    ],
  })

  assert.equal(result.research[0]?.achievementTier, 'SCI/SSCI')
})

test('assessment input accepts structured student background', () => {
  const result = normalizeAssessmentInput(validInput)

  assert.equal(result.profile.university, '示例大学')
  assert.equal(result.targets.length, 1)
  assert.deepEqual(result.research, [])
})

test('assessment input rejects more than five targets', () => {
  const result = assessmentInputSchema.safeParse({
    ...validInput,
    targets: Array.from({ length: 6 }, (_, index) => ({
      schoolName: `目标大学${index + 1}`,
    })),
  })

  assert.equal(result.success, false)
})

test('assessment output rejects invented probability fields', () => {
  const result = assessmentOutputSchema.safeParse({
    profileSummary: '背景摘要',
    strengths: [],
    risks: [],
    targetAssessments: [
      {
        schoolName: '目标大学',
        tier: 'match',
        rationale: '基于已提供背景与检索证据进行定性判断。',
        gapItems: [],
        actions: [],
        evidenceRefs: [],
        admissionProbability: 0.72,
      },
    ],
    recommendedActions: [],
    similarCases: [],
    uncertainties: ['案例数据仍待补充。'],
    disclaimer: '本结果为规划辅助，不代表录取承诺。',
  })

  assert.equal(result.success, false)
})

test('assessment output accepts evidence-linked qualitative result', () => {
  const result = assessmentOutputSchema.safeParse({
    profileSummary: '背景摘要',
    strengths: [
      {
        title: '排名较好',
        detail: '当前专业排名处于较前位置。',
        evidenceRefs: ['input:rank'],
      },
    ],
    risks: [],
    targetAssessments: [
      {
        schoolName: '目标大学',
        tier: 'match',
        rationale: '依据用户背景与案例证据进行定性分析。',
        gapItems: [],
        actions: ['继续补强科研成果。'],
        evidenceRefs: ['case:example-1'],
      },
    ],
    recommendedActions: [
      {
        priority: 'high',
        title: '完善科研成果',
        rationale: '目标项目更重视科研经历。',
        timeframe: '未来3个月',
      },
    ],
    similarCases: [
      {
        caseId: 'example-1',
        sourceType: 'external',
        similarityReason: '本科背景和排名相近。',
        resultSummary: '获得目标项目入营机会。',
        evidenceRef: 'case:example-1',
      },
    ],
    uncertainties: [],
    disclaimer: '本结果为规划辅助，不代表录取承诺。',
  })

  assert.equal(result.success, true)
})


test('assessment output rejects precise probability hidden inside prose', () => {
  const result = assessmentOutputSchema.safeParse({
    profileSummary: '背景摘要',
    strengths: [],
    risks: [],
    targetAssessments: [
      {
        schoolName: '目标大学',
        tier: 'match',
        rationale: '综合判断录取概率约为72%，因此建议继续申请。',
        gapItems: [],
        actions: [],
        evidenceRefs: [],
      },
    ],
    recommendedActions: [],
    similarCases: [],
    uncertainties: [],
    disclaimer: '本结果为规划辅助。',
  })

  assert.equal(result.success, false)
})
