import type { GrowthRecordInput } from './request'

/** Build the strict API payload without server-owned record metadata. */
export function normalizeGrowthRecordInput(form: GrowthRecordInput): GrowthRecordInput {
  return { type: form.type, title: form.title.trim(), organization: form.organization?.trim() || null, role: form.role?.trim() || null,
    startDate: form.startDate?.trim() || null, endDate: form.endDate?.trim() || null, description: form.description?.trim() || null, result: form.result?.trim() || null }
}
