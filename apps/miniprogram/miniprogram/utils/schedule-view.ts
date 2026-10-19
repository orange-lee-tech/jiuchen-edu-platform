import type { ParsedSchedule, ParsedScheduleCourse } from './request'

export function currentWeekFromStart(value: string | null | undefined, today = new Date()) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 0
  const calendarDate = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== value) return 0
  const start = new Date(`${value}T00:00:00+08:00`)
  if (Number.isNaN(start.getTime())) return 0
  const diff = today.getTime() - start.getTime()
  return diff < 0 ? 0 : Math.floor(diff / 604800000) + 1
}
export function weekMatches(value: string | null, week: number) {
  if (!value || week <= 0) return true
  const normalized = value.replace(/第|星期|周次|周/g, '').replace(/至|—|–|~|～/g, '-').replace(/，|、/g, ',')
  if (/单/.test(normalized) && week % 2 === 0) return false
  if (/双/.test(normalized) && week % 2 !== 0) return false
  const ranges = [...normalized.matchAll(/(\d+)\s*-\s*(\d+)/g)]
  if (ranges.some((m) => week >= Number(m[1]) && week <= Number(m[2]))) return true
  const singles = normalized.replace(/\d+\s*-\s*\d+/g, '').match(/\d+/g)?.map(Number) ?? []
  return singles.length ? singles.includes(week) : ranges.length === 0
}
export function weeklyScheduleView(schedule: ParsedSchedule | null, today = new Date()) {
  const currentWeek = currentWeekFromStart(schedule?.termStartDate, today)
  const courses = currentWeek > 0 ? (schedule?.courses || []).filter(c => weekMatches(c.weeks, currentWeek)) : []
  const visibleCourses = [...courses].sort((a, b) => a.dayIndex - b.dayIndex || (a.startSection ?? 99) - (b.startSection ?? 99))
  const state = !schedule ? 'missing' : !currentWeek ? 'date' : !courses.length ? 'empty' : 'ready'
  return { currentWeek, visibleCourses, state, currentWeekLabel: currentWeek ? `第 ${currentWeek} 周` : !schedule ? '尚未导入课表' : '请设置本学期第一周周一' }
}
export function courseTimeLabel(course: ParsedScheduleCourse) {
  return course.slot || (course.startSection ? `第${course.startSection}${course.endSection && course.endSection !== course.startSection ? '-' + course.endSection : ''}节` : course.time || '节次待确认')
}
