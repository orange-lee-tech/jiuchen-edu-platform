import { getSavedAuthResult } from '../../utils/auth'
import {
  createAssessmentDraft,
  getAssessmentMeta,
  getMyAcademicProfile,
  runMyAssessment,
  updateAssessmentDraft,
  type AssessmentCompetitionExperience,
  type AssessmentEnglishRecord,
  type AssessmentResearchExperience,
  type AssessmentTarget,
} from '../../utils/request'

const ENGLISH_TYPES = [
  { value: 'cet4', label: 'CET-4' },
  { value: 'cet6', label: 'CET-6' },
  { value: 'ielts', label: 'IELTS' },
  { value: 'toefl', label: 'TOEFL' },
  { value: 'gre', label: 'GRE' },
  { value: 'other', label: '其他' },
] as const

Page({
  data: {
    loading: true,
    saving: false,
    providerConfigured: false,
    draftId: '',
    profile: {
      university: '',
      major: '',
      currentGrade: '',
      gpaText: '',
      rankText: '',
      backgroundNote: '',
    },
    englishTypes: ENGLISH_TYPES,
    english: [] as AssessmentEnglishRecord[],
    research: [] as AssessmentResearchExperience[],
    competitions: [] as AssessmentCompetitionExperience[],
    targets: [
      {
        schoolName: '',
        programName: '',
        researchDirection: '',
        note: '',
      },
    ] as AssessmentTarget[],
  },

  async onLoad() {
    const auth = getSavedAuthResult()

    if (!auth) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }

    if (auth.user.role !== 'user' && auth.user.role !== 'student') {
      wx.showToast({ title: '当前身份不使用 AI 定位', icon: 'none' })
      wx.navigateBack()
      return
    }

    try {
      const [profile, meta] = await Promise.all([
        getMyAcademicProfile(),
        getAssessmentMeta(),
      ])

      this.setData({
        providerConfigured: meta.providerConfigured,
        profile: {
          university: profile.university || '',
          major: profile.major || '',
          currentGrade: profile.currentGrade || '',
          gpaText: profile.gpaText || '',
          rankText: profile.rankText || '',
          backgroundNote: '',
        },
      })
    } catch (error) {
      console.info('Assessment form bootstrap failed.', error)
      wx.showToast({ title: '评估资料暂时无法加载', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onBackgroundNoteInput(event: WechatMiniprogram.Input) {
    this.setData({
      'profile.backgroundNote': event.detail.value,
    })
  },

  onAddEnglish() {
    if (this.data.english.length >= 6) return
    this.setData({
      english: [
        ...this.data.english,
        { type: 'cet6', score: '', note: '' },
      ],
    })
  },

  onEnglishTypeChange(
    event: WechatMiniprogram.CustomEvent<{ value: string }>,
  ) {
    const index = Number(event.currentTarget.dataset.index)
    const option = ENGLISH_TYPES[Number(event.detail.value)]
    const english = [...this.data.english]
    if (!english[index] || !option) return
    english[index] = { ...english[index], type: option.value }
    this.setData({ english })
  },

  onEnglishScoreInput(event: WechatMiniprogram.Input) {
    const index = Number(event.currentTarget.dataset.index)
    const english = [...this.data.english]
    if (!english[index]) return
    english[index] = { ...english[index], score: event.detail.value }
    this.setData({ english })
  },

  onEnglishNoteInput(event: WechatMiniprogram.Input) {
    const index = Number(event.currentTarget.dataset.index)
    const english = [...this.data.english]
    if (!english[index]) return
    english[index] = { ...english[index], note: event.detail.value }
    this.setData({ english })
  },

  onRemoveEnglish(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const english = [...this.data.english]
    english.splice(index, 1)
    this.setData({ english })
  },

  onAddResearch() {
    if (this.data.research.length >= 12) return
    this.setData({
      research: [
        ...this.data.research,
        {
          title: '',
          type: 'project',
          role: '',
          organization: '',
          description: '',
          output: '',
        },
      ],
    })
  },

  onResearchInput(event: WechatMiniprogram.Input) {
    const index = Number(event.currentTarget.dataset.index)
    const field = String(event.currentTarget.dataset.field)
    const research = [...this.data.research]
    const item = research[index]
    if (!item) return
    research[index] = { ...item, [field]: event.detail.value }
    this.setData({ research })
  },

  onRemoveResearch(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const research = [...this.data.research]
    research.splice(index, 1)
    this.setData({ research })
  },

  onAddCompetition() {
    if (this.data.competitions.length >= 12) return
    this.setData({
      competitions: [
        ...this.data.competitions,
        {
          name: '',
          award: '',
          role: '',
          description: '',
        },
      ],
    })
  },

  onCompetitionInput(event: WechatMiniprogram.Input) {
    const index = Number(event.currentTarget.dataset.index)
    const field = String(event.currentTarget.dataset.field)
    const competitions = [...this.data.competitions]
    const item = competitions[index]
    if (!item) return
    competitions[index] = { ...item, [field]: event.detail.value }
    this.setData({ competitions })
  },

  onRemoveCompetition(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const competitions = [...this.data.competitions]
    competitions.splice(index, 1)
    this.setData({ competitions })
  },

  onAddTarget() {
    if (this.data.targets.length >= 5) return
    this.setData({
      targets: [
        ...this.data.targets,
        {
          schoolName: '',
          programName: '',
          researchDirection: '',
          note: '',
        },
      ],
    })
  },

  onTargetInput(event: WechatMiniprogram.Input) {
    const index = Number(event.currentTarget.dataset.index)
    const field = String(event.currentTarget.dataset.field)
    const targets = [...this.data.targets]
    const item = targets[index]
    if (!item) return
    targets[index] = { ...item, [field]: event.detail.value }
    this.setData({ targets })
  },

  onRemoveTarget(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    if (this.data.targets.length <= 1) return
    const targets = [...this.data.targets]
    targets.splice(index, 1)
    this.setData({ targets })
  },

  buildInput() {
    const profile = this.data.profile

    if (!profile.university || !profile.major || !profile.currentGrade) {
      throw new Error('请先完善本科院校、专业和当前年级')
    }

    const english = this.data.english
      .map((item) => ({
        ...item,
        score: item.score.trim(),
        note: item.note?.trim() || null,
      }))
      .filter((item) => item.score)

    const research = this.data.research
      .map((item) => ({
        ...item,
        title: item.title.trim(),
        role: item.role?.trim() || null,
        organization: item.organization?.trim() || null,
        description: item.description?.trim() || null,
        output: item.output?.trim() || null,
      }))
      .filter((item) => item.title)

    const competitions = this.data.competitions
      .map((item) => ({
        ...item,
        name: item.name.trim(),
        award: item.award?.trim() || null,
        role: item.role?.trim() || null,
        description: item.description?.trim() || null,
      }))
      .filter((item) => item.name)

    const targets = this.data.targets
      .map((item) => ({
        schoolName: item.schoolName.trim(),
        programName: item.programName?.trim() || null,
        researchDirection: item.researchDirection?.trim() || null,
        note: item.note?.trim() || null,
      }))
      .filter((item) => item.schoolName)

    if (targets.length === 0) {
      throw new Error('请至少填写一个目标院校')
    }

    return {
      profile: {
        university: profile.university,
        major: profile.major,
        currentGrade: profile.currentGrade,
        gpaText: profile.gpaText || null,
        rankText: profile.rankText || null,
        backgroundNote: profile.backgroundNote.trim() || null,
      },
      english,
      research,
      competitions,
      targets,
    }
  },

  async onSaveDraft() {
    try {
      this.setData({ saving: true })
      const input = this.buildInput()
      const draft = this.data.draftId
        ? await updateAssessmentDraft(this.data.draftId, input)
        : await createAssessmentDraft(input)
      this.setData({ draftId: draft.id })
      wx.showToast({ title: '评估草稿已保存', icon: 'success' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败'
      wx.showToast({ title: message, icon: 'none', duration: 2600 })
    } finally {
      this.setData({ saving: false })
    }
  },

  async onRunAssessment() {
    if (!this.data.providerConfigured) {
      wx.showModal({
        title: 'AI 模型尚未接入',
        content: '当前已可以保存结构化评估资料。真实模型与案例检索接入后再运行分析，不会生成模拟结果。',
        showCancel: false,
      })
      return
    }

    try {
      this.setData({ saving: true })
      let draftId = this.data.draftId
      if (!draftId) {
        const draft = await createAssessmentDraft(this.buildInput())
        draftId = draft.id
        this.setData({ draftId })
      }

      const result = await runMyAssessment(draftId)
      wx.showModal({
        title: '评估完成',
        content: result.status === 'succeeded' ? 'AI 评估已完成。结果页将在下一步接入。' : '评估未完成，请稍后重试。',
        showCancel: false,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '评估运行失败'
      wx.showToast({ title: message, icon: 'none', duration: 2600 })
    } finally {
      this.setData({ saving: false })
    }
  },

  onEditProfile() {
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' })
  },
})
