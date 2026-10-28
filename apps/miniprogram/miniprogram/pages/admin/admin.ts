import { getSavedAuthResult } from '../../utils/auth'
import { authorizePage, openPage, safeBack } from '../../utils/navigation'
import { filterInternalIds, internalIdView, ID_FILTERS } from '../../utils/admin-id-view'
import {
  bindAdminInternalId,
  addVerifiedOfficialPost,
  createAdminAssignment,
  createAdminInternalId,
  deleteAdminAssignment,
  deleteAdminInternalId,
  pauseAdminInternalId,
  restoreAdminInternalId,
  ApiRequestError,
  friendlyRequestError,
  getAdminAssignments,
  getAdminAnalytics,
  getAdminAiCosts, getAdminAiBalance,
  getAdminVirtualPurchaseOrders,getAdminVirtualPurchaseCases,
  getAdminVirtualReconciliation,
  recheckAdminVirtualPurchaseOrder,reviewAdminVirtualPurchaseCase,
  checkDeepseekPriceSource, reviewDeepseekPrice, reviewAiExchangeRate,
  getAdminInternalIds,
  getAdminNews,
  getAdminNewsData,
  getNewsRetirements,
  readNewsRetirement,
  updateNewsRetirementTask,
  getAdminStudents,
  getAdminReadOnlyRoster,
  getAdminTeachers,
  getAdminUsers,
  getAdminControls,
  getCommercialMeta,
  activateAdminControlDraft,
  saveAdminControl,
  saveAdminControlDraft,
  testAdminAssessmentKey,
  getAssessmentKeyObjects,
  createAssessmentKeyObject,
  copyAssessmentKeyModel,
  activateAssessmentKeyObject,
  disableActiveAssessmentKey,
  archiveAssessmentKeyObject,
  testAssessmentKeyObject,
  revealAssessmentKeyObject,
  setupLegacyAssessmentKeyPin,
  getCreditPlans, createCreditPlanObject, activateCreditPlanObject,
  disableCurrentCreditPlan, archiveCreditPlanObject, setupLegacyCreditPlanPin,
  syncOfficialAccountNews,
  unbindAdminInternalId,
  updateAdminNewsTags,
  type AdminAssignment,
  type AdminAnalytics,
  type AdminAiCosts, type AdminAiBalance,
  type VirtualPurchaseOrder,type VirtualPurchaseCase,
  type VirtualPurchaseReconciliation,
  type AdminAnalyticsPeriod,
  type AdminInternalId,
  type AdminNewsPost,
  type NewsRetirementTask,
  type NewsRetirementBatch,
  type AdminTeacher,
  type AdminUser,
  type AdminControlBox,
  type AdminControlDraft,
  type AssessmentKeyHead,
  type AssessmentKeyObject,
  type CreditPlan, type CreditPlanHead,
  type StudentSummary,
} from '../../utils/request'

import {beijingNewsTime,newsPublicationLabel} from '../../utils/news-date'
import { AI_SERVICE_PRESETS, rigorToTemperature } from '../../utils/ai-service-catalog'

type Section = 'admin-users' | 'admin-assignments' | 'admin-news' | 'admin-analytics' | 'admin-readonly' | 'admin-controls'
function controlLoadError(error: unknown) {
  if (error instanceof ApiRequestError) {
    if (error.code === 'backend_version_mismatch') {
      return '当前 API 尚未部署商业闭环 v2。多密钥对象与评估次数方案暂不可操作，需完成后端迁移和发布后再试。'
    }
    if (error.code === 'schema_missing') {
      return '当前 API 的商业闭环 v2 数据结构尚未就绪，需完成后端迁移后再试。'
    }
  }
  return friendlyRequestError(error, '设置未能读取')
}
function moneyFen(text: string) {
  return /^\d{1,5}(?:\.\d{1,2})?$/.test(text) ? Math.round(Number(text) * 100) : NaN
}
const FIXED_PRICES = { JC000: 10, JC001: 190, JC002: 890, JC003: 1690 }
function costEstimateNotice(counts: Record<keyof typeof FIXED_PRICES, number>, costFen: number | null) {
  if (costFen === null) return '尚未填写单次模型成本；估算状态，仍可凭口令启用。'
  const warnings = (Object.keys(FIXED_PRICES) as Array<keyof typeof FIXED_PRICES>)
    .filter(key => FIXED_PRICES[key] * 10 < costFen * counts[key] * 12)
  return warnings.length ? `按填写的成本估算，${warnings.join('、')} 的售价可能不足以覆盖成本及 20% 缓冲；仍可凭口令启用。` :
    '按填写的成本估算，当前四档售价均留有 20% 缓冲；这不是供应商账单或实时余额。'
}
function joinedLabel(createdAt?: string) {
  if (!createdAt) return '加入时间未记录'
  const value = new Date(createdAt).getTime()
  if (!Number.isFinite(value) || value > Date.now()) return '加入时间待核对'
  return `${new Date(value + 8 * 3600000).toISOString().slice(0, 10)} · 已加入 ${Math.floor((Date.now() - value) / 86400000)} 天`
}
type Point = { display:string;key:string;label:string;count:number;x:number;barX:number;height:number;bottom:number;labelBottom:number;prevX:number;prevBottom:number;length:number;angle:number;hasPrev:boolean }
type Plot = { unit:string;key:string;title:string;width:number;max:number;points:Point[] }
function makePlot(key:'assessmentCount'|'createdCount'|'rechargeCount'|'rechargeAmountFen'|'consumptionCount'|'releasedCount'|'failedCount'|'runningCount',title:string,rows:AdminAnalytics['buckets']):Plot {
  const scale=key==='rechargeAmountFen'?100:1
  const values=rows.map(row=>Number(row[key]??0)/scale)
  const actualMax=Math.max(0,...values)
  const max=Math.max(1,actualMax)
  const points=rows.map((row,i)=>{
    const x=48+i*90, height=Math.round(values[i]/max*155)
    const prevHeight=i>0?Math.round(values[i-1]/max*155):0
    const delta=height-prevHeight
    return {display:key==='rechargeAmountFen'?values[i].toFixed(2):String(values[i]),key:row.key,label:row.label,count:values[i],x,barX:x-24,height,bottom:36+height,labelBottom:50+height,
      prevX:x-90,prevBottom:36+prevHeight,length:Math.sqrt(90*90+delta*delta),angle:-Math.atan2(delta,90)*180/Math.PI,hasPrev:i>0}
  })
  return {key,title,unit:key==='rechargeAmountFen'?'元':'次',width:rows.length*90+40,max:actualMax,points}
}

function newsReviewState(posts: AdminNewsPost[], unclassifiedFirst=false) {
  // Review queue is derived from existing canonical tags; no secondary state store.
  const sorted = [...posts].sort(
    (a, b) => (unclassifiedFirst ? Number(b.tags.length===0)-Number(a.tags.length===0) : 0) ||
      (new Date(b.publishedAt||b.sourceUpdatedAt||0).getTime()-new Date(a.publishedAt||a.sourceUpdatedAt||0).getTime()),
  )
  return {
    posts: sorted.map(post=>({...post,dateLabel:newsPublicationLabel(post),
      lifecycleLabel:post.status!=='active'?'已隐藏':!post.tags.length?'未审核':post.lifecycle?[
        ({normal:'正常展示',buffering:'超出30条窗口 · 72小时缓冲',retired:'已退出公共列表',source_invalid:'源端不可用'} as Record<string,string>)[post.lifecycle.phase]||post.lifecycle.phase,
        '状态变更：'+beijingNewsTime(post.lifecycle.phaseChangedAt,true),
        ...(post.lifecycle.bufferedAt?['进入缓冲：'+beijingNewsTime(post.lifecycle.bufferedAt,true)]:[]),
        ...(post.lifecycle.retireAt?['退出时间：'+beijingNewsTime(post.lifecycle.retireAt,true)]:[]),
      ].join(' · '):''})),
    pendingClassificationCount: posts.filter((post) => post.tags.length === 0).length,
  }
}

const ID_TYPES = [
  { value: 'student', label: '学员ID' },
  { value: 'teacher', label: '老师ID' },
  { value: 'admin', label: '管理员ID' },
] as const

Page({
  data: {
    section: 'admin-users' as Section,
    analyticsPeriod: 'week' as AdminAnalyticsPeriod,
    chartMode: 'line' as 'line' | 'bar',
    analytics: null as (AdminAnalytics & { payers: Array<AdminAnalytics['payers'][number] & { amountYuan: string }> }) | null,
    analyticsPlots: [] as Plot[],
    analyticsWarning:'',
    paymentOrders:[] as Array<VirtualPurchaseOrder & {amountYuan:string}>,
    paymentCases:[] as VirtualPurchaseCase[],paymentOpsError:'',
    paymentReconciliation:null as VirtualPurchaseReconciliation|null,
    paymentStatusFilter:'all',
    aiCosts:null as AdminAiCosts|null, aiBalance:null as AdminAiBalance|null,
    aiCostWarning:'',
    aiPriceModel:'deepseek-v4-pro',aiPriceHit:'',aiPriceMiss:'',aiPriceOutput:'',
    aiPricePeakMiss:'',aiPricePeakOutput:'',aiPricePeakWindow:'',
    aiPriceDate:'',aiPriceNote:'',aiFxRate:'',aiFxSource:'',aiFxDate:'',aiFxNote:'',
    assessmentUserCountLabel:'数据源不可用',
    userCount:null as number|null,
    userCountError:'',
    rechargeAmountLabel:'',
    loading: true,
    actionLoading: false,
    controlModule: 'ai' as 'ai' | 'credits',
    keyFormOpen: false, planFormOpen: false,
    aiServices: AI_SERVICE_PRESETS,
    keyProviderIndex: 0, keyModelIndex: 0,
    keyModelOptions: AI_SERVICE_PRESETS[0]!.models,
    keyPresetNote: AI_SERVICE_PRESETS[0]!.note,
    keyRigor: 7,
    activeKey: null as AssessmentKeyObject | null,
    keySourceLabel: '读取中', keyCurrentStatus: '读取中',
    keyAction: '' as '' | 'activate' | 'disable' | 'archive' | 'test' | 'reveal' | 'setup' | 'copy',
    keyActionId: '', keyActionLabel: '', keyActionPin: '', keyActionTargetPin: '',
    keyCopySourcePin: '', keyCopyModel: '', keyCopyLabel: '', keyCopyNote: '',
    keyCopyModels: [] as Array<{id:string; label:string}>, keyCopyModelIndex: 0,
    activePlan: null as CreditPlan | null,
    checkoutStatusLabel: '购买状态读取中',
    planPriceLabels: { JC000: '读取中', JC001: '读取中', JC002: '读取中', JC003: '读取中' },
    fixedPriceCatalogOk: false,
    planCostNotice: '尚未填写单次模型成本；估算状态，仍可凭口令启用。',
    controlSettings: null as AdminControlBox | null,
    controlKey: null as AdminControlBox | null,
    keyObjectsReady: false,
    keyHead: { initialized: false, version: 0, activeObjectId: null } as AssessmentKeyHead,
    keyObjects: [] as AssessmentKeyObject[],
    creditPlansReady: false,
    planHead: { initialized: false, version: 0, activePlanId: null } as CreditPlanHead,
    creditPlans: [] as CreditPlan[],
    planCostConfigFingerprint: null as string | null,
    planName: '', planNote: '', planJc000: '2', planJc001: '1', planJc002: '5', planJc003: '10',
    planCostYuan: '', planCostConfirmed: false, planObjectPin: '', planControlPin: '', planTargetPin: '',
    keyLabel: '', keyProvider: AI_SERVICE_PRESETS[0]!.id,
    keyApiBaseUrl: AI_SERVICE_PRESETS[0]!.baseUrl,
    keyModel: AI_SERVICE_PRESETS[0]!.models[0]!.id,
    keyNote: '', keyObjectPin: '',
    settingsDraft: null as AdminControlDraft | null,
    keyDraft: null as AdminControlDraft | null,
    singleYuan: '1.90', tenYuan: '16.90', guestFreeInput: '1', studentFreeInput: '5', estimatedCostYuan: '',
    platformPriceConfirmed: false,
    settingsOldPin: '', settingsNewPin: '', keyOldPin: '', keyNewPin: '', keyTestPin: '', apiKeyInput: '',
    internalIds: [] as AdminInternalId[],
    visibleIds: [] as ReturnType<typeof internalIdView>[],
    idQuery: '', idFilter: 0, idFilters: ID_FILTERS,
    userQuery: '', visibleUsers: [] as Array<AdminUser & { roleLabel: string; statusLabel: string; displayLabel: string }>,
    unboundAccountCount: 0,
    formMode: '' as '' | 'create' | 'bind', loadError: '',
    users: [] as AdminUser[],
    students: [] as StudentSummary[],
    teachers: [] as AdminTeacher[],
    assignments: [] as AdminAssignment[],
    posts: [] as Array<AdminNewsPost&{dateLabel:string}>,
    newsUnclassifiedFirst:false,
    newsSyncSummary:'',
    newsSyncHistory:'',
    newsV2Enabled:false,
    verifiedFormOpen:false,
    mediaChoices:['图文','贴图','视频原文'],
    verifiedDraft:{title:'',articleUrl:'',summary:'',coverUrl:'',date:'',time:'',tags:'',body:'',mediaType:'article' as 'article'|'image'|'video'},
    retirementTasks:[] as Array<NewsRetirementTask&{retireLabel:string;sourceLabel:string}>,
    unreadRetirementBatches:[] as NewsRetirementBatch[],
    retirementError:'',
    pendingClassificationCount: 0,
    idTypes: ID_TYPES,
    newIdTypeIndex: 0,
    newIdName: '',
    availableIds: [] as AdminInternalId[],
    guestUsers: [] as Array<AdminUser & { displayLabel: string }>,
    bindIdIndex: 0,
    bindUserIndex: 0,
    studentIndex: 0,
    teacherIndex: 0,
    relationship: 'primary' as 'primary' | 'support',
    relationshipOptions: ['主辅导', '协助'],
  },

  onLoad(options: Record<string, string>) {
    authorizePage('pages/admin/admin', options, () => this.initializeAdmin(options))
  },
  initializeAdmin(options: Record<string, string>) {
    const auth = getSavedAuthResult()
    if (!auth || auth.user.role !== 'admin') {
      wx.showToast({ title: '仅管理员可访问', icon: 'none' })
      safeBack()
      return
    }

    const section = String(options.section || 'admin-users') as Section
    if (['admin-users', 'admin-assignments', 'admin-news', 'admin-analytics', 'admin-readonly', 'admin-controls'].includes(section)) {
      this.setData({ section })
    }

    if(this.data.section==='admin-readonly')void this.loadReadOnlyRoster()
    else void this.loadData()
  },

  async loadReadOnlyRoster(){
    try{
      this.setData({loading:true,loadError:''})
      // Read-only identity entry should never depend on payment analytics or news sync.
      const {students,teachers}=await getAdminReadOnlyRoster()
      this.setData({students,teachers})
    }catch(error){
      this.setData({loadError:friendlyRequestError(error,'身份列表未能读取，请重试')})
    }finally{
      this.setData({loading:false})
    }
  },

  async loadData() {
    if (this.data.section === 'admin-readonly') {
      await this.loadReadOnlyRoster()
      return
    }
    if (this.data.section === 'admin-analytics') {
      void this.loadVirtualPaymentOps()
      await this.loadAnalytics()
      return
    }
    if (this.data.section === 'admin-controls') {
      await this.loadControls()
      return
    }
    try {
      this.setData({ loading: true, loadError: '' })
      if (this.data.section === 'admin-news') {
        const newsData = await getAdminNewsData()
        this.setData({
          ...newsReviewState(newsData.posts,this.data.newsUnclassifiedFirst),
          newsV2Enabled:newsData.newsV2Enabled,
          newsSyncHistory:newsData.syncHistory?[`最近成功检查：${newsData.syncHistory.lastCheckedAt?beijingNewsTime(newsData.syncHistory.lastCheckedAt,true):'尚无成功记录'}`,
          `最近失败：${beijingNewsTime(newsData.syncHistory.lastFailedAt,true)}`,
          `最新来源更新时间：${beijingNewsTime(newsData.syncHistory.latestSourceUpdatedAt,true)}（非发表时间）`,
          newsData.syncHistory.lastCheckedAt?`成功检查 ${newsData.syncHistory.fetched} 篇；新增 ${newsData.syncHistory.created}，更新 ${newsData.syncHistory.updated}`:'',
          newsData.syncHistory.lastError?`最近失败原因：${newsData.syncHistory.lastError}（${newsData.syncHistory.failed} 篇）`:''].filter(Boolean).join('\n'):'',
        })
        if(newsData.newsV2Enabled)void this.loadRetirementTasks()
      } else if (this.data.section === 'admin-assignments') {
        const [students, teachers, assignments, internalIds] = await Promise.all([
          getAdminStudents(), getAdminTeachers(), getAdminAssignments(), getAdminInternalIds(),
        ])
        const codeByEntity = new Map(internalIds.filter(item=>item.entityId)
          .map(item=>[item.type+':'+item.entityId, item.businessId]))
        const displayPerson = (name:string, role:'student'|'teacher', id:string) =>
          /^(测试|待命名|待完善|未完善)/.test(name.trim())
            ? (codeByEntity.get(role+':'+id) || '待完善档案')
            : name
        this.setData({ students: students.map(item => ({ ...item, joinedLabel: joinedLabel(item.createdAt),
            displayLabel:displayPerson(item.name,'student',item.id) })),
          teachers: teachers.map(item => ({ ...item, joinedLabel: joinedLabel(item.createdAt),
            displayLabel:displayPerson(item.name,'teacher',item.id) })),
          assignments: assignments.map(item=>({
            ...item,
            studentLabel:displayPerson(item.studentName,'student',item.studentId),
            teacherLabel:displayPerson(item.teacherName,'teacher',item.teacherId),
          })),
          studentIndex: Math.min(this.data.studentIndex, Math.max(0, students.length - 1)),
          teacherIndex: Math.min(this.data.teacherIndex, Math.max(0, teachers.length - 1)),
        })
      } else {
        const [internalIds, users] = await Promise.all([getAdminInternalIds(), getAdminUsers()])
        const availableIds = internalIds.filter(item => item.status === 'available')
        const guestUsers = users.filter(item => item.status === 'active' && item.role === 'user')
          .map(item => ({ ...item, displayLabel: `${item.displayName || '未设置显示名'} · ${item.id.slice(-6)}` }))
        this.setData({ internalIds, users, availableIds, guestUsers,
          bindIdIndex: Math.min(this.data.bindIdIndex, Math.max(0, availableIds.length - 1)),
          bindUserIndex: Math.min(this.data.bindUserIndex, Math.max(0, guestUsers.length - 1)),
        })
        this.refreshLists()
      }
    } catch (error) {
      const message = friendlyRequestError(error, '管理数据读取失败，请重试')
      this.setData({ loadError: message })
      wx.showToast({ title: message, icon: 'none', duration: 2500 })
    } finally {
      this.setData({ loading: false })
    }
  },
  async loadControls() {
    this.setData({ loading: true, loadError: '', keyObjectsReady: false, creditPlansReady: false })
    try {
      const [result, keys, plans, commercialMeta] = await Promise.all([
        getAdminControls(), getAssessmentKeyObjects(), getCreditPlans(),
        getCommercialMeta().catch(() => null),
      ])
      const settings = result.settings.settings
      this.setData({ controlSettings: result.settings, controlKey: result.assessmentKey,
        settingsDraft: result.drafts.settings, keyDraft: result.drafts.assessmentKey,
        singleYuan: ((settings?.singleFen ?? 190) / 100).toFixed(2),
        tenYuan: ((settings?.tenFen ?? 1690) / 100).toFixed(2),
        guestFreeInput: String(settings?.guestFree ?? 1),
        studentFreeInput: String(settings?.studentTotalFree ?? 5),
        estimatedCostYuan: settings?.estimatedCostFen == null ? '' : (settings.estimatedCostFen / 100).toFixed(2),
        platformPriceConfirmed: settings?.platformPriceConfirmed ?? false,
        settingsOldPin: '', settingsNewPin: '', keyOldPin: '', keyNewPin: '', keyTestPin: '', apiKeyInput: '',
        keyObjectsReady: true, keyHead: keys.head, keyObjects: keys.objects,
        activeKey: keys.objects.find(item => item.id === keys.head.activeObjectId) ?? null,
        keySourceLabel: keys.head.initialized ? '管理员后台' :
          result.assessmentKey.configured ? '兼容配置' : 'ECS 环境变量',
        keyCurrentStatus: keys.head.initialized && !keys.head.activeObjectId ? '已停用' :
          keys.head.activeObjectId ? '已启用' : '待确认',
        creditPlansReady: true, planHead: plans.head, creditPlans: plans.plans,
        activePlan: plans.plans.find(item => item.id === plans.head.activePlanId) ?? null,
        checkoutStatusLabel: commercialMeta
          ? (commercialMeta.payment.checkoutEnabled ? '微信虚拟支付配置已就绪' : '微信虚拟支付配置未就绪')
          : '购买状态暂未取得，请到商品页核实',
        planPriceLabels: Object.fromEntries(plans.prices.map(item => [item.key,
          `¥${(item.amountFen / 100).toFixed(2)}`])) as typeof this.data.planPriceLabels,
        fixedPriceCatalogOk: (Object.keys(FIXED_PRICES) as Array<keyof typeof FIXED_PRICES>)
          .every(key => plans.prices.some(item => item.key === key && item.amountFen === FIXED_PRICES[key])),
        planCostConfigFingerprint: plans.currentCostConfigFingerprint,
        planCostConfirmed: Boolean(plans.currentCostConfigFingerprint &&
          plans.currentCostConfigFingerprint === this.data.planCostConfigFingerprint && this.data.planCostConfirmed) })
    } catch (error) { this.setData({ loadError: controlLoadError(error) }) }
    finally { this.setData({ loading: false }) }
  },
  onControlInput(event: WechatMiniprogram.Input) {
    const name = String(event.currentTarget.dataset.name)
    if (!['singleYuan', 'tenYuan', 'guestFreeInput', 'studentFreeInput', 'estimatedCostYuan',
      'settingsOldPin', 'settingsNewPin', 'keyOldPin', 'keyNewPin', 'keyTestPin', 'apiKeyInput'].includes(name)) return
    this.setData({ [name]: event.detail.value,
      ...(name === 'singleYuan' || name === 'tenYuan' ? { platformPriceConfirmed: false } : {}) })
  },
  onKeyObjectInput(event: WechatMiniprogram.Input) {
    const name = String(event.currentTarget.dataset.name)
    if (!['keyLabel', 'keyProvider', 'keyApiBaseUrl', 'keyModel',
      'keyNote', 'keyObjectPin', 'apiKeyInput'].includes(name)) return
    this.setData({ [name]: event.detail.value })
  },
  onControlModule(event: WechatMiniprogram.CustomEvent) {
    this.setData({ controlModule: event.currentTarget.dataset.module === 'credits' ? 'credits' : 'ai' })
  },
  onToggleKeyForm() { this.setData({ keyFormOpen: !this.data.keyFormOpen }) },
  onTogglePlanForm() { this.setData({ planFormOpen: !this.data.planFormOpen }) },
  onProviderChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const index = Number(event.detail.value)
    const preset = AI_SERVICE_PRESETS[index]
    if (!preset) return
    this.setData({ keyProviderIndex: index, keyModelIndex: 0,
      keyModelOptions: preset.models, keyProvider: preset.id,
      keyApiBaseUrl: preset.baseUrl, keyModel: preset.models[0]!.id,
      keyPresetNote: preset.note,
      keyLabel: this.data.keyLabel.trim() || `${preset.name} 评估服务` })
  },
  onModelChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const index = Number(event.detail.value)
    const model = this.data.keyModelOptions[index]
    if (model) this.setData({ keyModelIndex: index, keyModel: model.id })
  },
  onRigorChange(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
    const value = Number(event.detail.value)
    if (Number.isInteger(value) && value >= 1 && value <= 10) this.setData({ keyRigor: value })
  },
  onPlanInput(event: WechatMiniprogram.Input) {
    const name = String(event.currentTarget.dataset.name)
    if (!['planName','planNote','planJc000','planJc001','planJc002','planJc003',
      'planCostYuan','planObjectPin','planControlPin','planTargetPin'].includes(name)) return
    this.setData({ [name]: event.detail.value,
      ...(name === 'planCostYuan' ? { planCostConfirmed: false } : {}),
      planCostNotice: costEstimateNotice({
        JC000: Number(name === 'planJc000' ? event.detail.value : this.data.planJc000),
        JC001: Number(name === 'planJc001' ? event.detail.value : this.data.planJc001),
        JC002: Number(name === 'planJc002' ? event.detail.value : this.data.planJc002),
        JC003: Number(name === 'planJc003' ? event.detail.value : this.data.planJc003),
      }, (name === 'planCostYuan' ? event.detail.value : this.data.planCostYuan).trim() ?
        moneyFen((name === 'planCostYuan' ? event.detail.value : this.data.planCostYuan).trim()) : null) })
  },
  onPlanCostConfirm(event: WechatMiniprogram.CustomEvent<{ value: boolean }>) {
    if (event.detail.value && !this.data.planCostConfigFingerprint) {
      wx.showToast({ title: '当前 AI 连接不可用，暂不能确认成本', icon: 'none' })
      this.setData({ planCostConfirmed: false })
      return
    }
    this.setData({ planCostConfirmed: event.detail.value })
  },
  async onCreateCreditPlan() {
    if (this.data.actionLoading || !this.data.creditPlansReady || !this.data.fixedPriceCatalogOk) return
    const data = this.data
    const counts = { JC000: Number(data.planJc000), JC001: Number(data.planJc001),
      JC002: Number(data.planJc002), JC003: Number(data.planJc003) }
    const cost = data.planCostYuan.trim() ? moneyFen(data.planCostYuan.trim()) : null
    if (!data.planName.trim() || !/^\d{6}$/.test(data.planObjectPin) ||
      Object.values(counts).some(value => !Number.isInteger(value) || value < 1 || value > 100) ||
      (cost !== null && (!Number.isInteger(cost) || cost < 1))) {
      wx.showToast({ title: '请核对方案、次数、成本及口令', icon: 'none' }); return
    }
    this.setData({ actionLoading: true })
    try {
      const result = await createCreditPlanObject({ name: data.planName.trim(), note: data.planNote.trim(),
        counts, estimatedCostFen: cost, costConfirmed: data.planCostConfirmed && cost !== null,
        expectedCostConfigFingerprint: data.planCostConfigFingerprint, pin: data.planObjectPin })
      this.setData({ planCostConfirmed: false })
      wx.showToast({ title: result.active ? '首套方案已生效' : '候选方案已保存', icon: 'success' })
      await this.loadControls()
    } catch (error) {
      wx.showToast({ title: friendlyRequestError(error, '方案保存失败'), icon: 'none' })
      try {
        const plans = await getCreditPlans()
        this.setData({ creditPlansReady: true, planHead: plans.head, creditPlans: plans.plans,
          planCostConfigFingerprint: plans.currentCostConfigFingerprint, planCostConfirmed: false })
      } catch { this.setData({ planCostConfirmed: false }) }
    } finally { this.setData({ actionLoading: false, planObjectPin: '' }) }
  },
  async onActivateCreditPlan(event: WechatMiniprogram.CustomEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    if (this.data.actionLoading) return
    if (!/^\d{6}$/.test(this.data.planControlPin) || !/^\d{6}$/.test(this.data.planTargetPin)) {
      wx.showToast({ title: '请输入当前方案与目标方案的六位口令', icon: 'none' }); return
    }
    this.setData({ actionLoading: true })
    try {
      await activateCreditPlanObject(id, { expectedVersion: this.data.planHead.version,
        currentPin: this.data.planControlPin, targetPin: this.data.planTargetPin })
      wx.showToast({ title: '次数方案已生效', icon: 'success' })
      await this.loadControls()
    } catch (error) { wx.showToast({ title: friendlyRequestError(error, '方案启用失败'), icon: 'none' }) }
    finally { this.setData({ actionLoading: false, planControlPin: '', planTargetPin: '' }) }
  },
  async onDisableCreditPlan() {
    if (this.data.actionLoading) return
    if (!/^\d{6}$/.test(this.data.planControlPin)) {
      wx.showToast({ title: '请输入当前方案控制口令', icon: 'none' }); return
    }
    this.setData({ actionLoading: true })
    try {
      await disableCurrentCreditPlan({ expectedVersion: this.data.planHead.version,
        currentPin: this.data.planControlPin })
      await this.loadControls()
      wx.showToast({ title: '新订单已暂停', icon: 'success' })
    } catch (error) { wx.showToast({ title: friendlyRequestError(error, '停用方案失败'), icon: 'none' }) }
    finally { this.setData({ actionLoading: false, planControlPin: '' }) }
  },
  async onArchiveCreditPlan(event: WechatMiniprogram.CustomEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    if (this.data.actionLoading) return
    if (!/^\d{6}$/.test(this.data.planControlPin)) {
      wx.showToast({ title: '请输入当前方案控制口令', icon: 'none' }); return
    }
    this.setData({ actionLoading: true })
    try {
      await archiveCreditPlanObject(id, { expectedVersion: this.data.planHead.version,
        currentPin: this.data.planControlPin })
      await this.loadControls()
    } catch (error) { wx.showToast({ title: friendlyRequestError(error, '归档失败'), icon: 'none' }) }
    finally { this.setData({ actionLoading: false, planControlPin: '' }) }
  },
  async onSetupLegacyPlanPin(event: WechatMiniprogram.CustomEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    if (this.data.actionLoading) return
    if (!/^\d{6}$/.test(this.data.planControlPin) || !/^\d{6}$/.test(this.data.planTargetPin)) {
      wx.showToast({ title: '请输入当前方案与目标方案的六位口令', icon: 'none' }); return
    }
    this.setData({ actionLoading: true })
    try {
      await setupLegacyCreditPlanPin(id, this.data.planControlPin, this.data.planTargetPin)
      await this.loadControls()
    } catch (error) { wx.showToast({ title: friendlyRequestError(error, '对象口令设置失败'), icon: 'none' }) }
    finally { this.setData({ actionLoading: false, planControlPin: '', planTargetPin: '' }) }
  },
  async onCreateKeyObject() {
    if (this.data.actionLoading || !this.data.keyObjectsReady) return
    const data = this.data
    if (!/^\d{6}$/.test(data.keyObjectPin) || data.apiKeyInput.trim().length < 8 ||
      !data.keyLabel.trim() || !data.keyProvider.trim() || !data.keyApiBaseUrl.trim() ||
      !data.keyModel.trim()) {
      wx.showToast({ title: '请填写连接参数、密钥和六位对象口令', icon: 'none' }); return
    }
    this.setData({ actionLoading: true })
    try {
      const result = await createAssessmentKeyObject({
        label: data.keyLabel.trim(), provider: data.keyProvider.trim(),
        apiBaseUrl: data.keyApiBaseUrl.trim(), model: data.keyModel.trim(),
        temperature: rigorToTemperature(data.keyRigor), apiKey: data.apiKeyInput.trim(),
        note: data.keyNote.trim(), pin: data.keyObjectPin,
      })
      wx.showToast({ title: result.active ? '首个密钥已生效' : '候选密钥已保存', icon: 'success' })
      await this.loadControls()
    } catch (error) { wx.showToast({ title: friendlyRequestError(error, '密钥保存失败'), icon: 'none' }) }
    finally { this.setData({ actionLoading: false, apiKeyInput: '', keyObjectPin: '' }) }
  },
  onOpenKeyAction(event: WechatMiniprogram.CustomEvent) {
    if (this.data.actionLoading) return
    const action = String(event.currentTarget.dataset.action || '')
    const id = String(event.currentTarget.dataset.id || '')
    if (!['activate', 'disable', 'archive', 'test', 'reveal', 'setup', 'copy'].includes(action)) return
    const target = this.data.keyObjects.find(item => item.id === id)
    const models = action==='copy' ? AI_SERVICE_PRESETS.find(item=>item.id===target?.provider)?.models??[] : []
    this.setData({ keyAction: action as typeof this.data.keyAction, keyActionId: id,
      keyActionLabel: target?.label || this.data.activeKey?.label || '当前服务',
      keyActionPin: '', keyActionTargetPin: '', keyCopySourcePin:'',
      keyCopyModel:models.find(item=>item.id!==target?.model)?.id??'',
      keyCopyLabel:target ? `${target.label} · 新模型` : '', keyCopyNote:'',
      keyCopyModels:models,keyCopyModelIndex:Math.max(0,models.findIndex(item=>item.id!==target?.model)) }, () => {
      wx.pageScrollTo({ selector: '#key-action-panel', duration: 200 })
    })
  },
  onCancelKeyAction() {
    this.setData({ keyAction: '', keyActionId: '', keyActionPin: '', keyActionTargetPin: '',
      keyCopySourcePin:'',keyCopyModel:'',keyCopyLabel:'',keyCopyNote:'' })
  },
  onKeyActionPinInput(event: WechatMiniprogram.Input) {
    const name = String(event.currentTarget.dataset.name)
    if (['keyActionPin','keyActionTargetPin','keyCopySourcePin','keyCopyModel','keyCopyLabel','keyCopyNote'].includes(name))
      this.setData({ [name]: event.detail.value })
  },
  onCopyModelChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value)
    const model = this.data.keyCopyModels[index]
    if(model)this.setData({keyCopyModelIndex:index,keyCopyModel:model.id})
  },
  async onConfirmKeyAction() {
    const { keyAction: action, keyActionId: id, keyActionPin: pin,
      keyActionTargetPin: targetPin } = this.data
    if (this.data.actionLoading || !action) return
    if (!/^\d{6}$/.test(pin) ||
      ((action === 'activate' || action === 'setup' || action === 'copy') && !/^\d{6}$/.test(targetPin)) ||
      (action === 'copy' && !/^\d{6}$/.test(this.data.keyCopySourcePin))) {
      wx.showToast({ title: '请输入本次操作所需的六位口令', icon: 'none' }); return
    }
    if (action === 'disable') {
      const confirmed = await new Promise<boolean>(resolve => wx.showModal({
        title: '确认停用 AI 服务',
        content: '停用后可能无法发起新的 AI 评估。已有报告会保留。确认停用吗？',
        confirmText: '确认停用', confirmColor: '#b54747',
        success: result => resolve(result.confirm), fail: () => resolve(false),
      }))
      if (!confirmed) return
    }
    this.setData({ actionLoading: true })
    try {
      if (action === 'activate') {
        await activateAssessmentKeyObject(id, { expectedVersion: this.data.keyHead.version,
          currentPin: pin, targetPin })
        wx.showToast({ title: '服务已启用', icon: 'success' })
      } else if (action === 'disable') {
        await disableActiveAssessmentKey({ expectedVersion: this.data.keyHead.version, currentPin: pin })
        wx.showToast({ title: '服务已停用', icon: 'success' })
      } else if (action === 'archive') {
        await archiveAssessmentKeyObject(id, { expectedVersion: this.data.keyHead.version, currentPin: pin })
        wx.showToast({ title: '对象已归档', icon: 'success' })
      } else if (action === 'setup') {
        await setupLegacyAssessmentKeyPin(id, pin, targetPin)
        wx.showToast({ title: '对象口令已设置', icon: 'success' })
      } else if (action === 'copy') {
        if (!this.data.keyCopyModel.trim() || !this.data.keyCopyLabel.trim()) {
          wx.showToast({title:'请填写新模型与候选名称',icon:'none'});return
        }
        await copyAssessmentKeyModel(id, { expectedVersion:this.data.keyHead.version,
          currentPin:pin, sourcePin:this.data.keyCopySourcePin, newPin:targetPin,
          label:this.data.keyCopyLabel.trim(), model:this.data.keyCopyModel.trim(),
          note:this.data.keyCopyNote.trim() })
        wx.showToast({title:'新模型候选已保存',icon:'success'})
      } else if (action === 'reveal') {
        const result = await revealAssessmentKeyObject(id, pin)
        wx.showModal({ title: '仅创建者查看密钥', content: result.apiKey, showCancel: false })
      } else {
        const result = await testAssessmentKeyObject(id, pin)
        const messages: Record<string, string> = {
          authentication: '密钥验证失败，请检查密钥',
          model_unavailable: '当前模型不可用，请检查模型名称',
          quota_limited: '供应商额度不足或请求受限',
          connection: '无法连接供应商，请检查服务地址',
          timeout: '模型响应超时',
          truncated: '模型输出达到上限，请检查输出长度',
          invalid_json: '模型返回内容不是有效 JSON',
          invalid_schema: '已收到模型响应，但报告结构不符合要求',
          internal: '服务处理失败，请记录诊断编号',
        }
        wx.showModal({ title: result.reportSchemaValid ? '报告格式通过' : '报告格式未通过',
          content: result.reportSchemaValid
            ? `供应商已返回符合要求的测试报告。真实学员报告尚未验证持久化及扣次。诊断编号：${result.diagnosticId || '旧版 API 未提供'}`
            : `${messages[result.errorCategory || 'internal']}。${result.reachable ? '供应商已有响应。' : '未收到可用响应。'}诊断编号：${result.diagnosticId || '旧版 API 未提供'}`,
          showCancel: false })
      }
      await this.loadControls()
      this.onCancelKeyAction()
    } catch (error) {
      wx.showModal({ title: '操作未完成',
        content: `${friendlyRequestError(error, '操作失败，请稍后重试')}。请核对口令及权限后重试。`,
        showCancel: false })
    } finally { this.setData({ actionLoading: false, keyActionPin: '', keyActionTargetPin: '', keyCopySourcePin:'' }) }
  },
  onControlPriceConfirm(event: WechatMiniprogram.CustomEvent<{ value: boolean }>) {
    this.setData({ platformPriceConfirmed: event.detail.value })
  },
  async onSaveSettingsDraft() {
    if (this.data.actionLoading || !this.data.controlSettings) return
    const singleFen = moneyFen(this.data.singleYuan.trim())
    const tenFen = moneyFen(this.data.tenYuan.trim())
    const estimatedCostFen = this.data.estimatedCostYuan.trim() ? moneyFen(this.data.estimatedCostYuan.trim()) : null
    const guestFree = Number(this.data.guestFreeInput)
    const studentTotalFree = Number(this.data.studentFreeInput)
    if (!Number.isInteger(singleFen) || singleFen < 1 || !Number.isInteger(tenFen) || tenFen < 1 ||
      !/^\d{1,3}$/.test(this.data.guestFreeInput) || !/^\d{1,3}$/.test(this.data.studentFreeInput) ||
      guestFree > 100 || studentTotalFree > 100 || studentTotalFree < guestFree ||
      (estimatedCostFen !== null && (!Number.isInteger(estimatedCostFen) || estimatedCostFen < 1))) {
      wx.showToast({ title: '请核对价格、次数和成本', icon: 'none' }); return
    }
    this.setData({ actionLoading: true })
    try {
      await saveAdminControlDraft('settings', { expectedVersion: this.data.controlSettings.version,
        settings: { singleFen, tenFen, guestFree, studentTotalFree,
          platformPriceConfirmed: this.data.platformPriceConfirmed, estimatedCostFen } })
      wx.showToast({ title: '草稿已保存，未生效', icon: 'none' })
      await this.loadControls()
    } catch (error) { wx.showToast({ title: friendlyRequestError(error, '草稿保存失败'), icon: 'none' }) }
    finally { this.setData({ actionLoading: false }) }
  },
  async onActivateDraft(event: WechatMiniprogram.CustomEvent) {
    const box = event.currentTarget.dataset.box === 'assessment_key' ? 'assessment_key' : 'settings'
    const active = box === 'settings' ? this.data.controlSettings : this.data.controlKey
    const draft = box === 'settings' ? this.data.settingsDraft : this.data.keyDraft
    const currentPin = box === 'settings' ? this.data.settingsOldPin : this.data.keyOldPin
    const newPin = box === 'settings' ? this.data.settingsNewPin : this.data.keyNewPin
    if (this.data.actionLoading || !active || !draft?.saved) return
    if (!/^\d{6}$/.test(newPin) || (active.configured && !/^\d{6}$/.test(currentPin))) {
      wx.showToast({ title: '请填写旧密码与新六位密码', icon: 'none' }); return
    }
    this.setData({ actionLoading: true })
    try {
      await activateAdminControlDraft(box, { expectedVersion: active.version,
        currentPin: active.configured ? currentPin : undefined, newPin })
      wx.showToast({ title: '草稿已生效', icon: 'success' })
      await this.loadControls()
    } catch (error) { wx.showToast({ title: friendlyRequestError(error, '草稿启用失败'), icon: 'none' }) }
    finally { this.setData({ actionLoading: false, settingsOldPin: '', settingsNewPin: '', keyOldPin: '', keyNewPin: '' }) }
  },
  async onSaveKeyDraft() {
    if (this.data.actionLoading || !this.data.controlKey || this.data.apiKeyInput.trim().length < 8) {
      wx.showToast({ title: '请先输入 API Key', icon: 'none' }); return
    }
    this.setData({ actionLoading: true })
    try {
      await saveAdminControlDraft('assessment_key', { expectedVersion: this.data.controlKey.version,
        apiKey: this.data.apiKeyInput.trim() })
      wx.showToast({ title: '密钥草稿已加密保存，未生效', icon: 'none' })
      await this.loadControls()
    } catch (error) { wx.showToast({ title: friendlyRequestError(error, '密钥草稿保存失败'), icon: 'none' }) }
    finally { this.setData({ actionLoading: false, apiKeyInput: '' }) }
  },
  async onSaveSettings() {
    if (this.data.actionLoading || !this.data.controlSettings) return
    const singleFen = moneyFen(this.data.singleYuan.trim())
    const tenFen = moneyFen(this.data.tenYuan.trim())
    const guestFree = Number(this.data.guestFreeInput)
    const studentTotalFree = Number(this.data.studentFreeInput)
    const estimatedCostFen = this.data.estimatedCostYuan.trim() ? moneyFen(this.data.estimatedCostYuan.trim()) : null
    if (!Number.isInteger(singleFen) || singleFen < 1 || !Number.isInteger(tenFen) || tenFen < 1 ||
      !/^\d{1,3}$/.test(this.data.guestFreeInput) || !/^\d{1,3}$/.test(this.data.studentFreeInput) ||
      studentTotalFree < guestFree || guestFree > 100 || studentTotalFree > 100 ||
      (estimatedCostFen !== null && (!Number.isInteger(estimatedCostFen) || estimatedCostFen < 1)) ||
      !/^\d{6}$/.test(this.data.settingsNewPin) ||
      (this.data.controlSettings.configured && !/^\d{6}$/.test(this.data.settingsOldPin))) {
      wx.showToast({ title: '请核对金额、次数和六位密码', icon: 'none' }); return
    }
    this.setData({ actionLoading: true })
    try {
      await saveAdminControl('settings', {
        expectedVersion: this.data.controlSettings.version,
        currentPin: this.data.controlSettings.configured ? this.data.settingsOldPin : undefined,
        newPin: this.data.settingsNewPin,
        settings: { singleFen, tenFen, guestFree, studentTotalFree,
          platformPriceConfirmed: this.data.platformPriceConfirmed, estimatedCostFen },
      })
      wx.showToast({ title: '设置已保存', icon: 'success' })
      await this.loadControls()
    } catch (error) { wx.showToast({ title: friendlyRequestError(error, '设置保存失败'), icon: 'none' }) }
    finally { this.setData({ actionLoading: false, settingsOldPin: '', settingsNewPin: '' }) }
  },
  async onSaveAssessmentKey() {
    if (this.data.actionLoading || !this.data.controlKey) return
    if (!/^\d{6}$/.test(this.data.keyNewPin) ||
      (this.data.controlKey.configured && !/^\d{6}$/.test(this.data.keyOldPin)) ||
      this.data.apiKeyInput.trim().length < 8) {
      wx.showToast({ title: '请填写密钥与六位密码', icon: 'none' }); return
    }
    this.setData({ actionLoading: true })
    try {
      await saveAdminControl('assessment_key', {
        expectedVersion: this.data.controlKey.version,
        currentPin: this.data.controlKey.configured ? this.data.keyOldPin : undefined,
        newPin: this.data.keyNewPin, apiKey: this.data.apiKeyInput.trim(),
      })
      wx.showToast({ title: '密钥已加密保存', icon: 'success' })
      await this.loadControls()
    } catch (error) { wx.showToast({ title: friendlyRequestError(error, '密钥保存失败'), icon: 'none' }) }
    finally { this.setData({ actionLoading: false, apiKeyInput: '', keyOldPin: '', keyNewPin: '' }) }
  },
  async onTestAssessmentKey() {
    if (this.data.actionLoading || !/^\d{6}$/.test(this.data.keyTestPin)) return
    this.setData({ actionLoading: true })
    try {
      await testAdminAssessmentKey(this.data.keyTestPin)
      wx.showToast({ title: '模型接口可用', icon: 'success' })
    } catch (error) { wx.showToast({ title: friendlyRequestError(error, '接口测试未通过'), icon: 'none' }) }
    finally { this.setData({ actionLoading: false, keyTestPin: '' }) }
  },
  analyticsGeneration:0,
  onAiCostInput(event:WechatMiniprogram.Input){
    const name=String(event.currentTarget.dataset.name)
    if(['aiPriceModel','aiPriceHit','aiPriceMiss','aiPriceOutput','aiPricePeakMiss',
      'aiPricePeakOutput','aiPricePeakWindow','aiPriceDate','aiPriceNote',
      'aiFxRate','aiFxSource','aiFxDate','aiFxNote'].includes(name))
      this.setData({[name]:event.detail.value})
  },
  async onCheckDeepseekPriceSource(){
    if(this.data.actionLoading)return
    this.setData({actionLoading:true})
    try{
      const result=await checkDeepseekPriceSource()
      wx.showModal({title:'官方价格来源检查',content:result.status==='unchanged'?
        '官方文档内容与已审核快照一致。仍请核对具体价格。':
        '官方文档内容有变化或尚无已审核快照。请人工核对价格后再审核新版本。',showCancel:false})
      await this.loadAnalytics()
    }catch(error){wx.showToast({title:friendlyRequestError(error,'价格来源检查失败'),icon:'none'})}
    finally{this.setData({actionLoading:false})}
  },
  async onReviewAiPrice(){
    if(this.data.actionLoading)return
    const d=this.data,number=(value:string)=>/^\d+(?:\.\d{1,6})?$/.test(value)?Number(value):NaN
    const hit=number(d.aiPriceHit),miss=number(d.aiPriceMiss),output=number(d.aiPriceOutput)
    const peakMiss=d.aiPricePeakMiss.trim()?number(d.aiPricePeakMiss):null
    const peakOutput=d.aiPricePeakOutput.trim()?number(d.aiPricePeakOutput):null
    if(!d.aiCosts||d.aiCosts.priceSource.status==='not_checked'||!d.aiPriceModel.trim()||
      ![hit,miss,output,peakMiss,peakOutput].every(v=>v===null||Number.isFinite(v)&&v>=0)||
      !/^\d{4}-\d{2}-\d{2}$/.test(d.aiPriceDate)||d.aiPriceNote.trim().length<8){
      wx.showToast({title:'请先检查官方来源并完整填写价格、日期及说明',icon:'none'});return
    }
    const confirmed=await new Promise<boolean>(resolve=>wx.showModal({
      title:'人工审核价格版本',content:'请确认已在 DeepSeek 官方价格页逐项核对美元/百万 token、峰谷规则及生效日期。保存后仅用于估算，不代表实际账单。',
      success:result=>resolve(result.confirm),fail:()=>resolve(false)}))
    if(!confirmed)return
    this.setData({actionLoading:true})
    try{
      const expected=d.aiCosts.latestPriceVersions.find(v=>v.provider==='deepseek'&&v.model===d.aiPriceModel.trim())?.version??null
      await reviewDeepseekPrice({model:d.aiPriceModel.trim(),expectedLatestVersion:expected,
        inputCacheHitPerMillion:hit,inputCacheMissPerMillion:miss,outputPerMillion:output,
        peakInputCacheMissPerMillion:peakMiss,peakOutputPerMillion:peakOutput,
        peakWindowUtc:d.aiPricePeakWindow.trim()||null,
        effectiveAt:new Date(d.aiPriceDate+'T00:00:00Z').toISOString(),reviewNote:d.aiPriceNote.trim()})
      wx.showToast({title:'价格快照已审核',icon:'success'});await this.loadAnalytics()
    }catch(error){wx.showToast({title:friendlyRequestError(error,'价格审核失败'),icon:'none'})}
    finally{this.setData({actionLoading:false})}
  },
  async onReviewAiFx(){
    if(this.data.actionLoading)return
    const d=this.data,rate=Number(d.aiFxRate)
    if(!Number.isFinite(rate)||rate<=0||rate>20||!/^https:\/\//.test(d.aiFxSource)||
      !/^\d{4}-\d{2}-\d{2}$/.test(d.aiFxDate)||d.aiFxNote.trim().length<8){
      wx.showToast({title:'请完整填写汇率、来源、日期及说明',icon:'none'});return
    }
    this.setData({actionLoading:true})
    try{
      await reviewAiExchangeRate({rate,sourceUrl:d.aiFxSource.trim(),
        observedAt:new Date(d.aiFxDate+'T00:00:00Z').toISOString(),reviewNote:d.aiFxNote.trim()})
      wx.showToast({title:'汇率快照已审核',icon:'success'});await this.loadAnalytics()
    }catch(error){wx.showToast({title:friendlyRequestError(error,'汇率审核失败'),icon:'none'})}
    finally{this.setData({actionLoading:false})}
  },
  async loadAnalytics() {
    const generation=++this.analyticsGeneration
    const owner=getSavedAuthResult()?.user.id
    const period=this.data.analyticsPeriod
    try {
      this.setData({ loading: true, loadError: '' })
      const [statistics, accounts, costs, balance] = await Promise.allSettled([
        getAdminAnalytics(period), getAdminUsers(), getAdminAiCosts(), getAdminAiBalance()])
      if(statistics.status==='rejected')throw statistics.reason
      const analytics = statistics.value
      if(!analytics.sources || !analytics.range || !analytics.summary)throw new Error('当前统计数据暂不完整，请稍后重试')
      if(generation!==this.analyticsGeneration || period!==this.data.analyticsPeriod || owner!==getSavedAuthResult()?.user.id)return
      this.setData({
        userCount:accounts.status==='fulfilled' && Array.isArray(accounts.value) ? accounts.value.length : null,
        assessmentUserCountLabel:typeof analytics.summary.assessmentUserCount==='number'?String(analytics.summary.assessmentUserCount):'暂未提供',
        userCountError:accounts.status==='rejected'?friendlyRequestError(accounts.reason,'账号数量暂不可用'):accounts.status==='fulfilled' && !Array.isArray(accounts.value)?'账号数量暂不可用':'',
        analytics: { ...analytics, payers: analytics.payers.map(row => ({ ...row, amountYuan: (row.amountFen/100).toFixed(2) })) },
        aiCosts:costs.status==='fulfilled'?costs.value:null,
        aiBalance:balance.status==='fulfilled'?balance.value:null,
        aiCostWarning:costs.status==='rejected'?'模型请求明细暂不可用，请稍后重试。':'',
        rechargeAmountLabel:analytics.summary.rechargeAmountFen===null?'读取失败':(analytics.summary.rechargeAmountFen/100).toFixed(2),
        analyticsWarning:Object.entries(analytics.sources).filter(([,state])=>state.status==='error').map(([source])=>({assessments:'评估',payments:'支付',ledger:'账本',reservations:'冻结记录'}[source]||'部分统计')+'暂不可用').join('；'),
        analyticsPlots: [
          makePlot('assessmentCount', 'AI 评估使用次数', analytics.buckets),
          makePlot('createdCount', '创建评估任务', analytics.buckets),
          ...(analytics.sources.payments.status==='ok'?[makePlot('rechargeCount','成功充值订单次数',analytics.buckets),makePlot('rechargeAmountFen','成功充值金额',analytics.buckets)]:[]),
          ...(analytics.sources.ledger.status==='ok'?[makePlot('consumptionCount','实际额度消费笔数（账本）',analytics.buckets)]:[]),
          ...(analytics.sources.reservations.status==='ok'?[makePlot('releasedCount','额度退回记录笔数',analytics.buckets)]:[]),
          makePlot('failedCount','失败评估任务',analytics.buckets),
          makePlot('runningCount','运行中的评估任务',analytics.buckets),
        ],
      })
    } catch (error) {
      if(generation!==this.analyticsGeneration || owner!==getSavedAuthResult()?.user.id)return
      this.setData({ analytics: null, analyticsPlots: [], userCount:null, userCountError:'', loadError: friendlyRequestError(error, '统计暂时不可用') })
    } finally {
      if(generation===this.analyticsGeneration)this.setData({ loading: false })
    }
  },
  async loadVirtualPaymentOps() {
    try {
      const filter=this.data.paymentStatusFilter
      const [orders,cases,reconciliation]=await Promise.all([
        getAdminVirtualPurchaseOrders(filter==='all'?undefined:filter),
        getAdminVirtualPurchaseCases(),
        getAdminVirtualReconciliation(),
      ])
      this.setData({paymentOpsError:'',paymentOrders:orders.map(order=>({
        ...order,amountYuan:(order.amountFen/100).toFixed(2),
      })),paymentCases:cases,paymentReconciliation:reconciliation})
    } catch(error) {
      this.setData({paymentOpsError:friendlyRequestError(error,'订单核对暂不可用')})
    }
  },
  onPaymentStatusFilter(event:WechatMiniprogram.BaseEvent) {
    const filter=String(event.currentTarget.dataset.status)
    if(!['all','pending','paid','closed','refunded'].includes(filter))return
    this.setData({paymentStatusFilter:filter})
    void this.loadVirtualPaymentOps()
  },
  async onRecheckVirtualOrder(event:WechatMiniprogram.BaseEvent) {
    if(this.data.actionLoading)return
    const id=String(event.currentTarget.dataset.id||'')
    if(!this.data.paymentOrders.some(order=>order.id===id))return
    this.setData({actionLoading:true})
    try {
      const result=await recheckAdminVirtualPurchaseOrder(id)
      await this.loadVirtualPaymentOps()
      wx.showModal({title:'官方查单结果',content:result.state==='paid'
        ? '已核验付款；到账与发货状态请核对订单列表。'
        : result.state==='review'?'发现需人工核对的状态，未自动冲正或发放次数。'
        : '当前状态：'+result.state+'。未核实付款时不会发放次数。',showCancel:false})
    } catch(error) {
      wx.showToast({title:friendlyRequestError(error,'官方查单未完成'),icon:'none'})
    } finally {this.setData({actionLoading:false})}
  },
  onReviewVirtualCase(event:WechatMiniprogram.BaseEvent) {
    if(this.data.actionLoading)return
    const id=String(event.currentTarget.dataset.id||'')
    if(!this.data.paymentCases.some(item=>item.id===id))return
    wx.showActionSheet({itemList:['标记处理中','完成复核'],success:selection=>{
      const action=selection.tapIndex===0?'processing':'resolved'
      wx.showModal({title:action==='processing'?'标记人工处理中':'完成人工复核',
        content:'请先核对微信后台、订单与学点流水。此操作只记录状态，不会退款或增减次数。',
        editable:true,placeholderText:'填写至少 8 字的复核结论',success:result=>{
          if(result.confirm && result.content?.trim())
            void this.reviewVirtualCase(id,result.content.trim(),action)
        }})
    }})
  },
  async reviewVirtualCase(id:string,note:string,action:'processing'|'resolved') {
    if(this.data.actionLoading)return
    this.setData({actionLoading:true})
    try {await reviewAdminVirtualPurchaseCase(id,note,action);await this.loadVirtualPaymentOps()
      wx.showToast({title:'复核已记录',icon:'success'})}
    catch(error){wx.showToast({title:friendlyRequestError(error,'复核记录失败'),icon:'none'})}
    finally{this.setData({actionLoading:false})}
  },
  onAnalyticsPeriod(event: WechatMiniprogram.BaseEvent) {
    const period = String(event.currentTarget.dataset.period)
    if (!['week','month','year'].includes(period) || period === this.data.analyticsPeriod) return
    this.setData({ analyticsPeriod: period as AdminAnalyticsPeriod })
    void this.loadAnalytics()
  },
  onChartMode(event: WechatMiniprogram.BaseEvent) {
    const mode = String(event.currentTarget.dataset.mode)
    if (mode === 'line' || mode === 'bar') this.setData({ chartMode: mode })
  },
  refreshLists() {
    const q = this.data.userQuery.trim().toLowerCase()
    const matched = this.data.users.filter(u => !q || [u.displayName, u.id].some(v => v?.toLowerCase().includes(q)))
    this.setData({
      visibleIds: filterInternalIds(this.data.internalIds, this.data.idQuery, this.data.idFilter, getSavedAuthResult()?.user.id),
      unboundAccountCount: this.data.users.filter(user => user.role === 'user').length,
      visibleUsers: matched.filter(user => user.role !== 'user').map(user => ({
        ...user,
        displayLabel: { user: '普通账号', student: '学员账号', teacher: '老师账号', staff: '内部员工账号', admin: '管理员账号' }[user.role],
        roleLabel: { user: '普通用户', student: '学员', teacher: '老师', staff: '内部员工', admin: '管理员' }[user.role],
        joinedLabel: joinedLabel(user.createdAt),
        statusLabel: user.status === 'active' ? '正常' : '已停用',
      })),
    })
  },
  onIdSearch(event: WechatMiniprogram.Input) { this.setData({ idQuery: event.detail.value }); this.refreshLists() },
  onUserSearch(event: WechatMiniprogram.Input) { this.setData({ userQuery: event.detail.value }); this.refreshLists() },
  onIdFilter(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ idFilter: Number(event.detail.value) }); this.refreshLists() },
  onNewEntry() {
    if (this.data.actionLoading) return
    wx.showActionSheet({ itemList: ['生成新编号', '绑定已有编号'], success: result => this.setData({ formMode: result.tapIndex === 0 ? 'create' : 'bind' }) })
  },
  onCloseForm() { if (!this.data.actionLoading) this.setData({ formMode: '' }) },
  onOpenMyIdentity() { wx.switchTab({url:'/pages/profile/profile'}) },
  onCopyId(event: WechatMiniprogram.BaseEvent) {
    const item = this.data.internalIds.find(i => i.id === event.currentTarget.dataset.id)
    if (item) wx.setClipboardData({ data: item.businessId, fail: () => wx.showToast({ title: '复制失败，请重试', icon: 'none' }) })
  },
  onIdActions(event: WechatMiniprogram.BaseEvent) {
    if (this.data.actionLoading) return
    const item = this.data.internalIds.find(i => i.id === event.currentTarget.dataset.id)
    if (!item) return
    const view = internalIdView(item, getSavedAuthResult()?.user.id)
    if (!view.actions.length) return
    wx.showActionSheet({ itemList: view.actions, success: result => {
      const action = view.actions[result.tapIndex]
      if (action === '绑定账号') {
        const index = this.data.availableIds.findIndex(i => i.id === item.id)
        if (index < 0) {
          wx.showToast({title:'编号当前不可绑定，请刷新列表',icon:'none'})
          return
        }
        this.setData({ formMode: 'bind', bindIdIndex: index }, () => wx.pageScrollTo({scrollTop:0,duration:240}))
        return
      }
      if (action === '暂停访问') this.onPauseId(event)
      if (action === '恢复编号') this.onRestoreId(event)
      if (action === '撤销授权') this.onUnbindId(event)
      if (action === '删除编号') this.onDeleteId(event)
    } })
  },

  onSectionChange(event: WechatMiniprogram.BaseEvent) {
    const section = String(event.currentTarget.dataset.section) as Section
    if (!['admin-users', 'admin-assignments', 'admin-news', 'admin-analytics', 'admin-readonly', 'admin-controls'].includes(section)) return
    this.setData({ section })
    if (section === 'admin-analytics') {void this.loadAnalytics();void this.loadVirtualPaymentOps()}
    else if (section === 'admin-controls') void this.loadControls()
    else if (section === 'admin-readonly') void this.loadReadOnlyRoster()
    else if(section==='admin-news'&&this.data.newsV2Enabled)void this.loadRetirementTasks()
  },

  onIdTypeChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ newIdTypeIndex: Number(event.detail.value) })
  },

  onNameInput(event: WechatMiniprogram.Input) {
    this.setData({ newIdName: event.detail.value })
  },

  async onCreateId() {
    if (this.data.actionLoading) return
    const selected = ID_TYPES[this.data.newIdTypeIndex]
    try {
      this.setData({ actionLoading: true })
      await createAdminInternalId(selected.value, this.data.newIdName.trim() || null)
      this.setData({ newIdName: '', formMode: '' })
      wx.showToast({ title: '内部ID已生成', icon: 'success' })
      await this.loadData()
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败'
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      this.setData({ actionLoading: false })
    }
  },

  onBindIdChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ bindIdIndex: Number(event.detail.value) })
  },

  onBindUserChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ bindUserIndex: Number(event.detail.value) })
  },

  async onBindId() {
    if (this.data.actionLoading) return
    const identity = this.data.availableIds[this.data.bindIdIndex]
    const user = this.data.guestUsers[this.data.bindUserIndex]
    if (!identity || !user) {
      wx.showToast({ title: '暂无可绑定ID或游客账号', icon: 'none' })
      return
    }

    try {
      this.setData({ actionLoading: true })
      await bindAdminInternalId(identity.id, user.id)
      this.setData({ formMode: '' })
      wx.showToast({ title: '绑定成功', icon: 'success' })
      await this.loadData()
    } catch (error) {
      const message = error instanceof Error ? error.message : '绑定失败'
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      this.setData({ actionLoading: false })
    }
  },

  onUnbindId(event: WechatMiniprogram.BaseEvent) {
    this.confirmIdAction(event, '撤销授权', unbindAdminInternalId, '撤销后账号退回普通用户，编号停用；恢复编号不会自动绑定原账号。', true)
  },
  onPauseId(event: WechatMiniprogram.BaseEvent) {
    this.confirmIdAction(event, '暂停访问', pauseAdminInternalId, '保留原绑定，但账号立即无法进行授权操作；恢复后原账号可继续使用。')
  },
  onRestoreId(event: WechatMiniprogram.BaseEvent) {
    const identity = this.data.internalIds.find(i => i.id === event.currentTarget.dataset.id)
    this.confirmIdAction(event, '恢复编号', restoreAdminInternalId, identity?.userId ? '恢复后原绑定账号重新获得访问权限。' : '恢复后编号可重新认领，不会自动授予原账号权限。')
  },
  onDeleteId(event: WechatMiniprogram.BaseEvent) {
    this.confirmIdAction(event, '删除编号', deleteAdminInternalId, '永久删除未绑定编号及其占位学员/老师档案，不能撤回；已有绑定编号不可删除。', true)
  },
  confirmingId: false,
  confirmIdAction(event: WechatMiniprogram.BaseEvent, title: string, operation: (id: string) => Promise<void>, consequence: string, dangerous = false) {
    if (this.data.actionLoading || this.confirmingId) return
    const id = String(event.currentTarget.dataset.id || '')
    const identity = this.data.internalIds.find(i => i.id === id)
    if (!identity || !internalIdView(identity, getSavedAuthResult()?.user.id).actions.includes(title)) return
    this.confirmingId = true
    wx.showModal({
      title, content: `${identity.businessId}\n${consequence}`, confirmText: title, cancelText: '取消', confirmColor: dangerous ? '#aa3430' : '#2459be',
      success: async (result) => {
        this.confirmingId = false
        if (!result.confirm) return
        try {
          this.setData({ actionLoading: true })
          await operation(id)
          await this.loadData()
          wx.showToast({ title: `${title}成功`, icon: 'success' })
        } catch (error) {
          wx.showToast({ title: friendlyRequestError(error, `${title}失败，请重试`), icon: 'none' })
        } finally { this.setData({ actionLoading: false }) }
      },
      fail: () => { this.confirmingId = false },
    })
  },

  onReadOnlyStudent(event: WechatMiniprogram.BaseEvent) {
    const id=String(event.currentTarget.dataset.id||'')
    if(!this.data.students.some(x=>x.id===id&&(x as StudentSummary&{canView?:boolean}).canView!==false))return
    wx.navigateTo({url:'/packages/read-only/view/view?kind=student&id='+encodeURIComponent(id)})
  },
  onReadOnlyTeacher(event: WechatMiniprogram.BaseEvent) {
    const id=String(event.currentTarget.dataset.id||'')
    if(!this.data.teachers.some(x=>x.id===id&&x.canView!==false))return
    wx.navigateTo({url:'/packages/read-only/view/view?kind=teacher&id='+encodeURIComponent(id)})
  },

  onReturnWorkspace(){ wx.switchTab({url:'/pages/index/index'}) },
  onStudentChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ studentIndex: Number(event.detail.value) })
  },

  onTeacherChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ teacherIndex: Number(event.detail.value) })
  },

  onRelationshipChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ relationship: Number(event.detail.value) === 0 ? 'primary' : 'support' })
  },

  async onAddAssignment() {
    const student = this.data.students[this.data.studentIndex]
    const teacher = this.data.teachers[this.data.teacherIndex]
    if (!student || !teacher) {
      wx.showToast({ title: '暂无可用老师或学员', icon: 'none' })
      return
    }

    try {
      this.setData({ actionLoading: true })
      await createAdminAssignment({
        studentId: student.id,
        teacherId: teacher.id,
        stageCode: null,
        relationship: this.data.relationship,
      })
      wx.showToast({ title: '分配关系已建立', icon: 'success' })
      await this.loadData()
    } catch (error) {
      const message = error instanceof Error ? error.message : '分配失败'
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      this.setData({ actionLoading: false })
    }
  },

  onDeleteAssignment(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    wx.showModal({
      title: '移除师生关系',
      content: '移除后该老师将不再通过这条授权关系访问该学员。',
      success: async (result) => {
        if (!result.confirm) return
        try {
          await deleteAdminAssignment(id)
          await this.loadData()
          wx.showToast({ title: '已移除', icon: 'none' })
        } catch (error) {
          const message = error instanceof Error ? error.message : '移除失败'
          wx.showToast({ title: message, icon: 'none' })
        }
      },
    })
  },

  onEditNewsTags(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    const post = this.data.posts.find((item) => item.id === id)
    if (!post) return

    wx.showModal({
      title: '管理资讯标签',
      content: post.tags.join('、'),
      editable: true,
      placeholderText: '多个标签用逗号、顿号或空格分隔；留空即删除全部标签',
      confirmText: '保存',
      success: async (result) => {
        if (!result.confirm) return
        const raw = String(result.content || '')
        const tags = [...new Set(
          raw
            .split(/[，,、;；\s]+/)
            .map((item) => item.trim())
            .filter(Boolean),
        )].slice(0, 8)

        try {
          this.setData({ actionLoading: true })
          await updateAdminNewsTags(id, tags)
          this.setData(newsReviewState(await getAdminNews(),this.data.newsUnclassifiedFirst))
          wx.showToast({
            title: tags.length ? '标签已更新' : '标签已清空',
            icon: 'success',
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : '标签保存失败'
          wx.showToast({ title: message, icon: 'none' })
        } finally {
          this.setData({ actionLoading: false })
        }
      },
    })
  },

  onPreviewNews(event: WechatMiniprogram.BaseEvent) {
    if (getSavedAuthResult()?.user.role !== 'admin') return
    const id = String(event.currentTarget.dataset.id || '')
    if (!this.data.posts.some(post => post.id === id)) return
    openPage(`/pages/news-detail/news-detail?id=${encodeURIComponent(id)}`)
  },

  onVerifiedOfficialToggle(){
    if(!this.data.newsV2Enabled || this.data.actionLoading)return
    this.setData({verifiedFormOpen:!this.data.verifiedFormOpen})
  },
  onVerifiedOfficialInput(event:WechatMiniprogram.Input){
    const key=String(event.currentTarget.dataset.key)
    if(!['title','articleUrl','summary','coverUrl','tags','body'].includes(key))return
    this.setData({['verifiedDraft.'+key]:event.detail.value})
  },
  onVerifiedOfficialDate(event:WechatMiniprogram.CustomEvent<{value:string}>){
    this.setData({'verifiedDraft.date':event.detail.value})
  },
  onVerifiedOfficialTime(event:WechatMiniprogram.CustomEvent<{value:string}>){
    this.setData({'verifiedDraft.time':event.detail.value})
  },
  onVerifiedOfficialMedia(event:WechatMiniprogram.CustomEvent<{value:string}>){
    this.setData({'verifiedDraft.mediaType':event.detail.value==='2'?'video':event.detail.value==='1'?'image':'article'})
  },
  onVerifiedOfficialSubmit(){
    if(this.data.actionLoading || !this.data.newsV2Enabled || getSavedAuthResult()?.user.role!=='admin')return
    const draft=this.data.verifiedDraft
    const title=draft.title.trim(), articleUrl=draft.articleUrl.trim(),body=draft.body.trim()
    const tags=[...new Set(draft.tags.split(/[,，]/).map(tag=>tag.trim()).filter(Boolean))]
    if(!title || !/^https:\/\/mp\.weixin\.qq\.com\//i.test(articleUrl) ||
       Boolean(draft.date)!==Boolean(draft.time) || !tags.length || tags.length>8 ||
       (draft.mediaType!=='video' && !body) || (draft.mediaType==='video' && Boolean(body))){
      wx.showToast({title:'请核对原文、站内内容及分类',icon:'none'})
      return
    }
    const publishedAt=draft.date&&draft.time?draft.date+'T'+draft.time+':00+08:00':null
    wx.showModal({
      title:'核对公众号发表记录',
      content:'请确认后台已发表：'+title+'\n时间：'+(draft.date?draft.date+' '+draft.time:'待核实')+
        '\n类型：'+(draft.mediaType==='image'?'贴图':draft.mediaType==='video'?'视频':'图文')+
        '\n原文：'+articleUrl+'\n补录不代表自动同步已修复。',
      confirmText:'确认补录',cancelText:'继续核对',
      success:result=>{if(result.confirm)void this.saveVerifiedOfficial({
        title,articleUrl,publishedAt,tags,summary:draft.summary.trim()||null,
        coverUrl:draft.coverUrl.trim()||null,mediaType:draft.mediaType,body,
      })},
    })
  },
  async saveVerifiedOfficial(post:Parameters<typeof addVerifiedOfficialPost>[0]){
    if(this.data.actionLoading || !this.data.newsV2Enabled)return
    try{
      this.setData({actionLoading:true})
      const result=await addVerifiedOfficialPost(post)
      this.setData({verifiedFormOpen:false,
        verifiedDraft:{title:'',articleUrl:'',summary:'',coverUrl:'',date:'',time:'',tags:'',body:'',mediaType:'article'}})
      wx.showToast({title:result.created?'核实文章已补录':'该原文已存在，未重复新增',icon:'none'})
      await this.loadData()
    }catch(error){
      const code=error instanceof Error?error.message:''
      const title=code.includes('verified_official_title_conflict')?'同标题不同原文，请核对链接':
        code.includes('verified_official_url_conflict')?'原文链接冲突，请联系维护人员':
        friendlyRequestError(error,'补录失败，请核对字段及服务端状态')
      wx.showToast({title,icon:'none',duration:3000})
    }finally{this.setData({actionLoading:false})}
  },

  onNewsSort(){
    const next=!this.data.newsUnclassifiedFirst
    this.setData({newsUnclassifiedFirst:next,...newsReviewState(this.data.posts,next)})
  },
  async onSyncNews() {
    if(this.data.actionLoading)return
    try {
      this.setData({ actionLoading: true })
      const result = await syncOfficialAccountNews()
      const summary=[result.message, '检查时间：'+beijingNewsTime(result.checkedAt,true),
        '最新来源发表：'+(result.latestSourcePublishedAt?beijingNewsTime(result.latestSourcePublishedAt,true):'待核实'),
        '最新来源更新：'+beijingNewsTime(result.latestSourceUpdatedAt,true),
        `新增 ${result.created}，更新 ${result.updated}，未变化 ${result.unchanged}，失败 ${result.failed}`,
        `已检查 ${result.groupsFetched} 组 / ${result.totalGroups===null?'总数未提供':result.totalGroups+'组'}`+
          (result.truncated?'（本次范围有限，不能保证覆盖全部文章）':''),
        result.pagesFetched===undefined?'当前API未提供分页明细':`分页 ${result.pagesFetched} 页；独立发布组 ${result.uniqueGroups}`,
        ...(result.latestArticles||[]).map(article=>`本次源端最新内容：${article.title}（${article.publishedAt?'发表':'来源更新'} ${beijingNewsTime(article.publishedAt||article.sourceUpdatedAt,true)}）`),
        ...result.errors.map(error=>error.reason)].join('\n')
      this.setData({newsSyncSummary:summary})
      wx.showToast({ title:result.failed||result.truncated?'检查范围未完整':result.created===0?'已检查，暂无新文章':'同步检查完成',icon:result.failed||result.truncated?'none':'success' })
      this.setData(newsReviewState(await getAdminNews(),this.data.newsUnclassifiedFirst))
      if(this.data.newsV2Enabled)void this.loadRetirementTasks()
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const title = message.includes('official_account_not_configured')
        ? '服务号接口尚未配置'
        : '同步失败，请检查服务号接口权限'
      this.setData({newsSyncSummary:'检查失败：'+title+'（'+message+'）'})
      wx.showToast({ title, icon: 'none', duration: 2600 })
    } finally {
      this.setData({ actionLoading: false })
    }
  },
  async loadRetirementTasks(){
    try{
      const result=await getNewsRetirements()
      this.setData({retirementTasks:result.tasks.map(task=>({...task,retireLabel:beijingNewsTime(task.retireAt,true),sourceLabel:beijingNewsTime(task.sourceTime,false)})),
        unreadRetirementBatches:result.unreadBatches,retirementError:''})
      if(result.unreadBatches.length){
        const batch=result.unreadBatches[result.unreadBatches.length-1]
        const taskTitles=batch.affected.map(row=>result.tasks.find(task=>task.batchId===batch.id&&task.retireAt===row.retireAt)?.title||'文章').join('、')
        wx.showModal({title:'资讯退役提醒',content:`本次新增 ${batch.entered.length} 篇资讯。${batch.affected.length} 篇即将退出展示：${taskTitles}。详情见资讯管理。`,showCancel:false,
          success:async reply=>{if(!reply.confirm)return;try{await readNewsRetirement(batch.id);void this.loadRetirementTasks()}catch{this.setData({retirementError:'提醒已读状态保存失败，请重试'})}}})
      }
    }catch(error){this.setData({retirementError:friendlyRequestError(error,'退役任务读取失败')})}
  },
  onRetirementTask(event:WechatMiniprogram.BaseEvent){
    const task=this.data.retirementTasks.find(row=>row.taskId===event.currentTarget.dataset.id)
    if(!task)return
    const states:NewsRetirementTask['state'][]=['todo','acknowledged','doing','feedback']
    wx.showActionSheet({itemList:['待办','知晓','在办','反馈','填写备注'],success:reply=>{
      if(reply.tapIndex===4){
        wx.showModal({title:'内部备注',editable:true,placeholderText:'记录处理进展',content:task.note||'',success:result=>{
          if(result.confirm)void this.saveRetirementTask(task,task.state,result.content||'')
        }})
      }else void this.saveRetirementTask(task,states[reply.tapIndex],task.note||'')
    }})
  },
  async saveRetirementTask(task:NewsRetirementTask,state:NewsRetirementTask['state'],note:string){
    try{await updateNewsRetirementTask(task.taskId,state,note);await this.loadRetirementTasks()}
    catch(error){wx.showToast({title:friendlyRequestError(error,'任务保存失败'),icon:'none'})}
  },
})
