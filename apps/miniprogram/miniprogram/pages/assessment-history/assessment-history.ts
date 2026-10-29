import { getSavedAuthResult } from '../../utils/auth'
import { authorizePage } from '../../utils/navigation'
import {isReadOnly} from '../../utils/read-only-context'
import {
  friendlyRequestError,
  getMyAssessments,
  type AssessmentRecord,
} from '../../utils/request'

type AssessmentListItem = AssessmentRecord & {
  targetSummary: string
  statusLabel: string
  statusTone: string
  dateLabel: string
  failureText: string
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
    loadError: '',
    canCreateAssessment: false,
    assessments: [] as AssessmentListItem[],
  },

  onShow() {
    pageVisible = true
    clearRefreshTimer()
    authorizePage('pages/assessment-history/assessment-history', {}, () => {
      const role = getSavedAuthResult()?.user.role
      this.setData({ canCreateAssessment: !isReadOnly()&&(role === 'user' || role === 'student') })
      if (pageVisible) void this.loadAssessments(false)
    })
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
          failureText: row.status === 'failed'
            ? friendlyRequestError(new Error(row.failureCode || ''),
              '评估未完成，请检查输入后重新发起') : '',
          dateLabel: formatDate(
            row.status === 'draft'
              ? row.updatedAt
              : row.status === 'running'
                ? row.startedAt || row.createdAt
                : row.completedAt || row.createdAt,
          ),
        }
      })
      this.setData({ assessments, loadError: '' })
      clearRefreshTimer()
      if (pageVisible && getSavedAuthResult() && assessments.some((item) => item.status === 'running')) {
        refreshTimer = setTimeout(() => {
          void this.loadAssessments(true)
        }, RUNNING_POLL_MS)
      }
    } catch (error) {
      console.info('Assessment history load failed.')
      this.setData({
        loadError: silent && this.data.assessments.length
          ? ''
          : friendlyRequestError(error, '历史评估暂时无法读取，请重试'),
      })
      if (!silent) {
        wx.showToast({ title: '历史评估未能读取', icon: 'none' })
      } else if (pageVisible && getSavedAuthResult()) {
        clearRefreshTimer()
        refreshTimer = setTimeout(() => {
          void this.loadAssessments(true)
        }, RUNNING_POLL_MS)
      }
    } finally {
      if (!silent) this.setData({ loading: false })
    }
  },

  onRetryLoad() {
    void this.loadAssessments(false)
  },

  onAssessmentTap(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    const status = String(event.currentTarget.dataset.status || '')
    if (!id) return

    if (status === 'draft') {
      if(isReadOnly()){wx.showToast({title:'只读查看不能编辑草稿',icon:'none'});return}
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
      this.openRetry(id)
      return
    }

    if (status !== 'succeeded') return

    wx.navigateTo({
      url: `/pages/assessment-result/assessment-result?id=${encodeURIComponent(id)}`,
    })
  },

  openRetry(id: string) {
    if (!this.data.canCreateAssessment) {
      wx.showToast({ title: '当前身份不能重新发起评估', icon: 'none' }); return
    }
    wx.navigateTo({ url: `/pages/assessment-form/assessment-form?retryFrom=${encodeURIComponent(id)}` })
  },

  onRetryAssessment(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    if (id) this.openRetry(id)
  },

  onCreateAssessment() {
    if (!this.data.canCreateAssessment) return
    wx.navigateTo({ url: '/pages/assessment-form/assessment-form' })
  },
})
