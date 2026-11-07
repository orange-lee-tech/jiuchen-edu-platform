import { z } from 'zod'

export const courseStageSchema = z.string().regex(/^(freshman|sophomore|junior|senior)-(fall|spring)$/)
export const courseKeySchema = z.string().uuid()
export const courseGradeScaleSchema = z.enum(['unset', 'percentage', 'four_point', 'five_point', 'letter', 'pass_fail', 'other'])
const creditsSchema = z.number().min(0).max(30).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, 'credits_precision')
const gradeValueSchema = z.string().trim().min(1).max(80).nullable()

export const courseAcademicFactWriteSchema = z.object({
  stageCode: courseStageSchema,
  credits: creditsSchema.nullable(),
  gradeScale: courseGradeScaleSchema,
  gradeValue: gradeValueSchema,
}).strict().superRefine((value, context) => {
  const grade = value.gradeValue
  if (value.gradeScale === 'unset') {
    if (grade !== null) context.addIssue({ code: 'custom', path: ['gradeValue'], message: 'unset_requires_null' })
    return
  }
  if (grade === null) return
  if (['percentage', 'four_point', 'five_point'].includes(value.gradeScale)) {
    const maximum = value.gradeScale === 'percentage' ? 100 : value.gradeScale === 'four_point' ? 4 : 5
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(grade) || Number(grade) > maximum)
      context.addIssue({ code: 'custom', path: ['gradeValue'], message: 'invalid_numeric_grade' })
  } else if (value.gradeScale === 'letter' && !['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F'].includes(grade)) {
    context.addIssue({ code: 'custom', path: ['gradeValue'], message: 'invalid_letter_grade' })
  } else if (value.gradeScale === 'pass_fail' && !['通过', '未通过'].includes(grade)) {
    context.addIssue({ code: 'custom', path: ['gradeValue'], message: 'invalid_pass_fail_grade' })
  }
})

export const courseAcademicFactSchema = z.object({
  schemaVersion: z.literal('course-academic-fact-v1'),
  stageCode: courseStageSchema,
  courseKey: courseKeySchema,
  credits: creditsSchema.nullable(),
  gradeScale: courseGradeScaleSchema,
  gradeValue: gradeValueSchema,
}).strict()

export type CourseAcademicFact = z.infer<typeof courseAcademicFactSchema>
export type CourseAcademicFactWrite = z.infer<typeof courseAcademicFactWriteSchema>

export function courseFactSourceKey(userId: string, stageCode: string, courseKey: string) {
  return `course:${userId}:${stageCode}:${courseKey}`
}

export function isProtectedCourseFact(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (value as Record<string, unknown>).schemaVersion === 'course-academic-fact-v1')
}
