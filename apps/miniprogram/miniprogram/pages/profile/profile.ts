import {
  clearSavedAuthResult,
  getSavedAuthResult,
  type BootstrapResult,
} from '../../utils/auth'

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

const STUDENT_MENUS = [
  { key: 'profile', title: '个人资料', desc: '院校、专业、年级与成绩背景' },
  { key: 'assessment', title: '我的评估', desc: '查看历史 AI 定位结果' },
  { key: 'favorites', title: '我的收藏', desc: '收藏的院校、项目与资讯' },
  { key: 'credits', title: '评估额度', desc: '查看剩余次数与使用记录' },
  { key: 'service', title: '联系客服', desc: '课程与保研规划咨询' },
]

const TEACHER_MENUS = [
  { key: 'students', title: '我的学员', desc: '查看已分配学员与当前培养阶段' },
  { key: 'schedule', title: '辅导安排', desc: '查看待办辅导与阶段任务' },
  { key: 'records', title: '辅导记录', desc: '查看和维护已授权学员的辅导记录' },
  { key: 'profile', title: '老师资料', desc: '展示给学员的介绍与专业信息' },
  { key: 'service', title: '联系运营', desc: '账号、学员分配与数据问题' },
]

function getIdentityView(auth: BootstrapResult | null) {
  if (!auth) {
    return {
      loggedIn: false,
      roleLabel: '未登录',
      portal: '',
      user: {
        name: '登录九辰保研',
        meta: '登录后查看与你身份对应的服务',
      },
      stats: STUDENT_STATS,
      menus: STUDENT_MENUS,
    }
  }

  if (auth.portal === 'teacher') {
    return {
      loggedIn: true,
      roleLabel: auth.user.role === 'admin' || auth.user.role === 'staff' ? '内部老师入口' : '辅导老师',
      portal: 'teacher',
      user: {
        name: auth.user.displayName || '九辰辅导老师',
        meta: '查看学员、辅导安排与工作记录',
      },
      stats: TEACHER_STATS,
      menus: TEACHER_MENUS,
    }
  }

  return {
    loggedIn: true,
    roleLabel: auth.needsProfileBinding ? '待绑定学员' : '学员',
    portal: 'student',
    user: {
      name: auth.user.displayName || (auth.needsProfileBinding ? '微信用户' : '九辰学员'),
      meta: auth.needsProfileBinding
        ? '已登录，等待九辰后台绑定正式学员档案'
        : '查看你的保研档案与学习服务',
    },
    stats: STUDENT_STATS,
    menus: STUDENT_MENUS,
  }
}

Page({
  data: {
    loggedIn: false,
    roleLabel: '未登录',
    portal: '',
    user: {
      name: '登录九辰保研',
      meta: '登录后查看与你身份对应的服务',
    },
    stats: STUDENT_STATS,
    menus: STUDENT_MENUS,
  },

  onShow() {
    const auth = getSavedAuthResult()
    this.setData(getIdentityView(auth))
  },

  onIdentityTap() {
    if (this.data.loggedIn) return
    wx.navigateTo({ url: '/pages/login/login' })
  },

  onMenuTap(event: WechatMiniprogram.BaseEvent) {
    if (!this.data.loggedIn) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }

    const title = String(event.currentTarget.dataset.title || '')
    wx.showToast({ title: title + '功能已预留', icon: 'none' })
  },

  onLogout() {
    clearSavedAuthResult()
    this.setData(getIdentityView(null))
    wx.showToast({ title: '已退出登录', icon: 'none' })
  },
})
