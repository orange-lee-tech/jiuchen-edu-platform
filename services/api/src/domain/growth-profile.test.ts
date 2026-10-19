import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assessmentToGrowthCandidates,
  buildApplicationProjection,
  buildResumeProjection,
  buildStandardExpression,
  type CanonicalProfile,
} from './growth-profile.js'

test('assessment facts are converted to confirmation candidates without AI', () => {
  const candidates = assessmentToGrowthCandidates({
    profile: {
      university: '中南大学',
      major: '能源与动力工程',
      currentGrade: '大四',
    },
    english: [{ type: 'cet6', score: '532' }],
    research: [{
      title: '锂电池热管理研究',
      type: 'project',
      role: '项目成员',
      organization: '某实验室',
      description: '使用 Fluent 比较不同流道结构',
      output: '论文撰写中，第二作者',
    }],
    competitions: [{
      name: '全国大学生节能减排社会实践与科技竞赛',
      level: 'national',
      award: '国家二等奖',
    }],
    targets: [{ schoolName: '浙江大学' }],
  })

  assert.equal(candidates.length, 3)
  assert.equal(candidates[0].candidateKey, 'english:0')
  assert.equal(candidates[1].record.type, 'research')
  assert.match(candidates[1].standardExpression, /Fluent/)
  assert.equal(candidates[2].record.type, 'competition')
})

test('standard expression only recombines supplied facts', () => {
  const expression = buildStandardExpression({
    type: 'research',
    title: '锂电池热管理研究',
    role: '项目成员',
    description: '完成不同流道结构仿真',
    result: '论文撰写中',
  })
  assert.match(expression, /锂电池热管理研究/)
  assert.match(expression, /不同流道结构仿真/)
  assert.doesNotMatch(expression, /第一作者|获奖|发表/)
})

const profile: CanonicalProfile = {
  schemaVersion: 'growth-profile-v1',
  identity: {
    displayName: '张同学',
    university: '中南大学',
    major: '能源与动力工程',
    currentGrade: '大四',
    gpaText: '88.6',
    rankText: '10/120',
  },
  records: [
    {
      id: 'r-project',
      type: 'project',
      title: '热管理数字孪生项目',
      description: '完成模型搭建',
      standardExpression: '热管理数字孪生项目：完成模型搭建',
      source: { type: 'manual', recordId: null, key: 'manual:r-project' },
      confirmations: { user: true, teacher: false, admin: false },
      updatedAt: '2026-10-04T00:00:00.000Z',
    },
    {
      id: 'r-research',
      type: 'research',
      title: '电池热管理研究',
      description: '完成数值模拟',
      standardExpression: '电池热管理研究：完成数值模拟',
      source: { type: 'assessment', recordId: 'a1', key: 'assessment:a1:research:0' },
      confirmations: { user: true, teacher: false, admin: false },
      updatedAt: '2026-10-03T00:00:00.000Z',
    },
  ],
}

test('technical resume projection prefers relevant confirmed facts and preserves traceability', () => {
  const projection = buildResumeProjection(profile, {
    target: 'technical',
    language: 'zh-CN',
    length: 'one-page',
  })
  assert.equal(projection.entries[0].id, 'r-project')
  assert.deepEqual(projection.entries[0].sourceRefs, ['growth:r-project', 'manual:r-project'])
})

test('application projection distinguishes matched, confirmation-required and missing fields', () => {
  const projection = buildApplicationProjection(profile)
  const byKey = Object.fromEntries(projection.fields.map((field) => [field.key, field]))
  assert.equal(byKey.school.status, 'matched')
  assert.equal(byKey.projects.status, 'matched')
  assert.equal(byKey.internships.status, 'missing')
  assert.equal(byKey.selfIntroduction.status, 'needs_confirmation')
})
