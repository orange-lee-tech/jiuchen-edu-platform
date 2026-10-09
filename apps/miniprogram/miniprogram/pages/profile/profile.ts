import { deleteCurrentAccount, getSavedAuthResult, logoutWechatUser, type UserRole } from '../../utils/auth'
import { friendlyRequestError } from '../../utils/request'
import { openWechatCustomerService } from '../../utils/customer-service'
import { copyOfficialWebsite } from '../../utils/website'
import { clearLoginIntent, INITIAL_SHELL, loginFor, observeSlot, openPage, shellView } from '../../utils/navigation'

const PERSONAL_MENUS = [
  { key: 'profile', title: '身份与个人资料', desc: '查看九辰编号，编辑学业背景' },
  { key: 'growth', title: '成长档案与简历', desc: '查看成长记录，生成简历与申请资料' },
  { key: 'assessment', title: '评估历史', desc: '继续草稿或重新查看已保存的结果' },
  { key: 'position', title: '背景评估', desc: '整理背景，明确下一步准备方向' },
  { key: 'service', title: '联系顾问', desc: '咨询服务与保研准备' },
]
const TEACHER_MENUS = [
  { key: 'profile', title: '身份与个人资料', desc: '查看当前内部身份和编号' },
  { key: 'students', title: '学员规划与审核', desc: '进入获授权学员的规划和版本审核' },
  { key: 'service', title: '联系运营', desc: '咨询账号、学员分配与数据问题' },
]
const ADMIN_MENUS = [
  { key: 'profile', title: '身份与个人资料', desc: '查看本人的管理员身份和编号' },
  { key: 'service', title: '联系运营', desc: '咨询账号与服务问题' },
]
Page({
  data: {
    ...INITIAL_SHELL, loggedIn: false, role: '' as UserRole | '', roleLabel: '未登录',
    businessId: '', userName: '', menus: PERSONAL_MENUS, loggingOut: false, deleting: false,
  },
  stopShell: undefined as (() => void) | undefined,
  onShow() {
    this.stopShell?.()
    this.stopShell = observeSlot('mine', (state) => {
      const auth = state.auth
      const role = auth?.user.role || ''
      this.setData({
        ...shellView(state), loggedIn: Boolean(auth), role,
        roleLabel: shellView(state).shellRoleLabel, businessId: auth?.businessIdentity?.businessId || '',
        userName: auth?.user.displayName || (role === 'staff' ? '九辰内部员工' : role === 'teacher' ? '九辰辅导老师' : role === 'admin' ? '九辰管理员' : role === 'student' ? '九辰学员' : '我的保研档案'),
        menus: role === 'admin' ? ADMIN_MENUS : role === 'teacher' || role === 'staff' ? TEACHER_MENUS : PERSONAL_MENUS,
      })
    })
  },
  onHide() { this.stopShell?.(); this.setData({ shellPhase: 'loading' }) },
  onUnload() { this.stopShell?.() },
  onCustomerServiceTap() { openWechatCustomerService() },
  onWebsite() { copyOfficialWebsite() },
  onIdentityTap() {
    if (this.data.loggedIn) openPage('/pages/profile-edit/profile-edit')
    else loginFor('pages/profile-edit/profile-edit')
  },
  onCopyIdentity() {
    if (!this.data.businessId) return
    wx.setClipboardData({ data: this.data.businessId, success: () => wx.showToast({ title: '编号已复制', icon: 'success' }), fail: () => wx.showToast({ title: '未能复制，请重试', icon: 'none' }) })
  },
  onMenuTap(event: WechatMiniprogram.BaseEvent) {
    const key = String(event.currentTarget.dataset.key || '')
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
  async onLogout() {
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
})
