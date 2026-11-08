import type { CanonicalGrowthRecord, CourseAcademicFact, CourseGradeScale, ParsedScheduleCourse } from '../../utils/request'

export const GRADE_OPTIONS: Array<{ value: CourseGradeScale; label: string }> = [
  { value: 'unset', label: '未录入成绩' }, { value: 'percentage', label: '百分制' },
  { value: 'four_point', label: '四分制' }, { value: 'five_point', label: '五分制' },
  { value: 'letter', label: '字母等级' }, { value: 'pass_fail', label: '通过情况' },
  { value: 'other', label: '其他计分制' },
]

export function courseFactFromGrowthRecord(record: CanonicalGrowthRecord): CourseAcademicFact | null {
  const metadata = record.metadata
  if (record.type !== 'course' || record.source.type !== 'classroom' || !record.confirmations.user ||
    metadata?.schemaVersion !== 'course-academic-fact-v1' ||
    typeof metadata.stageCode !== 'string' || !/^(freshman|sophomore|junior|senior)-(fall|spring)$/.test(metadata.stageCode) ||
    typeof metadata.courseKey !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(metadata.courseKey) ||
    !GRADE_OPTIONS.some(option => option.value === metadata.gradeScale) ||
    !(metadata.credits === null || typeof metadata.credits === 'number' && metadata.credits >= 0 && metadata.credits <= 30) ||
    !(metadata.gradeValue === null || typeof metadata.gradeValue === 'string')) return null
  return {
    recordId: record.id, title: record.title, updatedAt: record.updatedAt,
    schemaVersion: 'course-academic-fact-v1', stageCode: metadata.stageCode,
    courseKey: metadata.courseKey, credits: metadata.credits as number | null,
    gradeScale: metadata.gradeScale as CourseGradeScale, gradeValue: metadata.gradeValue as string | null,
  }
}

export type CourseContext = { owner: string; importId: string; stageCode: string }
export const sameCourseContext = (expected: CourseContext, current: CourseContext): boolean =>
  expected.owner === current.owner && expected.importId === current.importId && expected.stageCode === current.stageCode

export type FactDraft = { credits: string; gradeScale: CourseGradeScale; gradeValue: string }
export const emptyFactDraft = (): FactDraft => ({ credits: '', gradeScale: 'unset', gradeValue: '' })
export function factDraftFrom(fact?: CourseAcademicFact): FactDraft {
  return fact ? {
    credits: fact.credits === null ? '' : String(fact.credits),
    gradeScale: fact.gradeScale,
    gradeValue: fact.gradeValue ?? '',
  } : emptyFactDraft()
}

export function courseAssociationOptions(courses: ParsedScheduleCourse[], facts: CourseAcademicFact[], currentKey?: string, stageCode?: string) {
  const names = new Map<string, string>()
  for (const fact of facts) {
    if (!stageCode || fact.stageCode === stageCode) names.set(fact.courseKey, fact.title)
  }
  for (const course of courses) {
    if (course.courseKey && !names.has(course.courseKey)) names.set(course.courseKey, course.name)
  }
  return [...names].filter(([key]) => key !== currentKey).map(([key, name]) => ({ key, label: name }))
}

/** Keep the client form aligned with the API's strict grade contract before writing a timetable. */
export function factDraftError(draft: FactDraft): string | null {
  if (parseCredits(draft.credits) === undefined) return '学分需为 0–30，最多两位小数。'
  const value = draft.gradeValue.trim()
  if (draft.gradeScale === 'unset') return value ? '未录入成绩时请清空成绩内容。' : null
  if (!value) return null
  if (['percentage', 'four_point', 'five_point'].includes(draft.gradeScale)) {
    const maximum = draft.gradeScale === 'percentage' ? 100 : draft.gradeScale === 'four_point' ? 4 : 5
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(value) || Number(value) > maximum) {
      return '成绩超出所选计分制的范围，或超过两位小数。'
    }
  } else if (draft.gradeScale === 'letter' && !['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F'].includes(value)) {
    return '字母成绩格式无效，请按 A、B+ 等等级填写。'
  } else if (draft.gradeScale === 'pass_fail' && !['通过', '未通过'].includes(value)) {
    return '通过情况只接受“通过”或“未通过”。'
  }
  if (value.length > 80) return '成绩内容不能超过 80 字。'
  return null
}

export function parseCredits(value: string): number | null | undefined {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^(?:\d{1,2})(?:\.\d{1,2})?$/.test(trimmed)) return undefined
  const credits = Number(trimmed)
  return credits <= 30 ? credits : undefined
}

export async function saveCourseSteps<T>(
  saveSchedule: () => Promise<boolean>,
  readCourseKey: () => string | undefined,
  saveFact?: (courseKey: string) => Promise<T>,
): Promise<
  { status: 'schedule-failed' } | { status: 'key-missing' } |
  { status: 'fact-failed'; error: unknown; courseKey: string } |
  { status: 'saved'; courseKey: string; fact?: T }
> {
  if (!await saveSchedule()) return { status: 'schedule-failed' }
  const courseKey = readCourseKey()
  if (!courseKey) return { status: 'key-missing' }
  if (!saveFact) return { status: 'saved', courseKey }
  try {
    return { status: 'saved', courseKey, fact: await saveFact(courseKey) }
  } catch (error) {
    return { status: 'fact-failed', error, courseKey }
  }
}
