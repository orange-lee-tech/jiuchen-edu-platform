import type { PlanEditorItem } from './request'

export type NormalizedPlan = { title: string; items: PlanEditorItem[] }
export type PlanValidation = { ok: true; value: NormalizedPlan } | { ok: false; message: string }

/** Shared client normalization for both the full editor and the inline classroom editor. */
export function normalizePlanDraft(titleValue: string, sourceItems: PlanEditorItem[]): PlanValidation {
  const title = titleValue.trim()
  if (!title) return { ok: false, message: '请填写计划名称' }
  if (sourceItems.length > 50) return { ok: false, message: '计划最多添加 50 条任务' }
  const items = sourceItems.map(item => ({
    name: item.name.trim(),
    target: item.target?.trim() || null,
    dueDate: item.dueDate || null,
    status: item.status,
  })).filter(item => item.name)
  return { ok: true, value: { title, items } }
}
