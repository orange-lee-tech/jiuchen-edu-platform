import {
  friendlyRequestError,
  confirmAssessmentGrowthImport,
  createMyGrowthRecord,
  getMyGrowthProfileBootstrap,
  updateMyGrowthRecord,
  type ApplicationProjection,
  type CanonicalGrowthRecord,
  type CanonicalGrowthProfile,
  type GrowthRecordInput,
  type GrowthRecordType,
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
import { getSavedAuthResult } from '../../utils/auth'
import { getReadOnlyContext, isReadOnly } from '../../utils/read-only-context'

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

const RECORD_TYPES: Array<{ key: GrowthRecordType; label: string }> = [
  { key: 'language', label: '语言考试' },
  { key: 'research', label: '科研经历' },
  { key: 'publication', label: '论文成果' },
  { key: 'competition', label: '竞赛经历' },
  { key: 'award', label: '荣誉奖项' },
  { key: 'project', label: '项目经历' },
  { key: 'internship', label: '实习经历' },
  { key: 'campus', label: '校园经历' },
  { key: 'skill', label: '技能' },
  { key: 'other', label: '其他经历' },
  { key: 'course', label: '课程与成绩（请先核对已导入课表）' },
]

const EMPTY_RECORD_FORM: GrowthRecordInput = {
  type: 'language', title: '', organization: '', role: '',
  startDate: '', endDate: '', description: '', result: '',
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

function currentOwnerKey() {
  const auth = getSavedAuthResult()
  const viewed = getReadOnlyContext()
  return `${auth?.user.id ?? ''}:${auth?.businessIdentity?.businessId ?? ''}:${viewed?.id ?? ''}`
}

const bootstrapOwnerInFlight = new WeakMap<object, string>()

Page({
  data: {
    loading: true,
    ownerKey: '',
    readOnly: false,
    refreshing: false,
    error: '',
    cacheState: '' as '' | 'fresh' | 'stale',
    revision: '',
    growthSchemaReady: true,
    assessmentSchemaReady: true,
    profile: emptyProfile(),
    records: [] as Array<CanonicalGrowthRecord & { typeLabel: string; sourceLabel: string }>,
    recordTypes: RECORD_TYPES,
    recordTypeIndex: 0,
    recordFormOpen: false,
    recordEditingId: '',
    recordForm: { ...EMPTY_RECORD_FORM },
    recordSaving: false,
    recordError: '',
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
    authorizePage('pages/growth-profile/growth-profile', options, () => {
      this.setData({ readOnly: isReadOnly(), ownerKey: currentOwnerKey() })
      void this.loadBootstrap()
    })
  },

  onShow() {
    if (this.data.ownerKey && this.data.ownerKey !== currentOwnerKey()) {
      this.setData({
        ownerKey: '', readOnly: isReadOnly(), loading: true, refreshing: false,
        error: '', revision: '', cacheState: '',
        profile: emptyProfile(), records: [], resume: null, resumeProjections: null,
        application: null, matchedCount: 0, confirmCount: 0, missingCount: 0,
        importAssessmentId: '', importCandidates: [], importing: false,
        openingDocument: false, recordFormOpen: false, recordSaving: false,
        recordError: '', recordEditingId: '', recordForm: { ...EMPTY_RECORD_FORM },
      })
      authorizePage('pages/growth-profile/growth-profile', this.options || {}, () => {
        this.setData({ readOnly: isReadOnly(), ownerKey: currentOwnerKey() })
        void this.loadBootstrap()
      })
      return
    }
    if (this.data.revision) void this.loadBootstrap(true)
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
    const ownerKey = this.data.ownerKey
    if (bootstrapOwnerInFlight.get(this) === ownerKey) return false
    bootstrapOwnerInFlight.set(this, ownerKey)
    try {
    let usedCache = false

    if (!force) {
      const cached = await getCachedGrowthProfileBootstrap()
      if (ownerKey !== currentOwnerKey() || ownerKey !== this.data.ownerKey) return false
      if (cached) {
        usedCache = true
        this.applyBootstrap(cached.data, cached.fresh ? 'fresh' : 'stale')
        this.setData({ loading: false, refreshing: true, error: '' })
      }
    }

    if (!usedCache) {
      const keepRecordsVisible = force && this.data.records.length > 0
      this.setData({ loading: !keepRecordsVisible, refreshing: keepRecordsVisible, error: '' })
    }

    try {
      const fresh = await getMyGrowthProfileBootstrap()
      if (ownerKey !== currentOwnerKey() || ownerKey !== this.data.ownerKey) return false
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
      return true
    } catch (error) {
      if (ownerKey !== currentOwnerKey() || ownerKey !== this.data.ownerKey) return false
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
      return false
    } finally {
      if (ownerKey === currentOwnerKey() && ownerKey === this.data.ownerKey) {
        this.setData({ loading: false, refreshing: false })
      }
    }
    } finally {
      if (bootstrapOwnerInFlight.get(this) === ownerKey) bootstrapOwnerInFlight.delete(this)
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
    if (isReadOnly() || this.data.importing) return
    const ownerKey = this.data.ownerKey
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
      if (ownerKey !== currentOwnerKey() || ownerKey !== this.data.ownerKey) return
      await clearGrowthProfileBootstrapCache()
      wx.showToast({ title: `已同步${result.imported}条履历`, icon: 'success' })
      await this.loadBootstrap(true)
    } catch (error) {
      if (ownerKey !== currentOwnerKey() || ownerKey !== this.data.ownerKey) return
      wx.showToast({
        title: friendlyRequestError(error, '同步履历失败，请稍后重试'),
        icon: 'none',
        duration: 2600,
      })
    } finally {
      if (ownerKey === currentOwnerKey() && ownerKey === this.data.ownerKey) this.setData({ importing: false })
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
    if (isReadOnly()) return
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' })
  },

  onRetryLoad() {
    if (this.data.loading || this.data.refreshing ||
      bootstrapOwnerInFlight.get(this) === this.data.ownerKey) return
    this.setData({ error: '' })
    void this.loadBootstrap(true)
  },

  onNewRecord() {
    if (isReadOnly() || !this.data.growthSchemaReady) return
    this.setData({
      recordFormOpen: true, recordEditingId: '', recordTypeIndex: 0,
      recordForm: { ...EMPTY_RECORD_FORM }, recordError: '',
    })
  },

  onEditRecord(event: WechatMiniprogram.BaseEvent) {
    if (isReadOnly() || !this.data.growthSchemaReady) return
    const record = this.data.records.find((item) => item.id === event.currentTarget.dataset.id)
    if (!record || record.source.type !== 'manual') return
    this.setData({
      recordFormOpen: true, recordEditingId: record.id,
      recordTypeIndex: RECORD_TYPES.findIndex((item) => item.key === record.type),
      recordForm: {
        type: record.type, title: record.title, organization: record.organization || '',
        role: record.role || '', startDate: record.startDate || '', endDate: record.endDate || '',
        description: record.description || '', result: record.result || '',
      },
      recordError: '',
    })
  },

  onRecordTypeChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const index = Number(event.detail.value)
    const type = RECORD_TYPES[index]
    if (type) this.setData({ recordTypeIndex: index, 'recordForm.type': type.key })
  },

  onRecordInput(event: WechatMiniprogram.Input) {
    const field = String(event.currentTarget.dataset.field || '')
    if (!['title', 'organization', 'role', 'startDate', 'endDate', 'description', 'result'].includes(field)) return
    this.setData({ ['recordForm.' + field]: event.detail.value })
  },

  onCancelRecord() {
    if (this.data.recordSaving) return
    this.setData({ recordFormOpen: false, recordEditingId: '', recordError: '' })
  },

  async onSaveRecord() {
    if (isReadOnly() || this.data.recordSaving || !this.data.growthSchemaReady) return
    const ownerKey = this.data.ownerKey
    const form = this.data.recordForm
    const title = form.title.trim()
    if (!title) {
      this.setData({ recordError: '请先填写这段经历的名称。' })
      return
    }
    const input: GrowthRecordInput = {
      ...form, title,
      organization: form.organization?.trim() || null,
      role: form.role?.trim() || null,
      startDate: form.startDate?.trim() || null,
      endDate: form.endDate?.trim() || null,
      description: form.description?.trim() || null,
      result: form.result?.trim() || null,
    }
    this.setData({ recordSaving: true, recordError: '' })
    try {
      if (this.data.recordEditingId) await updateMyGrowthRecord(this.data.recordEditingId, input)
      else await createMyGrowthRecord(input)
      if (ownerKey !== currentOwnerKey() || ownerKey !== this.data.ownerKey) return
      await clearGrowthProfileBootstrapCache()
      const refreshed = await this.loadBootstrap(true)
      this.setData({ recordFormOpen: false, recordEditingId: '' })
      wx.showToast({ title: refreshed ? '经历已保存' : '已保存，请稍后刷新', icon: refreshed ? 'success' : 'none' })
    } catch (error) {
      if (ownerKey !== currentOwnerKey() || ownerKey !== this.data.ownerKey) return
      this.setData({ recordError: friendlyRequestError(error, '经历暂时无法保存，请重试') })
    } finally {
      if (ownerKey === currentOwnerKey() && ownerKey === this.data.ownerKey) this.setData({ recordSaving: false })
    }
  },
})
