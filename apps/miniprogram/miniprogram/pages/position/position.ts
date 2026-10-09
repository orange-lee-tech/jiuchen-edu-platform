import { getSavedAuthResult } from '../../utils/auth'
import { INITIAL_SHELL, loginFor, observeShell, openSlot, shellView } from '../../utils/navigation'
import { getMyAcademicProfile } from '../../utils/request'

const EMPTY_PROFILE = {
  university: '',
  major: '',
  currentGrade: '',
  gpaText: '',
  rankText: '',
}

Page({
  data: {
    ...INITIAL_SHELL,
    canEditProfile: false,
    profileForm: { ...EMPTY_PROFILE },
    dimensions: [
      { key: 'profile', title: '学业基础', desc: '绩点、排名与核心课程', status: '填写 ›' },
      { key: 'english', title: '英语能力', desc: '四六级、雅思、托福等', status: '填写 ›' },
      { key: 'research', title: '科研经历', desc: '项目、论文与导师经历', status: '填写 ›' },
      { key: 'competition', title: '竞赛实践', desc: '竞赛、创新创业与作品', status: '填写 ›' },
    ],
  },

  stopAuth: undefined as (() => void) | undefined,
  profileOwner: null as string | null,
  onShow() {
    this.stopAuth?.()
    this.stopAuth = observeShell((state) => {
      this.setData(shellView(state))
      if (state.phase === 'ready') this.initializePosition()
      else this.setData({ canEditProfile: false })
    })
  },
  onHide() { this.stopAuth?.() },
  initializePosition() {
    const auth = getSavedAuthResult()
    const canEditProfile =
      Boolean(auth) &&
      (auth?.user.role === 'user' || auth?.user.role === 'student')

    const sameOwner = this.profileOwner === auth?.user.id
    if (canEditProfile && !sameOwner) {
      this.profileOwner = auth!.user.id
      this.setData({ profileForm: { ...EMPTY_PROFILE } })
    }
    this.setData({ canEditProfile })
    if (canEditProfile) void this.loadAcademicProfile()
  },

  async loadAcademicProfile() {
    const owner = this.profileOwner
    try {
      const profile = await getMyAcademicProfile()
      if (!this.data.canEditProfile ||
        owner !== this.profileOwner || owner !== getSavedAuthResult()?.user.id) return
      const normalized = {
        university: profile.university || '',
        major: profile.major || '',
        currentGrade: profile.currentGrade || '',
        gpaText: profile.gpaText || '',
        rankText: profile.rankText || '',
      }
      this.setData({ profileForm: normalized })
    } catch (error) {
      console.info('Academic profile is unavailable on position page.', error)
    }
  },

  onUnload() { this.stopAuth?.() },

  onStartAssessment() {
    const auth = getSavedAuthResult()

    if (!auth) {
      loginFor('pages/assessment-form/assessment-form', {}, true)
      return
    }

    if (auth.user.role !== 'user' && auth.user.role !== 'student') {
      wx.showToast({ title: '当前身份不使用 AI 定位', icon: 'none' })
      return
    }

    wx.navigateTo({ url: '/pages/assessment-form/assessment-form' })
  },

  onAssessmentHistory() {
    const auth = getSavedAuthResult()
    if (!auth) {
      loginFor('pages/assessment-history/assessment-history', {}, true)
      return
    }
    wx.navigateTo({ url: '/pages/assessment-history/assessment-history' })
  },

  onProfileCardTap() {
    if (this.data.canEditProfile) wx.navigateTo({ url: '/pages/profile-edit/profile-edit' })
    else if (getSavedAuthResult()) openSlot('mine')
    else loginFor('pages/position/position', {}, true)
  },

  onDimensionTap(event: WechatMiniprogram.BaseEvent) {
    const auth = getSavedAuthResult()
    if (!auth) {
      loginFor('pages/position/position', {}, true)
      return
    }

    if (auth.user.role !== 'user' && auth.user.role !== 'student') {
      wx.showToast({ title: '当前身份不编辑定位资料', icon: 'none' })
      return
    }

    const key = String(event.currentTarget.dataset.key || '')
    if (key === 'profile') {
      wx.navigateTo({ url: '/pages/profile-edit/profile-edit' })
      return
    }

    if (!['english', 'research', 'competition'].includes(key)) return
    wx.navigateTo({
      url: `/pages/assessment-form/assessment-form?section=${encodeURIComponent(key)}`,
    })
  },
})
