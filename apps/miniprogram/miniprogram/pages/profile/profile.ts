import { deleteCurrentAccount, getSavedAuthResult, logoutWechatUser, refreshAuthResult, type UserRole } from '../../utils/auth'
import { bindMyAdditionalIdentity, friendlyRequestError, getMyIdentities, getMyClassroom,
  getMyNewsFavorites, switchMyIdentityRole, unbindMyIdentityId,
  type MyIdentity, type NewsFavorite } from '../../utils/request'
import { openVerifiedWechatCustomerService } from '../../utils/customer-service'
import { openOfficialArticle } from '../../utils/official-article'
import { clearLoginIntent, INITIAL_SHELL, loginFor, observeSlot, openPage, shellView } from '../../utils/navigation'
import {getReadOnlyContext,clearReadOnlyContext,isReadOnly} from '../../utils/read-only-context'
import { clearCachedAcademicProfile } from '../../utils/profile-cache'
import { clearGrowthProfileBootstrapCache } from '../../utils/growth-profile-cache'
import { resolveCurrentStage } from '../../utils/current-stage'

// Identity editing already lives in the blue hero. Never repeat the same
// action in a long menu or create parallel assessment entry routes.
const PERSONAL_MENUS = [
  { key: 'growth', title: '成长档案与简历', desc: '整理长期成长记录，生成真实申请材料' },
  { key: 'assessment', title: 'AI 评估历史与草稿', desc: '接续未完成评估，查看既有报告' },
  { key: 'position', title: 'AI 评估', desc: '查看评估入口' },
  { key: 'favorites', title: '我的收藏', desc: '重新打开已收藏的服务号原文' },
  { key: 'service', title: '联系客服', desc: '咨询院校信息与九辰服务' },
]
const TEACHER_MENUS = [
  { key: 'students', title: '学员规划', desc: '查看已分配学员的辅导与规划' },
  { key: 'favorites', title: '我的收藏', desc: '重新打开已收藏的服务号原文' },
  { key: 'service', title: '联系运营', desc: '咨询账号、学员分配与业务支持' },
]
const ADMIN_MENUS = [
  { key: 'favorites', title: '我的收藏', desc: '重新打开已收藏的服务号原文' },
  { key: 'service', title: '联系运营', desc: '咨询账号与服务支持' },
]
Page({
  data: {
    ...INITIAL_SHELL, loggedIn: false, role: '' as UserRole | '', roleLabel: '未登录',
    businessId: '', userName: '', profileStageLabel: '', menus: PERSONAL_MENUS, loggingOut: false, deleting: false,
    favoritesVisible:false,favoritesLoading:false,favoritesError:'',favorites:[] as NewsFavorite[],
    identities: [] as MyIdentity[], identityInput: '', identityBusy: false, identityError: '', identityDetailsOpen: false, accountSettingsOpen: false,
  },
  stopShell: undefined as (() => void) | undefined,
  profileViewEpoch: 0,
  onShow() {
    this.stopShell?.()
    const epoch = ++this.profileViewEpoch
    this.setData({favoritesVisible:false,favorites:[],favoritesError:'',identityDetailsOpen:false})
    this.stopShell = observeSlot('mine', (state) => {
      const auth = state.auth
      const role = auth?.user.role || ''
      this.setData({
        ...shellView(state), loggedIn: Boolean(auth), role,
        roleLabel: shellView(state).shellRoleLabel, businessId: auth?.businessIdentity?.businessId || '',
        userName: auth?.user.displayName || (role === 'staff' ? '九辰内部员工' : role === 'teacher' ? '九辰辅导老师' : role === 'admin' ? '九辰管理员' : role === 'student' ? '九辰学员' : '我的保研档案'), profileStageLabel: '',
        menus: role === 'admin' ? ADMIN_MENUS : role === 'teacher' || role === 'staff' ? TEACHER_MENUS : PERSONAL_MENUS,
      })
      if (state.phase === 'ready' && role === 'student' && auth && !isReadOnly()) {
        const owner = auth.user.id
        void (async () => {
          const resolution = await resolveCurrentStage()
          if (epoch !== this.profileViewEpoch || isReadOnly() || getSavedAuthResult()?.user.id !== owner) return
          if (!resolution.stage || !resolution.scheduleSafe) { this.setData({ profileStageLabel: '学期待核对' }); return }
          const view = await getMyClassroom(resolution.stage)
          if (epoch === this.profileViewEpoch && !isReadOnly() && getSavedAuthResult()?.user.id === owner && getSavedAuthResult()?.user.role === 'student') {
            this.setData({ profileStageLabel: view.student.currentStage === resolution.stage ? view.stage.label : '学期待核对' })
          }
        })().catch(() => { if (epoch === this.profileViewEpoch && !isReadOnly() && getSavedAuthResult()?.user.id === owner) this.setData({ profileStageLabel: '学期待核对' }) })
      }
    })
    if (getSavedAuthResult() && !isReadOnly()) void this.loadIdentities()
    else this.setData({ identities: [], identityError: '', identityInput: '' })
  },
  async loadIdentities() {
    try {
      const result = await getMyIdentities()
      this.setData({ identities: result.identities, identityError: '' })
    } catch (error) { this.setData({ identityError: friendlyRequestError(error, '身份列表暂不可用') }) }
  },
  onAdditionalIdInput(event: WechatMiniprogram.Input) {
    this.setData({ identityInput: event.detail.value })
  },
  async onBindAdditionalIdentity() {
    if (this.data.identityBusy) return
    if (!this.data.identityInput.trim()) {
      wx.showToast({ title: '请先填写内部编号', icon: 'none' })
      return
    }
    this.setData({ identityBusy: true })
    try {
      await bindMyAdditionalIdentity(this.data.identityInput.trim())
      this.setData({ identityInput: '' })
      await this.loadIdentities()
      wx.showToast({ title: '兼任身份已绑定', icon: 'success' })
    } catch (error) { wx.showToast({ title: friendlyRequestError(error, '身份绑定失败'), icon: 'none' }) }
    finally { this.setData({ identityBusy: false }) }
  },
  async onSwitchIdentity(event: WechatMiniprogram.BaseEvent) {
    const role = String(event.currentTarget.dataset.role) as MyIdentity['type']
    if (this.data.identityBusy || !this.data.identities.some(item => item.type === role)) return
    this.setData({ identityBusy: true })
    try {
      await clearCachedAcademicProfile()
      await switchMyIdentityRole(role)
      const refreshed = await refreshAuthResult()
      await Promise.all([clearCachedAcademicProfile(), clearGrowthProfileBootstrapCache()])
      if (refreshed?.user.role !== role) {
        this.setData({ identityError: '身份已切换，但页面未完成刷新。请重新打开小程序后确认当前身份。' })
        return
      }
      await this.loadIdentities()
      wx.showToast({ title: '身份已切换', icon: 'success' })
    } catch (error) { wx.showToast({ title: friendlyRequestError(error, '身份切换失败'), icon: 'none' }) }
    finally { this.setData({ identityBusy: false }) }
  },
  onUnbindIdentity(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id)
    const identity = this.data.identities.find(item => item.id === id)
    if (!identity || this.data.identityBusy) return
    wx.showModal({ title: '解除身份绑定',
      content: `确定解除 ${identity.businessId}？其他身份会保留。`,
      success: result => { if (result.confirm) void this.unbindIdentity(id) } })
  },
  async unbindIdentity(id: string) {
    this.setData({ identityBusy: true })
    try {
      await clearCachedAcademicProfile()
      await unbindMyIdentityId(id)
      await refreshAuthResult()
      await Promise.all([clearCachedAcademicProfile(), clearGrowthProfileBootstrapCache()])
      await this.loadIdentities()
      wx.showToast({ title: '身份已解除', icon: 'success' })
    } catch (error) { wx.showToast({ title: friendlyRequestError(error, '解除身份失败'), icon: 'none' }) }
    finally { this.setData({ identityBusy: false }) }
  },
  onHide() { this.profileViewEpoch += 1; this.stopShell?.(); this.setData({ shellPhase: 'loading', identities: [], profileStageLabel: '',
    favorites: [], favoritesVisible: false, identityInput: '', identityDetailsOpen: false }) },
  onUnload() { this.profileViewEpoch += 1; this.stopShell?.() },
  onCustomerServiceTap() { void openVerifiedWechatCustomerService('账号及运营支持') },
  onToggleAccountSettings() { this.setData({ accountSettingsOpen: !this.data.accountSettingsOpen }) },
  onToggleIdentityDetails() { this.setData({ identityDetailsOpen: !this.data.identityDetailsOpen }) },
  onWebsite() { (this.selectComponent('#website-dialog') as { open?: () => void } | null)?.open?.() },
  onIdentityTap() {
    if(isReadOnly()){wx.showToast({title:'当前为只读查看，不能编辑资料',icon:'none'});return}
    if (this.data.loggedIn && this.data.identities.some(item => item.type === 'admin')) {
      this.setData({ identityDetailsOpen: true }, () => wx.pageScrollTo({ selector: '#identity-section', duration: 200 }))
      return
    }
    if (this.data.loggedIn) openPage('/pages/profile-edit/profile-edit')
    else loginFor('pages/profile-edit/profile-edit')
  },
  onCopyIdentity() {
    if (!this.data.businessId) return
    wx.setClipboardData({ data: this.data.businessId, success: () => wx.showToast({ title: '编号已复制', icon: 'success' }), fail: () => wx.showToast({ title: '未能复制，请重试', icon: 'none' }) })
  },
  onMenuTap(event: WechatMiniprogram.BaseEvent) {
    const key = String(event.currentTarget.dataset.key || '')
    if(key==='favorites'){void this.onFavorites();return}
    const destinations: Record<string, string> = {
      profile: 'pages/profile-edit/profile-edit', growth: 'pages/growth-profile/growth-profile',
      assessment: 'pages/assessment-history/assessment-history', position: 'pages/position/position',
      students: 'pages/teacher-students/teacher-students',
    }
    if (key.startsWith('admin-')) {
      if (this.data.role === 'admin') openPage('/pages/admin/admin?section=' + encodeURIComponent(key))
      return
    }
    const destination = destinations[key]
    if (!destination) return
    if (!this.data.loggedIn && key !== 'position') loginFor(destination)
    else openPage('/' + destination)
  },
  async onFavorites(){
    const owner=getSavedAuthResult()?.user.id
    if(!owner){loginFor('pages/profile/profile');return}
    this.setData({favoritesVisible:true,favoritesLoading:true,favoritesError:'',favorites:[]})
    try{
      const favorites=await getMyNewsFavorites()
      if(getSavedAuthResult()?.user.id===owner)this.setData({favorites})
    }catch(error){if(getSavedAuthResult()?.user.id===owner)this.setData({favoritesError:friendlyRequestError(error,'收藏服务暂时不可用，请稍后重试')})}
    finally{if(getSavedAuthResult()?.user.id===owner)this.setData({favoritesLoading:false})}
  },
  onFavoriteOpen(event:WechatMiniprogram.BaseEvent){
    const favorite=this.data.favorites.find(item=>item.postId===event.currentTarget.dataset.id)
    if(favorite)openOfficialArticle(favorite.articleUrl)
  },
  onFavoriteReader(event:WechatMiniprogram.BaseEvent){
    const favorite=this.data.favorites.find(item=>item.postId===event.currentTarget.dataset.id)
    if(favorite)openPage(`/pages/news-detail/news-detail?id=${encodeURIComponent(favorite.postId)}`)
  },
  async onLogout() {
    if(isReadOnly())return
    if (this.data.loggingOut) return
    this.setData({ loggingOut: true })
    let serverConfirmed = true
    try { await logoutWechatUser() } catch { serverConfirmed = false }
    clearLoginIntent()
    this.setData({ loggingOut: false })
    wx.showToast({ title: serverConfirmed ? '已退出登录' : '已退出本机登录', icon: 'none' })
    wx.reLaunch({ url: '/pages/index/index' })
  },
  onDeleteAccount() {
    if(isReadOnly())return
    if (this.data.deleting || this.data.loggingOut) return
    wx.showModal({
      title: '注销账号',
      content: '注销会撤销全部登录会话、删除你的自填资料并解除当前登录绑定。九辰内部学员/老师业务档案不会被用户自行删除，相关内部ID会转为禁用并由管理员处理。',
      confirmText: '继续注销',
      cancelText: '保留账号',
      confirmColor: '#c2413d',
      success: (result) => {
        if (!result.confirm) return

        wx.showModal({
          title: '再次确认',
          content: '此操作会使当前微信账号退出九辰系统。确定注销吗？',
          confirmText: '确认注销',
          cancelText: '取消注销',
          confirmColor: '#c2413d',
          success: async (finalResult) => {
            if (!finalResult.confirm) return
            this.setData({ deleting: true })
            try {
              await deleteCurrentAccount()
              this.setData({ loggedIn: false, businessId: '', role: '' })
              wx.showToast({ title: '账号已注销', icon: 'none' })
              clearLoginIntent()
              wx.reLaunch({ url: '/pages/index/index' })
            } catch (error) {
              wx.showToast({
                title: friendlyRequestError(error, '注销失败，请稍后重试'),
                icon: 'none',
                duration: 2600,
              })
            } finally {
              this.setData({ deleting: false })
            }
          },
        })
      },
    })
  },
  onExitReadOnly(){
    if(!getReadOnlyContext())return
    clearReadOnlyContext()
    wx.switchTab({url:'/pages/index/index'})
  },
})
