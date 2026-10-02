import { getSavedAuthResult } from '../../utils/auth'
import {
  getMyAssessments,
  type AssessmentRecord,
} from '../../utils/request'

type AssessmentListItem = AssessmentRecord & {
  targetSummary: string
  statusLabel: string
  statusTone: string
  dateLabel: string
}

const STATUS_VIEW = {
  draft: { label: '草稿', tone: 'neutral' },
  running: { label: '分析中', tone: 'progress' },
  succeeded: { label: '已完成', tone: 'success' },
  failed: { label: '运行失败', tone: 'danger' },
} as const

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

Page({
  data: {
    loading: true,
    assessments: [] as AssessmentListItem[],
  },

  onShow() {
    const auth = getSavedAuthResult()
    if (!auth) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    void this.loadAssessments()
  },

  async loadAssessments() {
    try {
      this.setData({ loading: true })
      const rows = await getMyAssessments()
      const assessments = rows.map((row) => {
        const status = STATUS_VIEW[row.status]
        return {
          ...row,
          targetSummary: row.input.targets
            .map((target) => target.programName
              ? `${target.schoolName} · ${target.programName}`
              : target.schoolName)
            .join('、'),
          statusLabel: status.label,
          statusTone: status.tone,
          dateLabel: formatDate(row.completedAt || row.createdAt),
        }
      })
      this.setData({ assessments })
    } catch (error) {
      console.info('Assessment history load failed.', error)
      wx.showToast({ title: '历史评估加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onAssessmentTap(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    const status = String(event.currentTarget.dataset.status || '')
    if (!id) return
    if (status !== 'succeeded') {
      wx.showToast({ title: '该评估尚无可查看结果', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/pages/assessment-result/assessment-result?id=${encodeURIComponent(id)}`,
    })
  },

  onCreateAssessment() {
    wx.navigateTo({ url: '/pages/assessment-form/assessment-form' })
  },
})
