import { getSavedAuthResult } from '../../utils/auth'
import {
  getCachedAcademicProfile,
  saveCachedAcademicProfile,
} from '../../utils/profile-cache'
import {
  friendlyRequestError,
  getMyAcademicProfile,
  updateMyAcademicProfile,
  type AcademicProfile,
} from '../../utils/request'

type ProfileField = keyof AcademicProfile

let profileSaveTimer: ReturnType<typeof setTimeout> | null = null

const EMPTY_PROFILE = {
  university: '',
  major: '',
  currentGrade: '',
  gpaText: '',
  rankText: '',
}

Page({
  data: {
    canEditProfile: false,
    profileSaving: false,
    profileForm: { ...EMPTY_PROFILE },
    dimensions: [
      { title: '学业基础', desc: '绩点、排名与核心课程', status: '待补充' },
      { title: '英语能力', desc: '四六级、雅思、托福等', status: '待补充' },
      { title: '科研经历', desc: '项目、论文与导师经历', status: '待补充' },
      { title: '竞赛实践', desc: '竞赛、创新创业与作品', status: '待补充' },
    ],
  },

  onShow() {
    const auth = getSavedAuthResult()
    const canEditProfile =
      Boolean(auth) &&
      (auth?.user.role === 'user' || auth?.user.role === 'student')

    this.setData({ canEditProfile })

    const cached = getCachedAcademicProfile()
    if (cached && canEditProfile) {
      this.setData({
        profileForm: {
          university: cached.university || '',
          major: cached.major || '',
          currentGrade: cached.currentGrade || '',
          gpaText: cached.gpaText || '',
          rankText: cached.rankText || '',
        },
      })
    }

    if (canEditProfile) {
      void this.loadAcademicProfile()
    } else {
      this.setData({ profileForm: { ...EMPTY_PROFILE } })
    }
  },

  async loadAcademicProfile() {
    try {
      const profile = await getMyAcademicProfile()
      const normalized = {
        university: profile.university || '',
        major: profile.major || '',
        currentGrade: profile.currentGrade || '',
        gpaText: profile.gpaText || '',
        rankText: profile.rankText || '',
      }
      this.setData({ profileForm: normalized })
      saveCachedAcademicProfile(normalized)
    } catch (error) {
      console.info('Academic profile is unavailable on position page.', error)
    }
  },

  onProfileInput(event: WechatMiniprogram.Input) {
    const field = String(event.currentTarget.dataset.field) as ProfileField
    if (!(field in this.data.profileForm)) return

    this.setData({
      [`profileForm.${field}`]: event.detail.value,
    })

    const form = {
      ...this.data.profileForm,
      [field]: event.detail.value,
    }
    saveCachedAcademicProfile(form)

    if (profileSaveTimer) clearTimeout(profileSaveTimer)
    profileSaveTimer = setTimeout(() => {
      void this.persistProfile()
    }, 650)
  },

  async persistProfile() {
    if (!this.data.canEditProfile || this.data.profileSaving) return

    try {
      this.setData({ profileSaving: true })
      const form = this.data.profileForm
      const saved = await updateMyAcademicProfile({
        university: form.university.trim() || null,
        major: form.major.trim() || null,
        currentGrade: form.currentGrade.trim() || null,
        gpaText: form.gpaText.trim() || null,
        rankText: form.rankText.trim() || null,
      })
      const normalized = {
        university: saved.university || '',
        major: saved.major || '',
        currentGrade: saved.currentGrade || '',
        gpaText: saved.gpaText || '',
        rankText: saved.rankText || '',
      }
      this.setData({ profileForm: normalized })
      saveCachedAcademicProfile(normalized)
    } catch (error) {
      wx.showToast({
        title: friendlyRequestError(error, '资料自动保存失败'),
        icon: 'none',
        duration: 2200,
      })
    } finally {
      this.setData({ profileSaving: false })
    }
  },

  onProfileBlur() {
    if (profileSaveTimer) {
      clearTimeout(profileSaveTimer)
      profileSaveTimer = null
    }
    void this.persistProfile()
  },

  onUnload() {
    if (profileSaveTimer) {
      clearTimeout(profileSaveTimer)
      profileSaveTimer = null
    }
    if (this.data.canEditProfile) void this.persistProfile()
  },

  onStartAssessment() {
    const auth = getSavedAuthResult()

    if (!auth) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }

    if (auth.user.role !== 'user' && auth.user.role !== 'student') {
      wx.showToast({ title: '当前身份不使用 AI 定位', icon: 'none' })
      return
    }

    wx.navigateTo({ url: '/pages/assessment-form/assessment-form' })
  },

  onProfileCardTap() {
    if (this.data.canEditProfile) return
    wx.navigateTo({ url: '/pages/login/login' })
  },
})
