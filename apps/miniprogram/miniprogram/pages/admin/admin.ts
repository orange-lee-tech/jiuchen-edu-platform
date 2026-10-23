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
  friendlyRequestError,
  getAdminAssignments,
  getAdminAnalytics,
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
  saveAdminControl,
  testAdminAssessmentKey,
  syncOfficialAccountNews,
  unbindAdminInternalId,
  updateAdminNewsTags,
  type AdminAssignment,
  type AdminAnalytics,
  type AdminAnalyticsPeriod,
  type AdminInternalId,
  type AdminNewsPost,
  type NewsRetirementTask,
  type NewsRetirementBatch,
  type AdminTeacher,
  type AdminUser,
  type AdminControlBox,
  type StudentSummary,
} from '../../utils/request'

import {beijingNewsTime,newsPublicationLabel} from '../../utils/news-date'

type Section = 'admin-users' | 'admin-assignments' | 'admin-news' | 'admin-analytics' | 'admin-readonly' | 'admin-controls'
function moneyFen(text: string) {
  return /^\d{1,5}(?:\.\d{1,2})?$/.test(text) ? Math.round(Number(text) * 100) : NaN
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
    assessmentUserCountLabel:'数据源不可用',
    userCount:null as number|null,
    userCountError:'',
    rechargeAmountLabel:'',
    loading: true,
    actionLoading: false,
    controlSettings: null as AdminControlBox | null,
    controlKey: null as AdminControlBox | null,
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
        const [students, teachers, assignments] = await Promise.all([
          getAdminStudents(), getAdminTeachers(), getAdminAssignments(),
        ])
        this.setData({ students: students.map(item => ({ ...item, joinedLabel: joinedLabel(item.createdAt) })),
          teachers: teachers.map(item => ({ ...item, joinedLabel: joinedLabel(item.createdAt) })), assignments,
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
    this.setData({ loading: true, loadError: '' })
    try {
      const result = await getAdminControls()
      const settings = result.settings.settings
      this.setData({ controlSettings: result.settings, controlKey: result.assessmentKey,
        singleYuan: ((settings?.singleFen ?? 190) / 100).toFixed(2),
        tenYuan: ((settings?.tenFen ?? 1690) / 100).toFixed(2),
        guestFreeInput: String(settings?.guestFree ?? 1),
        studentFreeInput: String(settings?.studentTotalFree ?? 5),
        estimatedCostYuan: settings?.estimatedCostFen == null ? '' : (settings.estimatedCostFen / 100).toFixed(2),
        platformPriceConfirmed: settings?.platformPriceConfirmed ?? false,
        settingsOldPin: '', settingsNewPin: '', keyOldPin: '', keyNewPin: '', keyTestPin: '', apiKeyInput: '' })
    } catch (error) { this.setData({ loadError: friendlyRequestError(error, '设置未能读取') }) }
    finally { this.setData({ loading: false }) }
  },
  onControlInput(event: WechatMiniprogram.Input) {
    const name = String(event.currentTarget.dataset.name)
    if (!['singleYuan', 'tenYuan', 'guestFreeInput', 'studentFreeInput', 'estimatedCostYuan',
      'settingsOldPin', 'settingsNewPin', 'keyOldPin', 'keyNewPin', 'keyTestPin', 'apiKeyInput'].includes(name)) return
    this.setData({ [name]: event.detail.value,
      ...(name === 'singleYuan' || name === 'tenYuan' ? { platformPriceConfirmed: false } : {}) })
  },
  onControlPriceConfirm(event: WechatMiniprogram.CustomEvent<{ value: boolean }>) {
    this.setData({ platformPriceConfirmed: event.detail.value })
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
      (this.data.platformPriceConfirmed && (estimatedCostFen === null ||
        singleFen * 10 < estimatedCostFen * 12 || tenFen < estimatedCostFen * 12)) ||
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
  async loadAnalytics() {
    const generation=++this.analyticsGeneration
    const owner=getSavedAuthResult()?.user.id
    const period=this.data.analyticsPeriod
    try {
      this.setData({ loading: true, loadError: '' })
      const [statistics, accounts] = await Promise.allSettled([getAdminAnalytics(period), getAdminUsers()])
      if(statistics.status==='rejected')throw statistics.reason
      const analytics = statistics.value
      if(!analytics.sources || !analytics.range || !analytics.summary)throw new Error('统计接口版本尚未更新，请先部署 API')
      if(generation!==this.analyticsGeneration || period!==this.data.analyticsPeriod || owner!==getSavedAuthResult()?.user.id)return
      this.setData({
        userCount:accounts.status==='fulfilled' && Array.isArray(accounts.value) ? accounts.value.length : null,
        assessmentUserCountLabel:typeof analytics.summary.assessmentUserCount==='number'?String(analytics.summary.assessmentUserCount):'当前 API 未提供',
        userCountError:accounts.status==='rejected'?friendlyRequestError(accounts.reason,'账号来源读取失败'):accounts.status==='fulfilled' && !Array.isArray(accounts.value)?'账号接口版本不匹配':'',
        analytics: { ...analytics, payers: analytics.payers.map(row => ({ ...row, amountYuan: (row.amountFen/100).toFixed(2) })) },
        rechargeAmountLabel:analytics.summary.rechargeAmountFen===null?'读取失败':(analytics.summary.rechargeAmountFen/100).toFixed(2),
        analyticsWarning:Object.entries(analytics.sources).filter(([,state])=>state.status==='error').map(([source,state])=>({assessments:'评估',payments:'支付',ledger:'账本',reservations:'冻结记录'}[source]||source)+'读取失败：'+state.error).join('；'),
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
        this.setData({ formMode: 'bind', bindIdIndex: this.data.availableIds.findIndex(i => i.id === item.id) }); return
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
    if (section === 'admin-analytics') void this.loadAnalytics()
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
