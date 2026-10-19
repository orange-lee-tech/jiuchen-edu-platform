import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildResumeDocumentModel,
  createResumeDocx,
} from './resume-docx.js'
import {
  buildResumeProjection,
  type CanonicalProfile,
} from '../domain/growth-profile.js'

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
      id: 'research-1',
      type: 'research',
      title: '锂电池热管理研究',
      role: '项目成员',
      description: '基于 Fluent 完成不同流道结构数值模拟',
      result: '论文撰写中，第二作者',
      standardExpression:
        '项目成员参与锂电池热管理研究：基于 Fluent 完成不同流道结构数值模拟；论文撰写中，第二作者',
      source: {
        type: 'manual',
        recordId: null,
        key: 'manual:research-1',
      },
      confirmations: { user: true, teacher: false, admin: false },
      updatedAt: '2026-10-04T00:00:00.000Z',
    },
  ],
}

test('resume document model is a projection of canonical facts only', () => {
  const projection = buildResumeProjection(profile, {
    target: 'academic',
    language: 'zh-CN',
    length: 'one-page',
  })
  const model = buildResumeDocumentModel(projection)

  assert.equal(model.title, '张同学 - 个人简历')
  assert.ok(model.education.some((line) => line.includes('中南大学')))
  assert.equal(model.sections[0].entries[0].title, '锂电池热管理研究')
  assert.match(model.sections[0].entries[0].text, /Fluent/)
  assert.match(model.sections[0].entries[0].text, /第二作者/)
  assert.doesNotMatch(
    JSON.stringify(model),
    /第一作者|已发表|国家一等奖/,
  )
})

test('resume docx generator emits a real OOXML zip buffer', async () => {
  const projection = buildResumeProjection(profile, {
    target: 'academic',
    language: 'zh-CN',
    length: 'one-page',
  })
  const buffer = await createResumeDocx(projection)

  assert.ok(buffer.byteLength > 1000)
  assert.equal(buffer.subarray(0, 2).toString('ascii'), 'PK')
})
