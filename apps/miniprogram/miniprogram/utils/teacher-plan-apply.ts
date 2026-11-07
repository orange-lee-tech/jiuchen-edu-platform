import type { ClassroomPlanType, PlanEditorItem } from './request'
import { normalizePlanDraft } from './plan-editor-form'

export type TeacherPlanPayload = { stageCode: string; type: ClassroomPlanType; title: string; items: PlanEditorItem[] }
export type TeacherApplyResult = { studentId: string; ok: boolean; error?: string; planId?: string }
export type TeacherApplyDisplayRow = TeacherApplyResult & { name: string; message: string }

export function buildTeacherPlanPayload(stageCode: string, type: ClassroomPlanType, title: string, items: PlanEditorItem[]) {
  if (!stageCode || !type) return { ok: false as const, message: '请先选择有效的阶段和计划类型' }
  if (items.some(item => !item.name.trim())) return { ok: false as const, message: '请填写规划名称和每个任务名称' }
  const normalized = normalizePlanDraft(title, items)
  if (!normalized.ok) return normalized
  return { ok: true as const, value: { stageCode, type, ...normalized.value } }
}

function safeErrorCode(value: unknown) {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(value) ? value : 'unknown_error'
}

function failureMessage(code: string) {
  if (code === 'student_not_assigned') return '分配关系已失效，未写入'
  if (code === 'teacher_schema_not_ready') return '教师规划数据结构未就绪，未写入'
  if (code === 'plan_save_failed') return '服务端保存失败（plan_save_failed），未写入'
  return `未写入（${code}）`
}

export function presentTeacherApplyResults(
  responseResults: unknown,
  targetIds: string[],
  students: Array<{ studentId: string; name: string }>,
): { rows: TeacherApplyDisplayRow[]; successCount: number; failedCount: number } | null {
  if (!Array.isArray(responseResults)) return null
  const byId = new Map<string, TeacherApplyResult>()
  for (const value of responseResults) {
    if (!value || typeof value !== 'object') continue
    const row = value as TeacherApplyResult
    if (typeof row.studentId === 'string' && !byId.has(row.studentId)) byId.set(row.studentId, row)
  }
  const uniqueTargets = [...new Set(targetIds)]
  const rows = uniqueTargets.map(studentId => {
    const result = byId.get(studentId)
    const ok = result?.ok === true
    const error = result?.ok === false ? safeErrorCode(result.error) : undefined
    return {
      studentId, ok, error, planId: result?.planId,
      name: students.find(student => student.studentId === studentId)?.name || '学员',
      message: ok ? '已保存独立规划' : failureMessage(error || 'result_missing'),
    }
  })
  return { rows, successCount: rows.filter(row => row.ok).length, failedCount: rows.filter(row => !row.ok).length }
}

export function remainingTeacherApplyTargets(targetIds: string[], completedIds: string[]) {
  const completed = new Set(completedIds)
  return [...new Set(targetIds)].filter(id => !completed.has(id))
}
