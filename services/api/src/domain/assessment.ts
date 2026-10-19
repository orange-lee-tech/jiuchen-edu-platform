import { z } from 'zod'

export const ASSESSMENT_INPUT_SCHEMA_VERSION = 'assessment-input-v1'
export const ASSESSMENT_OUTPUT_SCHEMA_VERSION = 'assessment-output-v1'
export const ASSESSMENT_AGENT_VERSION = 'assessment-agent-v3'

const nullableShortText = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional()

const levelSchema = z
  .enum(['school', 'provincial', 'national', 'international', 'other'])
  .nullable()
  .optional()

export const englishRecordSchema = z
  .object({
    type: z.enum(['cet4', 'cet6', 'ielts', 'toefl', 'gre', 'other']),
    score: z.string().trim().min(1).max(80),
    note: nullableShortText(255),
  })
  .strict()

export const researchExperienceSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    type: z
      .enum(['project', 'paper', 'patent', 'lab', 'other'])
      .nullable()
      .optional(),
    achievementTier: z
      .enum(['Nature', 'Science', 'SCI/SSCI', 'EI', '普通期刊', '科研项目', '专利/软著', '其他'])
      .nullable()
      .optional(),
    role: nullableShortText(120),
    organization: nullableShortText(160),
    level: levelSchema,
    description: nullableShortText(1000),
    output: nullableShortText(500),
  })
  .strict()

export const competitionExperienceSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    level: levelSchema,
    award: nullableShortText(160),
    role: nullableShortText(120),
    description: nullableShortText(800),
  })
  .strict()

export const targetProgramSchema = z
  .object({
    schoolName: z.string().trim().min(1).max(160),
    programName: nullableShortText(160),
    researchDirection: nullableShortText(160),
    note: nullableShortText(500),
  })
  .strict()

export const assessmentInputSchema = z
  .object({
    profile: z
      .object({
        university: z.string().trim().min(1).max(160),
        major: z.string().trim().min(1).max(160),
        currentGrade: z.string().trim().min(1).max(40),
        gpaText: nullableShortText(80),
        rankText: nullableShortText(80),
        backgroundNote: nullableShortText(1000),
      })
      .strict(),
    english: z.array(englishRecordSchema).max(6).default([]),
    research: z.array(researchExperienceSchema).max(12).default([]),
    competitions: z.array(competitionExperienceSchema).max(12).default([]),
    targets: z.array(targetProgramSchema).min(1).max(5),
    contextOptions: z.object({
      includePlanning: z.boolean().optional(),
      includeRecentAssessments: z.boolean().optional(),
    }).strict().optional(),
    preferences: z
      .object({
        preferredRegions: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
        researchDirection: nullableShortText(200),
        note: nullableShortText(1000),
      })
      .strict()
      .optional(),
  })
  .strict()

const evidenceReferenceSchema = z.string().trim().min(1).max(120)

const findingSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    detail: z.string().trim().min(1).max(1000),
    evidenceRefs: z.array(evidenceReferenceSchema).min(1).max(12),
  })
  .strict()

const targetAssessmentSchema = z
  .object({
    schoolName: z.string().trim().min(1).max(160),
    programName: nullableShortText(160),
    tier: z.enum(['reach', 'match', 'conservative', 'insufficient_data']),
    rationale: z.string().trim().min(1).max(1600),
    gapItems: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
    actions: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
    evidenceRefs: z.array(evidenceReferenceSchema).min(1).max(20),
  })
  .strict()

const actionSchema = z
  .object({
    priority: z.enum(['high', 'medium', 'low']),
    title: z.string().trim().min(1).max(160),
    rationale: z.string().trim().min(1).max(800),
    timeframe: nullableShortText(120),
  })
  .strict()

const similarCaseSchema = z
  .object({
    caseId: z.string().trim().min(1).max(120),
    sourceType: z.enum(['jiuchen', 'external']),
    similarityReason: z.string().trim().min(1).max(1000),
    resultSummary: z.string().trim().min(1).max(800),
    evidenceRef: evidenceReferenceSchema,
  })
  .strict()

const assessmentOutputBaseSchema = z
  .object({
    profileSummary: z.string().trim().min(1).max(1800),
    strengths: z.array(findingSchema).max(12).default([]),
    risks: z.array(findingSchema).max(12).default([]),
    targetAssessments: z.array(targetAssessmentSchema).min(1).max(5),
    recommendedActions: z.array(actionSchema).max(20).default([]),
    similarCases: z.array(similarCaseSchema).max(10).default([]),
    uncertainties: z.array(z.string().trim().min(1).max(800)).max(12).default([]),
    disclaimer: z.string().trim().min(1).max(1000),
  })
  .strict()


export const assessmentOutputJsonSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    profileSummary: { type: 'string' },
    strengths: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          evidenceRefs: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['title', 'detail', 'evidenceRefs'],
      },
    },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          evidenceRefs: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['title', 'detail', 'evidenceRefs'],
      },
    },
    targetAssessments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          schoolName: { type: 'string' },
          programName: { type: ['string', 'null'] },
          tier: {
            type: 'string',
            enum: ['reach', 'match', 'conservative', 'insufficient_data'],
          },
          rationale: { type: 'string' },
          gapItems: {
            type: 'array',
            items: { type: 'string' },
          },
          actions: {
            type: 'array',
            items: { type: 'string' },
          },
          evidenceRefs: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: [
          'schoolName',
          'programName',
          'tier',
          'rationale',
          'gapItems',
          'actions',
          'evidenceRefs',
        ],
      },
    },
    recommendedActions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          priority: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
          },
          title: { type: 'string' },
          rationale: { type: 'string' },
          timeframe: { type: ['string', 'null'] },
        },
        required: ['priority', 'title', 'rationale', 'timeframe'],
      },
    },
    similarCases: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          caseId: { type: 'string' },
          sourceType: {
            type: 'string',
            enum: ['jiuchen', 'external'],
          },
          similarityReason: { type: 'string' },
          resultSummary: { type: 'string' },
          evidenceRef: { type: 'string' },
        },
        required: [
          'caseId',
          'sourceType',
          'similarityReason',
          'resultSummary',
          'evidenceRef',
        ],
      },
    },
    uncertainties: {
      type: 'array',
      items: { type: 'string' },
    },
    disclaimer: { type: 'string' },
  },
  required: [
    'profileSummary',
    'strengths',
    'risks',
    'targetAssessments',
    'recommendedActions',
    'similarCases',
    'uncertainties',
    'disclaimer',
  ],
}

function containsPreciseAdmissionProbability(value: unknown): boolean {
  if (typeof value === 'string') {
    const forward =
      /(?:录取|上岸|通过|offer|admission|acceptance)[^。.!?]{0,28}\d{1,3}(?:\.\d+)?\s*%/i
    const backward =
      /\d{1,3}(?:\.\d+)?\s*%[^。.!?]{0,28}(?:录取|上岸|通过|offer|admission|acceptance)/i
    return forward.test(value) || backward.test(value)
  }

  if (Array.isArray(value)) {
    return value.some(containsPreciseAdmissionProbability)
  }

  if (value && typeof value === 'object') {
    return Object.values(value).some(containsPreciseAdmissionProbability)
  }

  return false
}

export const assessmentOutputSchema = assessmentOutputBaseSchema.superRefine(
  (value, context) => {
    if (containsPreciseAdmissionProbability(value)) {
      context.addIssue({
        code: 'custom',
        message: 'precise admission probability is not allowed',
      })
    }
  },
)

export const assessmentEvidenceItemSchema = z
  .object({
    ref: evidenceReferenceSchema,
    kind: z.enum(['school', 'program', 'case', 'policy', 'other']),
    sourceType: z.enum(['jiuchen', 'external', 'official', 'internal']),
    sourceId: z.string().trim().min(1).max(160).nullable().optional(),
    title: z.string().trim().min(1).max(255),
    sourceLabel: z.string().trim().min(1).max(255),
    sourceUrl: z.string().url().max(1000).nullable().optional(),
    year: z.number().int().min(2000).max(2100).nullable().optional(),
    excerpt: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .strict()

export type AssessmentInput = z.infer<typeof assessmentInputSchema>
export type AssessmentOutput = z.infer<typeof assessmentOutputSchema>
export type AssessmentEvidenceItem = z.infer<typeof assessmentEvidenceItemSchema>

export function normalizeAssessmentInput(input: unknown): AssessmentInput {
  return assessmentInputSchema.parse(input)
}

export function validateAssessmentOutput(output: unknown): AssessmentOutput {
  return assessmentOutputSchema.parse(output)
}
