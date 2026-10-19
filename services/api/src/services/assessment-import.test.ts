import assert from 'node:assert/strict'
import test from 'node:test'
import type { AppEnv } from '../config/env.js'
import type { JsonModelProvider } from './ai-provider.js'
import {
  createAssessmentImportService,
  isOwnedAssessmentImportFile,
  isSupportedAssessmentImportFileName,
} from './assessment-import.js'
import type { MaterialDocumentExtractor } from './material-document-extractor.js'

const env = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: 3000,
} as AppEnv

const candidate = {
  profile: {
    university: '中南大学',
    major: '能源与动力工程',
    currentGrade: '大四',
    gpaText: '87.8',
    rankText: '25/97',
    backgroundNote: null,
  },
  english: [
    {
      type: 'cet6',
      score: '500',
      note: null,
    },
  ],
  research: [
    {
      title: '换热实验项目',
      type: 'project',
      achievementTier: '科研项目',
      role: '负责人',
      organization: '校实验室',
      level: 'school',
      description: '完成实验与数据分析',
      output: null,
    },
  ],
  competitions: [],
  targets: [],
  warnings: [],
}

function extractor(text = '简历正文'): MaterialDocumentExtractor {
  return {
    configured: true,
    async extract() {
      return {
        text,
        parser: 'tencent-multimodal-doc-parse',
        warnings: ['请人工确认关键字段。'],
      }
    },
    async cleanup() {},
  }
}

function provider(output: unknown = candidate): JsonModelProvider {
  return {
    provider: 'mock',
    model: 'mock',
    isConfigured: () => true,
    async generateJson() {
      return output
    },
  }
}

test('assessment material import accepts intended document and image formats only', () => {
  assert.equal(isSupportedAssessmentImportFileName('resume.doc', 'document'), true)
  assert.equal(isSupportedAssessmentImportFileName('resume.docx', 'document'), true)
  assert.equal(isSupportedAssessmentImportFileName('resume.pdf', 'document'), true)
  assert.equal(isSupportedAssessmentImportFileName('resume.txt', 'document'), false)
  assert.equal(isSupportedAssessmentImportFileName('resume.png', 'image'), true)
  assert.equal(isSupportedAssessmentImportFileName('resume.webp', 'image'), true)
  assert.equal(isSupportedAssessmentImportFileName('resume.pdf', 'image'), false)
})

test('assessment material import only accepts the current user CloudBase namespace', () => {
  const userId = 'user-1'
  assert.equal(
    isOwnedAssessmentImportFile(
      'cloud://env.bucket/assessment-imports/user-1/123-resume.pdf',
      userId,
    ),
    true,
  )
  assert.equal(
    isOwnedAssessmentImportFile(
      'cloud://env.bucket/assessment-imports/user-2/123-resume.pdf',
      userId,
    ),
    false,
  )
  assert.equal(
    isOwnedAssessmentImportFile('https://example.com/resume.pdf', userId),
    false,
  )
})

test('assessment material import structures extracted text and preserves extractor warnings', async () => {
  const service = createAssessmentImportService(
    env,
    extractor(),
    provider(),
  )

  const result = await service.parse({
    fileID: 'cloud://env.bucket/assessment-imports/user-1/123-resume.pdf',
    fileName: 'resume.pdf',
    sourceType: 'document',
    userId: 'user-1',
  })

  assert.equal(service.configured, true)
  assert.equal(result.candidate.profile.university, '中南大学')
  assert.equal(result.candidate.research.length, 1)
  assert.equal(result.candidate.warnings.includes('请人工确认关键字段。'), true)
  assert.match(result.summary, /基础信息/)
  assert.match(result.summary, /科研 1 条/)
})

test('assessment material import retries one schema-invalid structure result', async () => {
  let calls = 0
  const retryProvider: JsonModelProvider = {
    provider: 'mock',
    model: 'mock',
    isConfigured: () => true,
    async generateJson() {
      calls += 1
      return calls === 1 ? { wrong: true } : candidate
    },
  }

  const service = createAssessmentImportService(
    env,
    extractor(),
    retryProvider,
  )
  const result = await service.parse({
    fileID: 'cloud://env.bucket/assessment-imports/user-1/123-resume.docx',
    fileName: 'resume.docx',
    sourceType: 'document',
    userId: 'user-1',
  })

  assert.equal(calls, 2)
  assert.equal(result.candidate.profile.major, '能源与动力工程')
})

test('assessment material import rejects non-owned files before extraction', async () => {
  let extracted = false
  const guardedExtractor: MaterialDocumentExtractor = {
    configured: true,
    async extract() {
      extracted = true
      return {
        text: 'should not run',
        parser: 'tencent-multimodal-doc-parse',
        warnings: [],
      }
    },
    async cleanup() {},
  }

  const service = createAssessmentImportService(
    env,
    guardedExtractor,
    provider(),
  )

  await assert.rejects(
    service.parse({
      fileID: 'cloud://env.bucket/assessment-imports/other/123-resume.pdf',
      fileName: 'resume.pdf',
      sourceType: 'document',
      userId: 'user-1',
    }),
    /assessment_import_file_not_owned/,
  )
  assert.equal(extracted, false)
})
