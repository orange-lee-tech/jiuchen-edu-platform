import { getSavedAuthResult } from '../../utils/auth'
import {
  getMyAssessment,
  type AssessmentOutput,
  type AssessmentRecord,
} from '../../utils/request'

const TIER_VIEW = {
  reach: { label: '冲刺', tone: 'reach' },
  match: { label: '匹配', tone: 'match' },
  conservative: { label: '稳妥', tone: 'conservative' },
  insufficient_data: { label: '信息不足', tone: 'insufficient' },
} as const

type ResultView = AssessmentOutput & {
  targetAssessments: Array<AssessmentOutput['targetAssessments'][number] & {
    tierLabel: string
    tierTone: string
  }>
  recommendedActions: Array<AssessmentOutput['recommendedActions'][number] & {
    priorityLabel: string
  }>
}

Page({
  data: {
    loading: true,
    error: '',
    assessment: null as AssessmentRecord | null,
    output: null as ResultView | null,
  },

  onLoad(query: Record<string, string | undefined>) {
    if (!getSavedAuthResult()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    const id = query.id ? decodeURIComponent(query.id) : ''
    if (!id) {
      this.setData({ loading: false, error: '缺少评估记录 ID' })
      return
    }
    void this.loadResult(id)
  },

  async loadResult(id: string) {
    try {
      const assessment = await getMyAssessment(id)
      if (assessment.status !== 'succeeded' || !assessment.output) {
        this.setData({ error: '该评估尚未生成可查看的报告' })
        return
      }
      const output: ResultView = {
        ...assessment.output,
        targetAssessments: assessment.output.targetAssessments.map((target) => ({
          ...target,
          tierLabel: TIER_VIEW[target.tier].label,
          tierTone: TIER_VIEW[target.tier].tone,
        })),
        recommendedActions: assessment.output.recommendedActions.map((action) => ({
          ...action,
          priorityLabel: action.priority === 'high' ? '优先' : action.priority === 'medium' ? '重要' : '建议',
        })),
      }
      this.setData({ assessment, output })
    } catch (error) {
      console.info('Assessment result load failed.', error)
      this.setData({ error: '评估报告加载失败，请稍后重试' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onViewHistory() {
    wx.redirectTo({ url: '/pages/assessment-history/assessment-history' })
  },
})
