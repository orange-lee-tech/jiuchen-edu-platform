import type { CourseAcademicFact, CourseGradeScale, ParsedScheduleCourse } from '../../utils/request'

export type FactDraft = { credits: string; gradeScale: CourseGradeScale; gradeValue: string }
export const emptyFactDraft = (): FactDraft => ({ credits: '', gradeScale: 'unset', gradeValue: '' })
export function factDraftFrom(fact?: CourseAcademicFact): FactDraft {
  return fact ? {
    credits: fact.credits === null ? '' : String(fact.credits),
    gradeScale: fact.gradeScale,
    gradeValue: fact.gradeValue ?? '',
  } : emptyFactDraft()
}

export function courseAssociationOptions(courses: ParsedScheduleCourse[], facts: CourseAcademicFact[], currentKey?: string) {
  const names = new Map<string, string>()
  for (const fact of facts) names.set(fact.courseKey, fact.title)
  for (const course of courses) {
    if (course.courseKey && !names.has(course.courseKey)) names.set(course.courseKey, course.name)
  }
  return [...names].filter(([key]) => key !== currentKey).map(([key, name]) => ({ key, label: name }))
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
