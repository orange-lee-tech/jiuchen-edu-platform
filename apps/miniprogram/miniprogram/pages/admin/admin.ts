import { getSavedAuthResult } from '../../utils/auth'
import { authorizePage, safeBack } from '../../utils/navigation'
import { filterInternalIds, internalIdView, ID_FILTERS } from '../../utils/admin-id-view'
import {
  bindAdminInternalId,
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
  getAdminStudents,
  getAdminTeachers,
  getAdminUsers,
  syncOfficialAccountNews,
  unbindAdminInternalId,
  updateAdminNewsTags,
  type AdminAssignment,
  type AdminAnalytics,
  type AdminAnalyticsPeriod,
  type AdminInternalId,
  type AdminNewsPost,
  type AdminTeacher,
  type AdminUser,
  type StudentSummary,
} from '../../utils/request'

import {beijingNewsTime,newsPublicationLabel} from '../../utils/news-date'

type Section = 'admin-users' | 'admin-assignments' | 'admin-news' | 'admin-analytics' | 'admin-readonly'
type Point = { display:string;key:string;label:string;count:number;x:number;barX:number;height:number;bottom:number;labelBottom:number;prevX:number;prevBottom:number;length:number;angle:number;hasPrev:boolean }
type Plot = { unit:string;key:string;title:string;width:number;max:number;points:Point[] }
function makePlot(key:'assessmentCount'|'rechargeCount'|'rechargeAmountFen'|'consumptionCount'|'releasedCount'|'failedCount'|'runningCount',title:string,rows:AdminAnalytics['buckets']):Plot {
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
      (new Date(b.publishedAt||0).getTime()-new Date(a.publishedAt||0).getTime()) ||
      (new Date(b.sourceUpdatedAt||0).getTime()-new Date(a.sourceUpdatedAt||0).getTime()),
  )
  return {
    posts: sorted.map(post=>({...post,dateLabel:newsPublicationLabel(post)})),
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
    rechargeAmountLabel:'',
    loading: true,
    actionLoading: false,
    internalIds: [] as AdminInternalId[],
    visibleIds: [] as ReturnType<typeof internalIdView>[],
    idQuery: '', idFilter: 0, idFilters: ID_FILTERS,
    userQuery: '', visibleUsers: [] as Array<AdminUser & { roleLabel: string; statusLabel: string }>,
    formMode: '' as '' | 'create' | 'bind', loadError: '',
    users: [] as AdminUser[],
    students: [] as StudentSummary[],
    teachers: [] as AdminTeacher[],
    assignments: [] as AdminAssignment[],
    posts: [] as Array<AdminNewsPost&{dateLabel:string}>,
    newsUnclassifiedFirst:false,
    newsSyncSummary:'',
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
    if (['admin-users', 'admin-assignments', 'admin-news', 'admin-analytics', 'admin-readonly'].includes(section)) {
      this.setData({ section })
    }

    if(this.data.section==='admin-readonly')void this.loadReadOnlyRoster()
    else void this.loadData()
  },

  async loadReadOnlyRoster(){
    try{
      this.setData({loading:true,loadError:''})
      // Read-only identity entry should never depend on payment analytics or news sync.
      const [students,teachers]=await Promise.all([getAdminStudents(),getAdminTeachers()])
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
    try {
      this.setData({ loading: true, loadError: '' })
      const [internalIds, users, students, teachers, assignments, posts] = await Promise.all([
        getAdminInternalIds(),
        getAdminUsers(),
        getAdminStudents(),
        getAdminTeachers(),
        getAdminAssignments(),
        getAdminNews(),
      ])

      const availableIds = internalIds.filter((item) => item.status === 'available')
      const guestUsers = users.filter((item) => item.status === 'active' && item.role === 'user').map(item => ({ ...item, displayLabel: `${item.displayName || '未设置显示名'} · ${item.id.slice(-6)}` }))

      this.setData({
        internalIds,
        users,
        students,
        teachers,
        assignments,
        ...newsReviewState(posts,this.data.newsUnclassifiedFirst),
        availableIds,
        guestUsers,
        bindIdIndex: Math.min(this.data.bindIdIndex, Math.max(0, availableIds.length - 1)),
        bindUserIndex: Math.min(this.data.bindUserIndex, Math.max(0, guestUsers.length - 1)),
        studentIndex: Math.min(this.data.studentIndex, Math.max(0, students.length - 1)),
        teacherIndex: Math.min(this.data.teacherIndex, Math.max(0, teachers.length - 1)),
      })
      this.refreshLists()
    } catch (error) {
      const message = friendlyRequestError(error, '管理数据读取失败，请重试')
      this.setData({ loadError: message })
      wx.showToast({ title: message, icon: 'none', duration: 2500 })
    } finally {
      this.setData({ loading: false })
    }
  },
  analyticsGeneration:0,
  async loadAnalytics() {
    const generation=++this.analyticsGeneration
    const owner=getSavedAuthResult()?.user.id
    const period=this.data.analyticsPeriod
    try {
      this.setData({ loading: true, loadError: '' })
      const analytics = await getAdminAnalytics(period)
      if(!analytics.sources || !analytics.range)throw new Error('统计接口版本尚未更新，请先部署 API')
      if(generation!==this.analyticsGeneration || period!==this.data.analyticsPeriod || owner!==getSavedAuthResult()?.user.id)return
      this.setData({
        analytics: { ...analytics, payers: analytics.payers.map(row => ({ ...row, amountYuan: (row.amountFen/100).toFixed(2) })) },
        rechargeAmountLabel:analytics.summary.rechargeAmountFen===null?'读取失败':(analytics.summary.rechargeAmountFen/100).toFixed(2),
        analyticsWarning:Object.entries(analytics.sources).filter(([,state])=>state.status==='error').map(([source,state])=>({assessments:'评估',payments:'支付',ledger:'账本',reservations:'冻结记录'}[source]||source)+'读取失败：'+state.error).join('；'),
        analyticsPlots: [
          makePlot('assessmentCount', 'AI 评估使用次数', analytics.buckets),
          ...(analytics.sources.payments.status==='ok'?[makePlot('rechargeCount','成功充值订单次数',analytics.buckets),makePlot('rechargeAmountFen','成功充值金额',analytics.buckets)]:[]),
          ...(analytics.sources.ledger.status==='ok'?[makePlot('consumptionCount','实际额度消费笔数（账本）',analytics.buckets)]:[]),
          ...(analytics.sources.reservations.status==='ok'?[makePlot('releasedCount','额度退回记录笔数',analytics.buckets)]:[]),
          makePlot('failedCount','失败评估任务',analytics.buckets),
          makePlot('runningCount','运行中的评估任务',analytics.buckets),
        ],
      })
    } catch (error) {
      if(generation!==this.analyticsGeneration || owner!==getSavedAuthResult()?.user.id)return
      this.setData({ analytics: null, analyticsPlots: [], loadError: friendlyRequestError(error, '统计暂时不可用') })
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
    this.setData({ visibleIds: filterInternalIds(this.data.internalIds, this.data.idQuery, this.data.idFilter, getSavedAuthResult()?.user.id), visibleUsers: this.data.users.filter(u => !q || [u.displayName, u.id].some(v => v?.toLowerCase().includes(q))).map(u => ({ ...u, roleLabel: { user: '普通用户', student: '学员', teacher: '老师', staff: '内部员工', admin: '管理员' }[u.role], statusLabel: u.status === 'active' ? '正常' : '已停用' })) })
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
    if (!['admin-users', 'admin-assignments', 'admin-news', 'admin-analytics', 'admin-readonly'].includes(section)) return
    this.setData({ section })
    if (section === 'admin-analytics') void this.loadAnalytics()
    else if (section === 'admin-readonly') void this.loadReadOnlyRoster()
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
    if(!this.data.students.some(x=>x.id===id))return
    wx.navigateTo({url:'/packages/read-only/view/view?kind=student&id='+encodeURIComponent(id)})
  },
  onReadOnlyTeacher(event: WechatMiniprogram.BaseEvent) {
    const id=String(event.currentTarget.dataset.id||'')
    if(!this.data.teachers.some(x=>x.id===id))return
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
        ...result.errors.map(error=>error.reason)].join('\n')
      this.setData({newsSyncSummary:summary})
      wx.showToast({ title:result.failed?'部分文章同步失败':result.created===0?'已检查，暂无新文章':'同步检查完成',icon:result.failed?'none':'success' })
      this.setData(newsReviewState(await getAdminNews(),this.data.newsUnclassifiedFirst))
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
})
