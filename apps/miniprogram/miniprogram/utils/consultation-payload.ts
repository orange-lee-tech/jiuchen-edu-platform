import type { AcademicProfile } from './request'
import { buildAssessmentReportPlainText, type AssessmentReportExportContext } from './assessment-report-export'

export function beijingDate(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10)
}

const field = (value: string | number | null | undefined) =>
  value === null || value === undefined || String(value).trim() === '' ? '未填写' : String(value).trim()

export function buildSchoolConsultation(school: string, identity: {
  userId?: string; displayName?: string | null; bound: boolean
}, profile: AcademicProfile | null, date = beijingDate()): string {
  return [
    '【九辰教育｜院校咨询】', '', `咨询院校：${school}`, '',
    '【学员基本信息】',
    ...(identity.bound ? [
      `学员：${identity.displayName?.trim() || '某学员'}`,
      `用户ID：${field(identity.userId)}`,
      `本科院校：${field(profile?.university)}`, `本科专业：${field(profile?.major)}`,
      `当前年级：${field(profile?.currentGrade)}`, `入学年份：${field(profile?.enrollmentYear)}`,
      ...(!profile ? ['学业资料暂未读取到，请在咨询时补充。'] : []),
    ] : ['身份资料尚未绑定']), '',
    '【咨询说明】', '我希望了解该院校的保研申请条件、专业方向及相关准备建议。', '',
    `生成日期：${date}`,
  ].join('\n')
}

export function buildAssessmentConsultation(context: AssessmentReportExportContext, userId: string): string {
  if (context.assessment.status !== 'succeeded' || !context.assessment.output) throw new Error('报告尚未生成')
  return ['【九辰教育｜AI 评估咨询】', `用户ID：${userId}`, `评估编号：${context.assessment.id}`, '',
    buildAssessmentReportPlainText(context), '', '【咨询说明】', '希望老师针对以上评估结果给予进一步指导。'].join('\n')
}
