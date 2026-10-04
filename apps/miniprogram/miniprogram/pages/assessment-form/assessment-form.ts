import { getSavedAuthResult } from '../../utils/auth'
import {
  createAssessmentDraft,
  friendlyRequestError,
  getAssessmentMeta,
  getMyAcademicProfile,
  getMyAssessment,
  runMyAssessment,
  updateMyAcademicProfile,
  updateAssessmentDraft,
  type AssessmentCompetitionExperience,
  type AssessmentEnglishRecord,
  type AssessmentResearchExperience,
  type AssessmentTarget,
  type AcademicProfile,
} from '../../utils/request'

type AcademicProfileField = keyof AcademicProfile

const RESEARCH_TIERS = [
  'Nature',
  'Science',
  'SCI/SSCI',
  'EI',
  '普通期刊',
  '科研项目',
  '专利/软著',
  '其他',
] as const

const COMPETITION_AWARDS = [
  '国际特等奖',
  '国际一等奖',
  '国际二等奖',
  '国际三等奖',
  '国家特等奖',
  '国家一等奖（国一）',
  '国家二等奖（国二）',
  '国家三等奖（国三）',
  '省级特等奖',
  '省级一等奖（省一）',
  '省级二等奖（省二）',
  '省级三等奖（省三）',
  '校级一等奖',
  '校级二等奖',
  '校级三等奖',
  '其他',
] as const

const COMPETITION_NAMES = [
  "中国国际大学生创新大赛（原“互联网+”）",
  "“挑战杯”全国大学生课外学术科技作品竞赛",
  "“挑战杯”中国大学生创业计划大赛",
  "全国大学生数学建模竞赛",
  "美国大学生数学建模竞赛（MCM/ICM）",
  "全国大学生统计建模大赛",
  "全国大学生节能减排社会实践与科技竞赛",
  "全国大学生先进成图技术与产品信息建模创新大赛",
  "全国大学生智能汽车竞赛",
  "全国大学生电子设计竞赛",
  "全国大学生电子商务“创新、创意及创业”挑战赛",
  "全国周培源大学生力学竞赛",
  "全国大学生生命科学竞赛（CULSC）",
  "全国大学生工程实践与创新能力大赛",
  "全国大学生光电设计竞赛",
  "全国大学生机器人大赛（RoboMaster/RoboCon）",
  "“西门子杯”中国智能制造挑战赛",
  "全国三维数字化创新设计大赛（全国3D大赛）",
  "全国大学生嵌入式芯片与系统设计竞赛",
  "全国大学生物联网设计竞赛",
  "全国大学生化工设计竞赛",
  "全国大学生结构设计竞赛",
  "中国机器人大赛暨RoboCup机器人世界杯中国赛",
  "全国大学生信息安全竞赛",
  "中国大学生计算机设计大赛",
  "全国大学生测绘学科创新创业智能大赛",
  "全国大学生交通运输科技大赛",
  "全国大学生能源经济学术创意大赛",
  "“学创杯”全国大学生创业综合模拟大赛",
  "全国大学生市场调查与分析大赛",
  "全国大学生机械创新设计大赛",
  "全国大学生地质技能竞赛",
  "全国大学生化工安全设计大赛",
  "全国大学生物流设计大赛",
  "睿抗机器人开发者大赛（RAICOM）",
  "中国机器人及人工智能大赛",
  "ACM-ICPC国际大学生程序设计竞赛",
  "百度之星程序设计大赛",
  "全国大学生水利创新设计大赛",
  "全国本科院校税收风险管控案例大赛",
  "全国企业竞争模拟大赛",
  "全国高校商业精英挑战赛",
  "全国大学生化学实验创新设计大赛",
  "全国大学生化工实验大赛",
  "“光威杯”中国复合材料学会大学生科技创新竞赛",
  "全国大学生金相技能大赛",
  "全国大学生高分子材料实验实践大赛",
  "全国大学生混凝土材料设计大赛",
  "全国大学生电力创新设计竞赛",
  "中国大学生机械工程创新创意大赛：过程装备实践与创新赛",
  "全国大学生集成电路创新创业大赛",
  "中国大学生服务外包创新创业大赛",
  "CCF大学生计算机系统与程序设计竞赛（CCSP）",
  "蓝桥杯全国软件和信息技术专业人才大赛",
  "全国大学生计算机系统能力大赛",
  "“中国软件杯”大学生软件设计大赛",
  "华为ICT大赛",
  "“泰迪杯”数据挖掘挑战赛",
  "全国大学生软件测试大赛",
  "全球校园人工智能算法精英大赛",
  "国际高校BIM毕业设计创新大赛",
  "全国高校安全科学与工程大学生实践与创新作品大赛",
  "全国大学生食品工程虚拟仿真大赛",
  "全国大学生生物医学工程创新设计竞赛",
  "中国高校计算机大赛（含天梯赛、大数据挑战赛、人工智能创意赛等）",
  "CCF大数据与计算智能大赛（CCF BDCI）",
  "腾讯云黑客松高校赛",
  "中兴捧月全球精英挑战赛",
  "中国移动“梧桐杯”大数据创新大赛",
  "全球OPC共创节·AI超新星黑客松总决赛",
  "ABB杯智能技术创新大赛",
  "Apple WWDC Students Scholarship",
  "BuilderUp·温州站 Vibe Hardware AI+ESP32黑客松",
  "CCPC中国大学生程序设计竞赛",
  "CFA全球投资分析大赛（Research Challenge）",
  "CICC智能体开放主题黑客松挑战赛",
  "CMAU全国大学生市场研究与商业策划大赛",
  "IETF第125届大会黑客松",
  "IFLA国际学生景观设计竞赛",
  "MPAcc学生案例大赛",
  "SAE国际航空设计大赛",
  "SAMPE国际超轻复合材料机翼/桥梁学生竞赛",
  "Talkweb House黑客松暨开源鸿蒙城市技术沙龙",
  "UIA-霍普杯国际大学生建筑设计竞赛",
  "VEX机器人亚洲公开赛总决赛、世锦赛",
  "WUPENiCity城市设计学生作业国际竞赛与城市可持续调研报告国际竞赛",
  "iCAN大学生创新创业大赛",
  "“上纬杯”全国大学生复合材料设计与制作大赛",
  "“东方杯”全国大学生勘探地球物理大赛",
  "“东方财富杯”全国大学生金融挑战赛",
  "“中国电机工程学会杯”全国大学生电工数学建模竞赛",
  "“中联杯”全国大学生建筑设计大赛",
  "“中航工业杯”国际无人飞行器创新大奖赛",
  "“中装杯”全国大学生环境设计大赛",
  "“南方测绘杯”全国大学生测绘地理信息虚拟仿真技能竞赛",
  "“厚粲杯”全国大学生心理与认知智能测评挑战赛",
  "“基准杯”国际大学生建筑设计竞赛",
  "“大唐杯”全国大学生新一代信息通信技术大赛",
  "“大家说仪器”科普创作大赛",
  "“天作杯”国际大学生建筑设计竞赛",
  "“天华杯”ART&TECH全国大学生建筑设计大赛",
  "“太平洋精锻杯”中国大学生塑性工程实践与创新赛",
  "“工行杯”全国大学生金融科技创新大赛",
  "“心上的中国”全国大学生525心理与研学设计大赛",
  "“皇家杯”职业院校宠物营养学知识竞赛",
  "“翱翔杯”全国立方星及应用创新设计大赛",
  "“联影杯”兽医（小动物）影像诊断大赛",
  "“谷雨杯”全国大学生可持续建筑设计竞赛",
  "“长风杯”全国大学生大数据分析与挖掘竞赛",
  "“雄鹰杯”小动物医师技能大赛",
  "“鲲鹏杯”大中学生航空航天知识竞赛",
  "《中国建筑教育》“清润奖”大学生论文竞赛",
  "世界大学生桥梁设计大赛",
  "世界技能大赛“化学实验室技术”项目",
  "世界职业院校技能大赛水利赛道",
  "东南·中国建筑新人赛"
] as const

function normalizeCompetitionKeyword(value: string) {
  return value.toLowerCase().replace(/[\s（）()“”‘’"'·—\-_/]/g, '')
}

function searchCompetitionNames(query: string, limit = 6) {
  const needle = normalizeCompetitionKeyword(query)
  if (!needle) return []
  return COMPETITION_NAMES
    .map((name) => {
      const normalized = normalizeCompetitionKeyword(name)
      let score = 0
      if (normalized === needle) score = 100
      else if (normalized.startsWith(needle)) score = 60
      else if (normalized.includes(needle)) score = 40
      return { name, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh-CN'))
    .slice(0, limit)
    .map((entry) => entry.name)
}

function awardLevel(award: string) {
  if (award.startsWith('国际')) return 'international' as const
  if (award.startsWith('国家')) return 'national' as const
  if (award.startsWith('省级')) return 'provincial' as const
  if (award.startsWith('校级')) return 'school' as const
  return 'other' as const
}

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
    profileSaving: false,
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
    researchTiers: RESEARCH_TIERS,
    competitionAwards: COMPETITION_AWARDS,
    english: [] as AssessmentEnglishRecord[],
    research: [] as AssessmentResearchExperience[],
    competitions: [] as AssessmentCompetitionExperience[],
    competitionSuggestions: [] as string[][],
    targets: [
      {
        schoolName: '',
        programName: '',
        researchDirection: '',
        note: '',
      },
    ] as AssessmentTarget[],
  },

  async onLoad(query: Record<string, string | undefined>) {
    const auth = getSavedAuthResult()
    const focusSection = query.section ? decodeURIComponent(query.section) : ''

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
      const requestedDraftId = query.id ? decodeURIComponent(query.id) : ''
      const [profile, meta, draft] = await Promise.all([
        getMyAcademicProfile(),
        getAssessmentMeta(),
        requestedDraftId
          ? getMyAssessment(requestedDraftId)
          : Promise.resolve(null),
      ])

      if (draft && draft.status !== 'draft') {
        wx.showToast({ title: '该记录已不能作为草稿编辑', icon: 'none' })
        wx.navigateBack()
        return
      }

      const draftInput = draft?.input
      const draftProfile = draftInput?.profile

      this.setData({
        providerConfigured: meta.providerConfigured,
        draftId: draft?.id || '',
        profile: {
          university: draftProfile?.university || profile.university || '',
          major: draftProfile?.major || profile.major || '',
          currentGrade: draftProfile?.currentGrade || profile.currentGrade || '',
          gpaText: draftProfile?.gpaText || profile.gpaText || '',
          rankText: draftProfile?.rankText || profile.rankText || '',
          backgroundNote: draftProfile?.backgroundNote || '',
        },
        english: draftInput?.english ?? [],
        research: draftInput?.research ?? [],
        competitions: draftInput?.competitions ?? [],
        competitionSuggestions: (draftInput?.competitions ?? []).map(() => []),
        targets: draftInput?.targets?.length
          ? draftInput.targets
          : [
              {
                schoolName: '',
                programName: '',
                researchDirection: '',
                note: '',
              },
            ],
      })
    } catch (error) {
      console.info('Assessment form bootstrap failed.', error)
      wx.showToast({ title: '评估资料暂时无法加载', icon: 'none' })
    } finally {
      this.setData({ loading: false })
      if (focusSection) {
        setTimeout(() => this.scrollToSection(focusSection), 80)
      }
    }
  },

  scrollToSection(section: string) {
    if (!['english', 'research', 'competition'].includes(section)) return
    wx.pageScrollTo({
      selector: `#section-${section}`,
      duration: 220,
    })
  },

  onBackgroundNoteInput(event: WechatMiniprogram.Input) {
    this.setData({
      'profile.backgroundNote': event.detail.value,
    })
  },

  onProfileFieldInput(event: WechatMiniprogram.Input) {
    const field = String(event.currentTarget.dataset.field) as AcademicProfileField
    if (!['university', 'major', 'currentGrade', 'gpaText', 'rankText'].includes(field)) {
      return
    }

    this.setData({
      [`profile.${field}`]: event.detail.value,
    })
  },

  async onProfileFieldBlur() {
    if (this.data.profileSaving) return

    try {
      this.setData({ profileSaving: true })
      const profile = this.data.profile
      await updateMyAcademicProfile({
        university: profile.university.trim() || null,
        major: profile.major.trim() || null,
        currentGrade: profile.currentGrade.trim() || null,
        gpaText: profile.gpaText.trim() || null,
        rankText: profile.rankText.trim() || null,
      })
    } catch (error) {
      console.info('Academic profile auto-save failed on assessment form.', error)
    } finally {
      this.setData({ profileSaving: false })
    }
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

  onResearchTierChange(
    event: WechatMiniprogram.CustomEvent<{ value: string }>,
  ) {
    const index = Number(event.currentTarget.dataset.index)
    const tier = RESEARCH_TIERS[Number(event.detail.value)]
    const research = [...this.data.research]
    const item = research[index]
    if (!item || !tier) return
    const type =
      ['Nature', 'Science', 'SCI/SSCI', 'EI', '普通期刊'].includes(tier)
        ? 'paper'
        : tier === '专利/软著'
          ? 'patent'
          : tier === '科研项目'
            ? 'project'
            : 'other'
    research[index] = { ...item, achievementTier: tier, type }
    this.setData({ research })
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
      competitionSuggestions: [...this.data.competitionSuggestions, []],
    })
  },

  onCompetitionNameInput(event: WechatMiniprogram.Input) {
    const index = Number(event.currentTarget.dataset.index)
    const competitions = [...this.data.competitions]
    const item = competitions[index]
    if (!item) return
    const name = event.detail.value
    competitions[index] = { ...item, name }

    const competitionSuggestions = [...this.data.competitionSuggestions]
    competitionSuggestions[index] =
      name.trim().length > 0 ? searchCompetitionNames(name) : []
    this.setData({ competitions, competitionSuggestions })
  },

  onSelectCompetitionSuggestion(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const name = String(event.currentTarget.dataset.name || '')
    const competitions = [...this.data.competitions]
    const item = competitions[index]
    if (!item || !name) return
    competitions[index] = { ...item, name }
    const competitionSuggestions = [...this.data.competitionSuggestions]
    competitionSuggestions[index] = []
    this.setData({ competitions, competitionSuggestions })
  },

  onCompetitionAwardChange(
    event: WechatMiniprogram.CustomEvent<{ value: string }>,
  ) {
    const index = Number(event.currentTarget.dataset.index)
    const award = COMPETITION_AWARDS[Number(event.detail.value)]
    const competitions = [...this.data.competitions]
    const item = competitions[index]
    if (!item || !award) return
    competitions[index] = { ...item, award, level: awardLevel(award) }
    this.setData({ competitions })
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
    const competitionSuggestions = [...this.data.competitionSuggestions]
    competitionSuggestions.splice(index, 1)
    this.setData({ competitions, competitionSuggestions })
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
      wx.showToast({
        title: friendlyRequestError(error, '评估草稿暂时无法保存'),
        icon: 'none',
        duration: 2600,
      })
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
      const input = this.buildInput()
      let draftId = this.data.draftId

      if (draftId) {
        await updateAssessmentDraft(draftId, input)
      } else {
        const draft = await createAssessmentDraft(input)
        draftId = draft.id
        this.setData({ draftId })
      }

      const result = await runMyAssessment(draftId)
      if (result.status === 'succeeded') {
        wx.redirectTo({
          url: `/pages/assessment-result/assessment-result?id=${encodeURIComponent(result.id)}`,
        })
      } else {
        wx.showToast({ title: '评估未完成，请稍后重试', icon: 'none' })
      }
    } catch (error) {
      wx.showToast({
        title: friendlyRequestError(error, '评估运行失败，请稍后重试'),
        icon: 'none',
        duration: 2600,
      })
    } finally {
      this.setData({ saving: false })
    }
  },
})
