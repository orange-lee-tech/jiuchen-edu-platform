import {
  friendlyRequestError,
  confirmAssessmentGrowthImport,
  getMyGrowthProfileBootstrap,
  type ApplicationProjection,
  type CanonicalGrowthProfile,
  type GrowthImportCandidate,
  type GrowthProfileBootstrap,
  type ResumeProjection,
} from '../../utils/request'
import {
  clearGrowthProfileBootstrapCache,
  getCachedGrowthProfileBootstrap,
  saveGrowthProfileBootstrap,
} from '../../utils/growth-profile-cache'
import { openResumeDocx } from '../../utils/resume-document'
import { authorizePage } from '../../utils/navigation'

type ResumeTarget = 'general' | 'technical' | 'academic'

const TARGETS: Array<{ key: ResumeTarget; label: string }> = [
  { key: 'general', label: '通用求职' },
  { key: 'technical', label: '技术岗位' },
  { key: 'academic', label: '科研 / 学术' },
]

const TYPE_LABELS: Record<string, string> = {
  course: '课程 / 成绩',
  language: '语言',
  research: '科研',
  publication: '论文',
  competition: '竞赛',
  project: '项目',
  internship: '实习',
  campus: '校园 / 学生工作',
  award: '荣誉奖项',
  skill: '技能',
  other: '其他经历',
}

function emptyProfile(): CanonicalGrowthProfile {
  return {
    schemaVersion: 'growth-profile-v1',
    identity: {
      displayName: null,
      university: null,
      major: null,
      currentGrade: null,
      gpaText: null,
      rankText: null,
    },
    records: [],
  }
}

Page({
  data: {
    loading: true,
    refreshing: false,
    error: '',
    cacheState: '' as '' | 'fresh' | 'stale',
    revision: '',
    growthSchemaReady: true,
    assessmentSchemaReady: true,
    profile: emptyProfile(),
    records: [] as Array<Record<string, unknown>>,
    target: 'general' as ResumeTarget,
    targets: TARGETS,
    resume: null as ResumeProjection | null,
    resumeProjections: null as GrowthProfileBootstrap['resumeProjections'] | null,
    application: null as ApplicationProjection | null,
    matchedCount: 0,
    confirmCount: 0,
    missingCount: 0,
    importAssessmentId: '',
    importCandidates: [] as Array<GrowthImportCandidate & { selected: boolean; typeLabel: string }>,
    importing: false,
    openingDocument: false,
  },

  onLoad(options: Record<string, string>) {
    authorizePage('pages/growth-profile/growth-profile', options, () => { void this.loadBootstrap() })
  },

  applyBootstrap(
    bootstrap: GrowthProfileBootstrap,
    cacheState: '' | 'fresh' | 'stale',
  ) {
    const application = bootstrap.applicationProjection
    const pending = bootstrap.pendingAssessmentImport
    this.setData({
      cacheState,
      revision: bootstrap.revision,
      growthSchemaReady: bootstrap.growthSchemaReady,
      assessmentSchemaReady: bootstrap.assessmentSchemaReady,
      profile: bootstrap.profile,
      records: bootstrap.profile.records.map((record) => ({
        ...record,
        typeLabel: TYPE_LABELS[record.type] || '经历',
        sourceLabel:
          record.source.type === 'assessment'
            ? '来自已确认评估资料'
            : record.source.type === 'classroom'
              ? '来自学堂记录'
              : record.source.type === 'admin'
                ? '九辰后台记录'
                : '用户维护',
      })),
      resumeProjections: bootstrap.resumeProjections,
      resume: bootstrap.resumeProjections[this.data.target],
      application,
      matchedCount: application.fields.filter((field) => field.status === 'matched').length,
      confirmCount: application.fields.filter((field) => field.status === 'needs_confirmation').length,
      missingCount: application.fields.filter((field) => field.status === 'missing').length,
      importAssessmentId: pending?.assessmentId ?? '',
      importCandidates: (pending?.candidates ?? []).map((candidate) => ({
        ...candidate,
        selected: true,
        typeLabel: TYPE_LABELS[candidate.record.type] || '经历',
      })),
    })
  },

  async loadBootstrap(force = false) {
    let usedCache = false

    if (!force) {
      const cached = await getCachedGrowthProfileBootstrap()
      if (cached) {
        usedCache = true
        this.applyBootstrap(cached.data, cached.fresh ? 'fresh' : 'stale')
        this.setData({ loading: false, refreshing: true, error: '' })
      }
    }

    if (!usedCache) {
      this.setData({ loading: true, refreshing: false, error: '' })
    }

    try {
      const fresh = await getMyGrowthProfileBootstrap()
      if (fresh.revision !== this.data.revision || !usedCache) {
        this.applyBootstrap(fresh, '')
      } else {
        this.setData({
          cacheState: '',
          growthSchemaReady: fresh.growthSchemaReady,
          assessmentSchemaReady: fresh.assessmentSchemaReady,
        })
      }
      void saveGrowthProfileBootstrap(fresh)
    } catch (error) {
      if (!usedCache) {
        this.setData({
          error: friendlyRequestError(error, '成长履历暂时无法加载'),
        })
      } else {
        wx.showToast({
          title: '已显示本地履历，在线更新稍后重试',
          icon: 'none',
          duration: 2200,
        })
      }
    } finally {
      this.setData({ loading: false, refreshing: false })
    }
  },

  onCandidateToggle(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || index < 0 || index >= this.data.importCandidates.length) return
    this.setData({
      [`importCandidates[${index}].selected`]: !this.data.importCandidates[index].selected,
    })
  },

  async onConfirmAssessmentImport() {
    const assessmentId = this.data.importAssessmentId
    const candidateKeys = this.data.importCandidates
      .filter((candidate) => candidate.selected)
      .map((candidate) => candidate.candidateKey)

    if (!assessmentId || !candidateKeys.length) {
      wx.showToast({ title: '请至少选择一条资料', icon: 'none' })
      return
    }

    try {
      this.setData({ importing: true })
      const result = await confirmAssessmentGrowthImport(assessmentId, candidateKeys)
      await clearGrowthProfileBootstrapCache()
      wx.showToast({ title: `已同步${result.imported}条履历`, icon: 'success' })
      await this.loadBootstrap(true)
    } catch (error) {
      wx.showToast({
        title: friendlyRequestError(error, '同步履历失败，请稍后重试'),
        icon: 'none',
        duration: 2600,
      })
    } finally {
      this.setData({ importing: false })
    }
  },

  onTargetTap(event: WechatMiniprogram.BaseEvent) {
    const target = String(event.currentTarget.dataset.target || '') as ResumeTarget
    if (!TARGETS.some((item) => item.key === target) || target === this.data.target) return

    const projections = this.data.resumeProjections
    this.setData({
      target,
      resume: projections ? projections[target] : null,
    })
  },

  async onOpenResumeDocx() {
    if (this.data.openingDocument || !this.data.resume) return

    try {
      this.setData({ openingDocument: true })
      await openResumeDocx(this.data.target)
    } catch (error) {
      const message =
        error instanceof Error && /[\u4e00-\u9fff]/.test(error.message)
          ? error.message
          : '简历文件暂时无法打开'
      wx.showToast({
        title: message,
        icon: 'none',
        duration: 2600,
      })
    } finally {
      this.setData({ openingDocument: false })
    }
  },

  onEditBaseProfile() {
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' })
  },
})
