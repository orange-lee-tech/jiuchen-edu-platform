import type { AcademicProfile } from './request'
import type { AssessmentReportExportContext } from './assessment-report-export'

export function beijingDate(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10)
}

const field = (value: string | number | null | undefined) =>
  value === null || value === undefined || String(value).trim() === '' ? '未填写' : String(value).trim()

export function buildSchoolConsultation(school: string, identity: {
  userId?: string; displayName?: string | null; bound: boolean
}, profile: AcademicProfile | null, date = beijingDate()): string {
  return [
    '九辰教育咨询', '',
    `学校：${field(school)}`, '',
    `学生：${identity.bound ? field(identity.displayName) : '未认领'}`, '',
    `用户ID：${identity.bound ? field(identity.userId) : '未认领'}`, '',
    `学校阶段：${field(profile?.currentGrade)}`, '',
    `专业：${field(profile?.major)}`, '',
    '咨询问题：请填写', '',
    `生成日期：${date}`,
  ].join('\n')
}

export function buildAssessmentConsultation(context: AssessmentReportExportContext, userId: string): string {
  const output = context.assessment.output
  if (context.assessment.status !== 'succeeded' || !output) throw new Error('报告尚未生成')
  const { assessment } = context
  const completed = assessment.completedAt || assessment.updatedAt
  const parsed = completed ? new Date(completed) : null
  const date = parsed && !Number.isNaN(parsed.getTime()) ? beijingDate(parsed) : '未记录'
  const advice = output.recommendedActions.slice(0, 3)
    .map(item => `${field(item.title)}：${field(item.rationale)}`).join('\n')
  const risks = output.risks.slice(0, 3)
    .map(item => `${field(item.title)}：${field(item.detail)}`).join('\n')
  return [
    '九辰AI评估咨询', '',
    `学生：${field(context.displayName)}`, '',
    `UID：${field(userId)}`, '',
    `日期：${date}`, '',
    '评估摘要：', field(output.profileSummary), '',
    '核心建议：', advice || '暂无明确建议', '',
    '风险提示：', risks || '暂无明确风险提示',
  ].join('\n')
}
