import { getSavedAuthResult } from '../../utils/auth'
import { authorizePage, safeBack } from '../../utils/navigation'
import {
  createAssessmentDraft,
  friendlyRequestError,
  getAssessmentMeta,
  getCommercialMeta,
  grantMyFreeCredits,
  getMyCreditAccount,
  createAssessmentPaymentOrder,
  getAssessmentPaymentOrder,
  getMyAcademicProfile,
  getMyAssessment,
  importAssessmentProfileMaterial,
  runMyAssessment,
  updateAssessmentDraft,
  type AssessmentCompetitionExperience,
  type AssessmentEnglishRecord,
  type AssessmentImportCandidate,
  type AssessmentResearchExperience,
  type AssessmentTarget,
} from '../../utils/request'
import { uploadAuthenticatedCloudFile } from '../../utils/cloud-upload'

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

const MAX_IMPORT_DOCUMENT_BYTES = 8 * 1024 * 1024
const MAX_IMPORT_IMAGE_BYTES = 5 * 1024 * 1024

function mergeUnique<T>(
  current: T[],
  incoming: T[],
  keyOf: (item: T) => string,
  limit: number,
) {
  const seen = new Set<string>()
  return [...current, ...incoming]
    .filter((item) => {
      const key = keyOf(item).trim().toLocaleLowerCase('zh-CN')
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}

Page({
  data: {
    loading: true,
    saving: false,
    profileReady: false,
    importing: false,
    providerConfigured: false,
    billingEnabled: false,
    checkoutEnabled: false,
    creditAvailable: null as number | null,
    creditError: '',
    creditLoading: false,
    purchasing: false,
    pendingPaymentOrderId: '',
    skuChoices: [] as Array<{ key: string; price: string; count: number }>,
    materialImportConfigured: false,
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

  onLoad(query: Record<string, string | undefined>) {
    authorizePage('pages/assessment-form/assessment-form', query, () => { void this.initializeForm(query) })
  },
  onShow() {
    // Read the canonical account profile after returning from 我的 → 编辑个人资料.
    // Never promote resume extraction or a historical draft to the source of truth.
    if (!this.data.profileReady || this.data.loading) return
    void this.loadCredits()
    void getMyAcademicProfile().then((profile) => {
      this.setData({
        'profile.university': profile.university || '',
        'profile.major': profile.major || '',
        'profile.currentGrade': profile.currentGrade || '',
        'profile.gpaText': profile.gpaText || '',
        'profile.rankText': profile.rankText || '',
      })
    }).catch(() => wx.showToast({ title: '资料同步失败，请重新打开', icon: 'none' }))
  },
  onOpenProfileEdit() {
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' })
  },
  async loadCredits() {
    if (this.data.creditLoading || this.data.purchasing) return
    try {
      this.setData({ creditLoading: true, creditError: '' })
      const meta = await getCommercialMeta()
      if (!meta.policy.enforcementEnabled) {
        this.setData({ billingEnabled: false, checkoutEnabled: false, creditAvailable: null, skuChoices: [] })
        return
      }
      // Chargeable plans and prices are server-owned, not submitted by the client.
      const skuChoices = meta.payment.skus.map(sku => ({
        key: sku.key, count: sku.creditAmount, price: (sku.amountFen / 100).toFixed(2),
      }))
      this.setData({ billingEnabled: true, checkoutEnabled: meta.payment.checkoutEnabled, skuChoices })
      // An idempotent server grant supports both guest=1 and student=5 lifetime policy.
      await grantMyFreeCredits()
      const creditAccount = await getMyCreditAccount()
      this.setData({ creditAvailable: creditAccount.availableBalance })
    } catch (error) {
      this.setData({ creditAvailable: null, creditError: friendlyRequestError(error, '额度读取失败，请重试') })
    } finally {
      this.setData({ creditLoading: false })
    }
  },
  onBuyCredit(event: WechatMiniprogram.BaseEvent) {
    if (!this.data.checkoutEnabled || this.data.purchasing) return
    const key = String(event.currentTarget.dataset.key ?? '')
    const sku = this.data.skuChoices.find(item => item.key === key)
    if (!sku) return
    wx.showModal({
      title: '确认充值 AI 评估次数',
      content: `购买 ${sku.count} 次 AI 评估，实付 ¥${sku.price}。课程不在小程序内销售。`,
      confirmText: '微信支付',
      cancelText: '暂不购买',
      success: result => { if (result.confirm) void this.beginCreditPurchase(sku.key) },
    })
  },
  async beginCreditPurchase(skuKey: string) {
    if (this.data.purchasing || !this.data.checkoutEnabled) return
    this.setData({ purchasing: true })
    try {
      const { order, payment } = await createAssessmentPaymentOrder(skuKey)
      this.setData({ pendingPaymentOrderId: order.id })
      await new Promise<void>((resolve, reject) => {
        wx.requestPayment({
          ...payment,
          success: () => resolve(),
          fail: error => reject(error),
        })
      })
      // wx.requestPayment success is not settlement. Only the verified server
      // callback can mark the order paid and append the credit ledger entry.
      await this.verifyCreditPayment()
    } catch (error) {
      const err = error as { errMsg?: string }
      if (String(err?.errMsg ?? '').includes('cancel')) {
        wx.showToast({ title: '已取消支付，未增加次数', icon: 'none' })
      } else {
        wx.showModal({
          title: '支付状态待确认',
          content: '如果你已经完成微信支付，额度可能需要等待后台通知。请使用“核实订单”刷新，不要重复购买。',
          showCancel: false,
        })
      }
    } finally {
      this.setData({ purchasing: false })
      void this.loadCredits()
    }
  },
  async verifyCreditPayment() {
    const id = this.data.pendingPaymentOrderId
    if (!id) return
    const order = await getAssessmentPaymentOrder(id)
    if (order.status === 'paid') {
      this.setData({ pendingPaymentOrderId: '' })
      wx.showToast({ title: '充值已到账', icon: 'success' })
    } else {
      wx.showModal({
        title: '正在核实充值订单',
        content: '当前订单尚未被服务器确认支付成功。请稍后点击“核实订单”，无需重复付款。',
        showCancel: false,
      })
    }
  },
  onVerifyCreditPayment() {
    if (this.data.purchasing) return
    void this.verifyCreditPayment().then(() => this.loadCredits()).catch(() => {
      wx.showToast({ title: '订单暂时无法核实，请稍后重试', icon: 'none' })
    })
  },
  async initializeForm(query: Record<string, string | undefined>) {
    const auth = getSavedAuthResult()
    const focusSection = query.section ? decodeURIComponent(query.section) : ''

    if (!auth) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }

    if (auth.user.role !== 'user' && auth.user.role !== 'student') {
      wx.showToast({ title: '当前身份不使用 AI 定位', icon: 'none' })
      safeBack()
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
        safeBack()
        return
      }

      const draftInput = draft?.input
      const draftProfile = draftInput?.profile

      this.setData({
        providerConfigured: meta.providerConfigured,
        materialImportConfigured: meta.materialImport.enabled,
        draftId: draft?.id || '',
        profileReady: true,
        profile: {
          university: profile.university || '',
          major: profile.major || '',
          currentGrade: profile.currentGrade || '',
          gpaText: profile.gpaText || '',
          rankText: profile.rankText || '',
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
      void this.loadCredits()
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

  onImportMaterial() {
    if (!this.data.materialImportConfigured) {
      wx.showModal({
        title: '材料导入暂不可用',
        content: '材料解析服务尚未完成配置。你仍可继续手动填写评估资料。',
        showCancel: false,
      })
      return
    }

    wx.showActionSheet({
      itemList: ['Word / PDF 文件', '图片'],
      success: (result) => {
        if (result.tapIndex === 0) this.onChooseImportDocument()
        if (result.tapIndex === 1) this.onChooseImportImage()
      },
    })
  },

  onChooseImportDocument() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['doc', 'docx', 'pdf'],
      success: (result) => {
        const file = result.tempFiles[0]
        if (!file) return
        void this.uploadAndImportMaterial(
          file.path,
          file.name || 'resume.pdf',
          'document',
          file.size ?? 0,
        )
      },
    })
  },

  onChooseImportImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (result) => {
        const file = result.tempFiles[0]
        if (!file) return
        const lower = file.tempFilePath.toLowerCase()
        const extension = lower.includes('.png')
          ? 'png'
          : lower.includes('.webp')
            ? 'webp'
            : 'jpg'
        void this.uploadAndImportMaterial(
          file.tempFilePath,
          'resume.' + extension,
          'image',
          file.size ?? 0,
        )
      },
    })
  },

  async uploadAndImportMaterial(
    filePath: string,
    fileName: string,
    sourceType: 'document' | 'image',
    fileSize: number,
  ) {
    const maxBytes =
      sourceType === 'image'
        ? MAX_IMPORT_IMAGE_BYTES
        : MAX_IMPORT_DOCUMENT_BYTES

    if (fileSize > maxBytes) {
      wx.showModal({
        title: '材料文件过大',
        content:
          sourceType === 'image'
            ? '单张图片请控制在 5MB 以内。'
            : 'Word / PDF 请控制在 8MB 以内，建议只上传与保研评估有关的核心材料。',
        showCancel: false,
      })
      return
    }

    try {
      this.setData({ importing: true })
      wx.showLoading({ title: '正在识别材料' })
      const fileID = await uploadAuthenticatedCloudFile({
        namespace: 'assessment-imports',
        filePath,
        fileName,
      })
      const result = await importAssessmentProfileMaterial({
        fileID,
        fileName,
        sourceType,
      })
      wx.hideLoading()

      const warningText = result.candidate.warnings
        .slice(0, 3)
        .join('\n')
      const content =
        result.summary +
        '\n\n导入只负责预填，不会直接提交评估；已有内容会保留，识别结果会补充到空白字段和经历列表。' +
        (warningText ? '\n\n请注意：\n' + warningText : '')

      wx.showModal({
        title: '应用识别结果？',
        content,
        confirmText: '应用预填',
        cancelText: '不应用',
        success: (modal) => {
          if (!modal.confirm) return
          this.applyImportedCandidate(result.candidate)
          wx.showToast({
            title: '已预填，请核对',
            icon: 'success',
          })
        },
      })
    } catch (error) {
      wx.hideLoading()
      wx.showModal({
        title: '材料导入失败',
        content: friendlyRequestError(
          error,
          '材料暂时无法解析，请稍后重试或改用手动填写',
        ),
        showCancel: false,
      })
    } finally {
      this.setData({ importing: false })
    }
  },

  applyImportedCandidate(candidate: AssessmentImportCandidate) {
    const currentProfile = this.data.profile
    const incomingProfile = candidate.profile
    const profile = {
      university: currentProfile.university,
      major: currentProfile.major,
      currentGrade: currentProfile.currentGrade,
      gpaText: currentProfile.gpaText,
      rankText: currentProfile.rankText,
      backgroundNote:
        currentProfile.backgroundNote || incomingProfile.backgroundNote || '',
    }

    const english = mergeUnique(
      this.data.english,
      candidate.english,
      (item) => item.type + '|' + item.score,
      6,
    )
    const research = mergeUnique(
      this.data.research,
      candidate.research,
      (item) => item.title + '|' + (item.organization || ''),
      12,
    )
    const competitions = mergeUnique(
      this.data.competitions,
      candidate.competitions,
      (item) => item.name + '|' + (item.award || ''),
      12,
    )
    const currentTargets = this.data.targets.filter((item) =>
      item.schoolName.trim(),
    )
    const targets = mergeUnique(
      currentTargets,
      candidate.targets,
      (item) => item.schoolName + '|' + (item.programName || ''),
      5,
    )

    this.setData({
      profile,
      english,
      research,
      competitions,
      competitionSuggestions: competitions.map(() => []),
      targets:
        targets.length > 0
          ? targets
          : [
              {
                schoolName: '',
                programName: '',
                researchDirection: '',
                note: '',
              },
            ],
    })
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
        return
      }

      if (result.status === 'running') {
        wx.showToast({
          title: '已提交后台分析',
          icon: 'success',
          duration: 1200,
        })
        wx.redirectTo({
          url: '/pages/assessment-history/assessment-history',
        })
        return
      }

      wx.showToast({ title: '评估未进入运行状态，请稍后重试', icon: 'none' })
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
