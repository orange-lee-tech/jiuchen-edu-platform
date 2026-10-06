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

const RUNNING_POLL_MS = 4000
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let pageVisible = false

function clearRefreshTimer() {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
}

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
    pageVisible = true
    clearRefreshTimer()
    const auth = getSavedAuthResult()
    if (!auth) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    void this.loadAssessments(false)
  },

  onHide() {
    pageVisible = false
    clearRefreshTimer()
  },

  onUnload() {
    pageVisible = false
    clearRefreshTimer()
  },

  async loadAssessments(silent = false) {
    try {
      if (!silent) this.setData({ loading: true })
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
          dateLabel: formatDate(
            row.status === 'draft'
              ? row.updatedAt
              : row.status === 'running'
                ? row.startedAt || row.createdAt
                : row.completedAt || row.createdAt,
          ),
        }
      })
      this.setData({ assessments })
      clearRefreshTimer()
      if (pageVisible && assessments.some((item) => item.status === 'running')) {
        refreshTimer = setTimeout(() => {
          void this.loadAssessments(true)
        }, RUNNING_POLL_MS)
      }
    } catch (error) {
      console.info('Assessment history load failed.', error)
      if (!silent) {
        wx.showToast({ title: '历史评估加载失败', icon: 'none' })
      } else if (pageVisible) {
        clearRefreshTimer()
        refreshTimer = setTimeout(() => {
          void this.loadAssessments(true)
        }, RUNNING_POLL_MS)
      }
    } finally {
      if (!silent) this.setData({ loading: false })
    }
  },

  onAssessmentTap(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    const status = String(event.currentTarget.dataset.status || '')
    if (!id) return

    if (status === 'draft') {
      wx.navigateTo({
        url: `/pages/assessment-form/assessment-form?id=${encodeURIComponent(id)}`,
      })
      return
    }

    if (status === 'running') {
      wx.showToast({ title: '后台分析中，可稍后回来查看', icon: 'none' })
      return
    }

    if (status === 'failed') {
      wx.showToast({ title: '本次评估运行失败，可重新发起评估', icon: 'none' })
      return
    }

    if (status !== 'succeeded') return

    wx.navigateTo({
      url: `/pages/assessment-result/assessment-result?id=${encodeURIComponent(id)}`,
    })
  },

  onCreateAssessment() {
    wx.navigateTo({ url: '/pages/assessment-form/assessment-form' })
  },
})
