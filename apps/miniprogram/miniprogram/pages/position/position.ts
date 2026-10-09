import { getSavedAuthResult } from '../../utils/auth'
import { INITIAL_SHELL, loginFor, observeShell, openSlot, shellView } from '../../utils/navigation'
import {
  getCachedAcademicProfile,
  saveCachedAcademicProfile,
} from '../../utils/profile-cache'
import { clearGrowthProfileBootstrapCache } from '../../utils/growth-profile-cache'
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
    ...INITIAL_SHELL,
    canEditProfile: false,
    profileSaving: false,
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
  profileDirty: false,
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
      this.profileDirty = false
      this.setData({ profileForm: { ...EMPTY_PROFILE } })
    }
    this.setData({ canEditProfile })

    if (canEditProfile && !(sameOwner && this.profileDirty)) {
      void this.hydrateThenLoadProfile()
    }
  },

  async hydrateThenLoadProfile() {
    const owner = this.profileOwner
    await this.hydrateCachedProfile()
    if (owner !== this.profileOwner || owner !== getSavedAuthResult()?.user.id) return
    await this.loadAcademicProfile()
  },

  async hydrateCachedProfile() {
    const owner = this.profileOwner
    const cached = await getCachedAcademicProfile()
    if (!cached || !this.data.canEditProfile || this.profileDirty ||
      owner !== this.profileOwner || owner !== getSavedAuthResult()?.user.id) return

    this.setData({
      profileForm: {
        university: cached.university || '',
        major: cached.major || '',
        currentGrade: cached.currentGrade || '',
        gpaText: cached.gpaText || '',
        rankText: cached.rankText || '',
      },
    })
  },

  async loadAcademicProfile() {
    const owner = this.profileOwner
    try {
      const profile = await getMyAcademicProfile()
      if (!this.data.canEditProfile || this.profileDirty ||
        owner !== this.profileOwner || owner !== getSavedAuthResult()?.user.id) return
      const normalized = {
        university: profile.university || '',
        major: profile.major || '',
        currentGrade: profile.currentGrade || '',
        gpaText: profile.gpaText || '',
        rankText: profile.rankText || '',
      }
      this.setData({ profileForm: normalized })
      void saveCachedAcademicProfile(normalized)
    } catch (error) {
      console.info('Academic profile is unavailable on position page.', error)
    }
  },

  onProfileInput(event: WechatMiniprogram.Input) {
    this.profileDirty = true
    const field = String(event.currentTarget.dataset.field) as ProfileField
    if (!(field in this.data.profileForm)) return

    this.setData({
      [`profileForm.${field}`]: event.detail.value,
    })

    const form = {
      ...this.data.profileForm,
      [field]: event.detail.value,
    }
    void saveCachedAcademicProfile(form)

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
      this.profileDirty = false
      await Promise.all([
        saveCachedAcademicProfile(normalized),
        clearGrowthProfileBootstrapCache(),
      ])
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
    this.stopAuth?.()
    if (profileSaveTimer) {
      clearTimeout(profileSaveTimer)
      profileSaveTimer = null
    }
    if (this.data.canEditProfile) void this.persistProfile()
  },

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
    if (this.data.canEditProfile) return
    if (getSavedAuthResult()) openSlot('mine')
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
