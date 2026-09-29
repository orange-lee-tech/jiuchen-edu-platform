import {
  deleteCurrentAccount,
  getSavedAuthResult,
  logoutWechatUser,
  type BootstrapResult,
  type UserRole,
} from '../../utils/auth'
import { friendlyRequestError } from '../../utils/request'

const GUEST_STATS = [
  { value: '—', label: '当前身份' },
  { value: '0', label: '评估次数' },
  { value: '0', label: '收藏内容' },
]

const STUDENT_STATS = [
  { value: '0', label: '评估次数' },
  { value: '0', label: '收藏院校' },
  { value: '0', label: '学习任务' },
]

const TEACHER_STATS = [
  { value: '0', label: '负责学员' },
  { value: '0', label: '待辅导' },
  { value: '0', label: '本周记录' },
]

const ADMIN_STATS = [
  { value: '0', label: '内部用户' },
  { value: '0', label: '师生关系' },
  { value: '0', label: '待同步动态' },
]

const GUEST_MENUS = [
  { key: 'profile', title: '个人资料', desc: '填写九辰内部ID并完善基础资料' },
  { key: 'assessment', title: 'AI 定位', desc: '游客也可完善背景并使用公开评估能力' },
  { key: 'service', title: '联系客服', desc: '咨询课程与保研规划' },
]

const STUDENT_MENUS = [
  { key: 'profile', title: '个人资料', desc: '查看内部ID、院校、专业与成绩背景' },
  { key: 'assessment', title: '我的评估', desc: '查看历史 AI 定位结果' },
  { key: 'favorites', title: '我的收藏', desc: '收藏的院校、项目与资讯' },
  { key: 'credits', title: '评估额度', desc: '查看剩余次数与使用记录' },
  { key: 'service', title: '联系客服', desc: '课程与保研规划咨询' },
]

const TEACHER_MENUS = [
  { key: 'profile', title: '个人资料', desc: '查看已绑定内部ID与老师身份' },
  { key: 'students', title: '我的学员', desc: '查看已分配学员与当前培养阶段' },
  { key: 'schedule', title: '辅导安排', desc: '查看待办辅导与阶段任务' },
  { key: 'records', title: '辅导记录', desc: '维护已授权学员的辅导记录' },
  { key: 'service', title: '联系运营', desc: '账号、学员分配与数据问题' },
]

const ADMIN_MENUS = [
  { key: 'profile', title: '个人资料', desc: '查看管理员内部ID与账号状态' },
  { key: 'admin-users', title: '内部用户与ID', desc: '新增、禁用、换绑内部业务ID' },
  { key: 'admin-assignments', title: '师生分配', desc: '给老师更换学员或给学员更换老师' },
  { key: 'admin-news', title: '动态同步', desc: '同步九辰教育服务号已发布内容' },
]

function labelForRole(role: UserRole) {
  if (role === 'student') return '学员'
  if (role === 'teacher') return '老师'
  if (role === 'staff') return '内部员工'
  if (role === 'admin') return '管理员'
  return '游客'
}

function getIdentityView(auth: BootstrapResult | null) {
  if (!auth) {
    return {
      loggedIn: false,
      role: '' as UserRole | '',
      roleLabel: '未登录',
      businessId: '',
      user: {
        name: '登录九辰保研',
        meta: '登录后由系统自动识别你的身份与权限',
      },
      stats: GUEST_STATS,
      menus: GUEST_MENUS,
    }
  }

  const role = auth.user.role
  const businessId = auth.businessIdentity?.businessId ?? ''

  if (role === 'admin') {
    return {
      loggedIn: true,
      role,
      roleLabel: '管理员',
      businessId,
      user: {
        name: auth.user.displayName || '九辰管理员',
        meta: businessId ? `内部ID：${businessId}` : '管理员身份已绑定',
      },
      stats: ADMIN_STATS,
      menus: ADMIN_MENUS,
    }
  }

  if (role === 'teacher' || role === 'staff') {
    return {
      loggedIn: true,
      role,
      roleLabel: labelForRole(role),
      businessId,
      user: {
        name: auth.user.displayName || '九辰辅导老师',
        meta: businessId ? `内部ID：${businessId}` : '查看学员、辅导安排与工作记录',
      },
      stats: TEACHER_STATS,
      menus: TEACHER_MENUS,
    }
  }

  if (role === 'student') {
    return {
      loggedIn: true,
      role,
      roleLabel: '学员',
      businessId,
      user: {
        name: auth.user.displayName || '九辰学员',
        meta: businessId ? `内部ID：${businessId}` : '查看你的保研档案与学习服务',
      },
      stats: STUDENT_STATS,
      menus: STUDENT_MENUS,
    }
  }

  return {
    loggedIn: true,
    role,
    roleLabel: '游客',
    businessId: '',
    user: {
      name: auth.user.displayName || '微信用户',
      meta: '游客账号 · 在个人资料填写九辰内部ID即可绑定身份',
    },
    stats: GUEST_STATS,
    menus: GUEST_MENUS,
  }
}

Page({
  data: {
    loggedIn: false,
    role: '' as UserRole | '',
    roleLabel: '未登录',
    businessId: '',
    user: {
      name: '登录九辰保研',
      meta: '登录后由系统自动识别你的身份与权限',
    },
    stats: GUEST_STATS,
    menus: GUEST_MENUS,
  },

  onShow() {
    this.setData(getIdentityView(getSavedAuthResult()))
  },

  onIdentityTap() {
    if (this.data.loggedIn) {
      wx.navigateTo({ url: '/pages/profile-edit/profile-edit' })
      return
    }
    wx.navigateTo({ url: '/pages/login/login' })
  },

  onMenuTap(event: WechatMiniprogram.BaseEvent) {
    if (!this.data.loggedIn) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }

    const key = String(event.currentTarget.dataset.key || '')
    const title = String(event.currentTarget.dataset.title || '')

    if (key === 'profile') {
      wx.navigateTo({ url: '/pages/profile-edit/profile-edit' })
      return
    }

    if (key === 'assessment') {
      wx.switchTab({ url: '/pages/position/position' })
      return
    }

    if (key === 'students' || key === 'schedule' || key === 'records') {
      wx.navigateTo({ url: '/pages/teacher-students/teacher-students' })
      return
    }

    if (key.startsWith('admin-')) {
      wx.navigateTo({
        url: `/pages/admin/admin?section=${encodeURIComponent(key)}`,
      })
      return
    }

    wx.showToast({ title: title + '功能已预留', icon: 'none' })
  },

  async onLogout() {
    try {
      await logoutWechatUser()
    } catch (error) {
      console.info('Server logout failed; local session was still cleared.', error)
    }

    this.setData(getIdentityView(null))
    wx.showToast({ title: '已退出登录', icon: 'none' })
    wx.navigateTo({ url: '/pages/login/login' })
  },

  onDeleteAccount() {
    wx.showModal({
      title: '注销账号',
      content: '注销会撤销全部登录会话、删除你的自填资料并解除当前登录绑定。九辰内部学员/老师业务档案不会被用户自行删除，相关内部ID会转为禁用并由管理员处理。',
      confirmText: '继续注销',
      confirmColor: '#c2413d',
      success: (result) => {
        if (!result.confirm) return

        wx.showModal({
          title: '再次确认',
          content: '此操作会使当前微信账号退出九辰系统。确定注销吗？',
          confirmText: '确认注销',
          confirmColor: '#c2413d',
          success: async (finalResult) => {
            if (!finalResult.confirm) return

            try {
              await deleteCurrentAccount()
              this.setData(getIdentityView(null))
              wx.showToast({ title: '账号已注销', icon: 'none' })
              wx.reLaunch({ url: '/pages/login/login' })
            } catch (error) {
              wx.showToast({
                title: friendlyRequestError(error, '注销失败，请稍后重试'),
                icon: 'none',
                duration: 2600,
              })
            }
          },
        })
      },
    })
  },
})
