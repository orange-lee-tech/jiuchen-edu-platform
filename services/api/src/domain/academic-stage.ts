/** A calendar-based suggestion for ordinary four-year study, never an automatic write. */
export function suggestAcademicStage(enrollmentYear: number | null, now = new Date(), currentGrade: string | null = null): string | null {
  if (!Number.isInteger(enrollmentYear) || !Number.isFinite(now.getTime())) return null
  const china = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const year = china.getUTCFullYear()
  const month = china.getUTCMonth() + 1
  const studyYear = year - (enrollmentYear as number) + (month >= 9 ? 1 : 0)
  if (studyYear < 1 || studyYear > 4) return null
  const expectedGrade = ['大一', '大二', '大三', '大四'][studyYear - 1]
  if (!currentGrade || !new RegExp(`^${expectedGrade}(?:上|下)?$`).test(currentGrade.trim())) return null
  const ordinal = ['freshman', 'sophomore', 'junior', 'senior'][studyYear - 1]
  const season = month >= 9 ? 'fall' : month <= 2 ? 'winter' : month <= 6 ? 'spring' : 'summer'
  if (ordinal === 'senior' && season === 'summer') return null
  return `${ordinal}-${season}`
}
