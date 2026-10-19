import { z } from 'zod'
import { assessmentInputSchema } from './assessment.js'

export const GROWTH_PROFILE_SCHEMA_VERSION = 'growth-profile-v1'
export const RESUME_PROJECTION_VERSION = 'resume-projection-v1'
export const APPLICATION_PROJECTION_VERSION = 'application-projection-v1'

export const growthRecordTypeSchema = z.enum([
  'course',
  'language',
  'research',
  'publication',
  'competition',
  'project',
  'internship',
  'campus',
  'award',
  'skill',
  'other',
])

export type GrowthRecordType = z.infer<typeof growthRecordTypeSchema>

const optionalText = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional()

export const growthRecordInputSchema = z
  .object({
    type: growthRecordTypeSchema,
    title: z.string().trim().min(1).max(220),
    organization: optionalText(220),
    role: optionalText(160),
    startDate: optionalText(32),
    endDate: optionalText(32),
    description: optionalText(2000),
    result: optionalText(1200),
    evidence: z.array(z.record(z.string(), z.unknown())).max(20).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

export type GrowthRecordInput = z.infer<typeof growthRecordInputSchema>

export type CanonicalGrowthRecord = GrowthRecordInput & {
  id: string
  standardExpression: string
  source: {
    type: 'manual' | 'assessment' | 'classroom' | 'admin'
    recordId: string | null
    key: string
  }
  confirmations: {
    user: boolean
    teacher: boolean
    admin: boolean
  }
  updatedAt: string
}

export type CanonicalProfile = {
  schemaVersion: typeof GROWTH_PROFILE_SCHEMA_VERSION
  identity: {
    displayName: string | null
    university: string | null
    major: string | null
    currentGrade: string | null
    gpaText: string | null
    rankText: string | null
  }
  records: CanonicalGrowthRecord[]
}

function compact(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
}

export function buildStandardExpression(record: GrowthRecordInput) {
  const subject = compact([
    record.role ? `${record.role}参与` : null,
    record.title,
    record.organization ? `（${record.organization}）` : null,
  ]).join('')

  const details = compact([record.description, record.result])
  if (!details.length) return subject
  return `${subject}：${details.join('；')}`
}

const languageLabels: Record<string, string> = {
  cet4: 'CET-4',
  cet6: 'CET-6',
  ielts: 'IELTS',
  toefl: 'TOEFL',
  gre: 'GRE',
  other: '其他语言成绩',
}

export type GrowthImportCandidate = {
  candidateKey: string
  record: GrowthRecordInput
  standardExpression: string
}

export function assessmentToGrowthCandidates(input: unknown): GrowthImportCandidate[] {
  const parsed = assessmentInputSchema.safeParse(input)
  if (!parsed.success) return []

  const candidates: GrowthImportCandidate[] = []

  parsed.data.english.forEach((item, index) => {
    const record: GrowthRecordInput = {
      type: 'language',
      title: languageLabels[item.type] ?? item.type,
      result: item.score,
      description: item.note ?? null,
      metadata: {
        testType: item.type,
        score: item.score,
      },
    }
    candidates.push({
      candidateKey: `english:${index}`,
      record,
      standardExpression: buildStandardExpression(record),
    })
  })

  parsed.data.research.forEach((item, index) => {
    const type: GrowthRecordType =
      item.type === 'paper' ? 'publication' : 'research'
    const record: GrowthRecordInput = {
      type,
      title: item.title,
      organization: item.organization ?? null,
      role: item.role ?? null,
      description: item.description ?? null,
      result: item.output ?? null,
      metadata: {
        researchType: item.type ?? null,
        achievementTier: item.achievementTier ?? null,
        level: item.level ?? null,
      },
    }
    candidates.push({
      candidateKey: `research:${index}`,
      record,
      standardExpression: buildStandardExpression(record),
    })
  })

  parsed.data.competitions.forEach((item, index) => {
    const record: GrowthRecordInput = {
      type: 'competition',
      title: item.name,
      role: item.role ?? null,
      description: item.description ?? null,
      result: item.award ?? null,
      metadata: {
        level: item.level ?? null,
      },
    }
    candidates.push({
      candidateKey: `competition:${index}`,
      record,
      standardExpression: buildStandardExpression(record),
    })
  })

  return candidates
}

const targetWeights: Record<
  'general' | 'technical' | 'academic',
  Partial<Record<GrowthRecordType, number>>
> = {
  general: {
    internship: 10,
    project: 9,
    research: 8,
    competition: 7,
    award: 6,
    campus: 5,
    language: 4,
    skill: 4,
    publication: 4,
    course: 2,
    other: 1,
  },
  technical: {
    project: 10,
    internship: 10,
    research: 9,
    competition: 8,
    skill: 8,
    publication: 6,
    award: 5,
    language: 4,
    course: 3,
    campus: 2,
    other: 1,
  },
  academic: {
    research: 10,
    publication: 10,
    competition: 8,
    award: 7,
    project: 6,
    language: 6,
    course: 5,
    internship: 3,
    skill: 3,
    campus: 2,
    other: 1,
  },
}

export const resumeProjectionOptionsSchema = z
  .object({
    target: z.enum(['general', 'technical', 'academic']).default('general'),
    language: z.literal('zh-CN').default('zh-CN'),
    length: z.enum(['one-page', 'detailed']).default('one-page'),
  })
  .strict()

export function buildResumeProjection(
  profile: CanonicalProfile,
  options: z.infer<typeof resumeProjectionOptionsSchema>,
) {
  const weights = targetWeights[options.target]
  const maxRecords = options.length === 'one-page' ? 8 : 20

  const records = [...profile.records]
    .sort((a, b) => {
      const weightDiff = (weights[b.type] ?? 0) - (weights[a.type] ?? 0)
      if (weightDiff) return weightDiff
      return b.updatedAt.localeCompare(a.updatedAt)
    })
    .slice(0, maxRecords)

  return {
    version: RESUME_PROJECTION_VERSION,
    options,
    identity: profile.identity,
    education: profile.identity.university
      ? {
          school: profile.identity.university,
          major: profile.identity.major,
          grade: profile.identity.currentGrade,
          gpa: profile.identity.gpaText,
          rank: profile.identity.rankText,
          sourceRefs: [
            'profile:university',
            'profile:major',
            'profile:currentGrade',
            'profile:gpaText',
            'profile:rankText',
          ],
        }
      : null,
    entries: records.map((record) => ({
      id: record.id,
      type: record.type,
      title: record.title,
      organization: record.organization ?? null,
      role: record.role ?? null,
      startDate: record.startDate ?? null,
      endDate: record.endDate ?? null,
      text: record.standardExpression,
      sourceRefs: [`growth:${record.id}`, record.source.key],
    })),
  }
}

export const GENERIC_RECRUITMENT_SCHEMA = {
  key: 'generic-recruitment-v1',
  fields: [
    'name',
    'school',
    'major',
    'currentGrade',
    'gpa',
    'rank',
    'languages',
    'research',
    'projects',
    'competitions',
    'internships',
    'awards',
    'skills',
    'selfIntroduction',
  ],
} as const

type ApplicationFieldStatus = 'matched' | 'needs_confirmation' | 'missing'

function recordField(
  key: string,
  label: string,
  records: CanonicalGrowthRecord[],
) {
  if (!records.length) {
    return { key, label, status: 'missing' as ApplicationFieldStatus, value: null, sourceRefs: [] }
  }
  return {
    key,
    label,
    status: 'matched' as ApplicationFieldStatus,
    value: records.map((record) => record.standardExpression),
    sourceRefs: records.map((record) => `growth:${record.id}`),
  }
}

function scalarField(
  key: string,
  label: string,
  value: string | null,
  sourceRef: string,
) {
  return {
    key,
    label,
    status: value ? ('matched' as ApplicationFieldStatus) : ('missing' as ApplicationFieldStatus),
    value,
    sourceRefs: value ? [sourceRef] : [],
  }
}

export function buildApplicationProjection(profile: CanonicalProfile) {
  const byType = (types: GrowthRecordType[]) =>
    profile.records.filter((record) => types.includes(record.type))

  const introFacts = compact([
    profile.identity.university,
    profile.identity.major,
    profile.records[0]?.standardExpression,
  ])

  return {
    version: APPLICATION_PROJECTION_VERSION,
    schemaKey: GENERIC_RECRUITMENT_SCHEMA.key,
    fields: [
      scalarField('name', '姓名', profile.identity.displayName, 'profile:displayName'),
      scalarField('school', '毕业院校', profile.identity.university, 'profile:university'),
      scalarField('major', '专业', profile.identity.major, 'profile:major'),
      scalarField('currentGrade', '当前年级', profile.identity.currentGrade, 'profile:currentGrade'),
      scalarField('gpa', 'GPA / 均分', profile.identity.gpaText, 'profile:gpaText'),
      scalarField('rank', '专业排名', profile.identity.rankText, 'profile:rankText'),
      recordField('languages', '语言成绩', byType(['language'])),
      recordField('research', '科研经历', byType(['research', 'publication'])),
      recordField('projects', '项目经历', byType(['project'])),
      recordField('competitions', '竞赛经历', byType(['competition'])),
      recordField('internships', '实习经历', byType(['internship'])),
      recordField('awards', '荣誉奖项', byType(['award'])),
      recordField('skills', '技能', byType(['skill'])),
      {
        key: 'selfIntroduction',
        label: '自我介绍',
        status: introFacts.length
          ? ('needs_confirmation' as ApplicationFieldStatus)
          : ('missing' as ApplicationFieldStatus),
        value: introFacts.length ? introFacts.join('；') : null,
        sourceRefs: introFacts.length
          ? ['profile:university', 'profile:major', ...(profile.records[0] ? [`growth:${profile.records[0].id}`] : [])]
          : [],
      },
    ],
  }
}
