import {
  friendlyRequestError,
  getMyApplicationProjection,
  getMyGrowthProfile,
  getMyResumeProjection,
  type ApplicationProjection,
  type CanonicalGrowthProfile,
  type ResumeProjection,
} from '../../utils/request'

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
    error: '',
    growthSchemaReady: true,
    profile: emptyProfile(),
    records: [] as Array<Record<string, unknown>>,
    target: 'general' as ResumeTarget,
    targets: TARGETS,
    resume: null as ResumeProjection | null,
    application: null as ApplicationProjection | null,
    matchedCount: 0,
    confirmCount: 0,
    missingCount: 0,
  },

  onLoad() {
    void this.loadAll()
  },

  async loadAll() {
    try {
      this.setData({ loading: true, error: '' })
      const [profileResult, resumeResult, applicationResult] = await Promise.all([
        getMyGrowthProfile(),
        getMyResumeProjection(this.data.target),
        getMyApplicationProjection(),
      ])

      const application = applicationResult.projection
      this.setData({
        growthSchemaReady:
          profileResult.growthSchemaReady &&
          resumeResult.growthSchemaReady &&
          applicationResult.growthSchemaReady,
        profile: profileResult.profile,
        records: profileResult.profile.records.map((record) => ({
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
        resume: resumeResult.projection,
        application,
        matchedCount: application.fields.filter((field) => field.status === 'matched').length,
        confirmCount: application.fields.filter((field) => field.status === 'needs_confirmation').length,
        missingCount: application.fields.filter((field) => field.status === 'missing').length,
      })
    } catch (error) {
      this.setData({
        error: friendlyRequestError(error, '成长履历暂时无法加载'),
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async onTargetTap(event: WechatMiniprogram.BaseEvent) {
    const target = String(event.currentTarget.dataset.target || '') as ResumeTarget
    if (!TARGETS.some((item) => item.key === target) || target === this.data.target) return

    try {
      this.setData({ target, loading: true, error: '' })
      const result = await getMyResumeProjection(target)
      this.setData({
        resume: result.projection,
        growthSchemaReady: this.data.growthSchemaReady && result.growthSchemaReady,
      })
    } catch (error) {
      this.setData({
        error: friendlyRequestError(error, '简历投影生成失败'),
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  onEditBaseProfile() {
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' })
  },
})
