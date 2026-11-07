import { getSavedAuthResult } from '../../utils/auth'
import {isReadOnly,getReadOnlyContext} from '../../utils/read-only-context'
import { INITIAL_SHELL, loginFor, observeShell, openSlot, shellView } from '../../utils/navigation'
import { friendlyRequestError, getMyAcademicProfile, updateMyAcademicProfile } from '../../utils/request'
import { saveCachedAcademicProfile } from '../../utils/profile-cache'
import { clearGrowthProfileBootstrapCache } from '../../utils/growth-profile-cache'
import { EMPTY_POSITION_PROFILE, POSITION_PROFILE_FIELDS, positionProfileDirty, positionProfileError, positionProfileForm, positionProfilePatch, type PositionProfileForm } from '../../utils/position-profile-form'


Page({
  data: {
    ...INITIAL_SHELL,
    canEditProfile: false,
    profileLoading: false,
    profileError: '',
    profileForm: { ...EMPTY_POSITION_PROFILE },
    profileDraft: null as PositionProfileForm | null,
    profileNeedsResume: false,
    profileSaving: false,
    profileSaveError: '',
    gradeOptions: ['大一', '大二', '大三', '大四', '大五', '已毕业'],
    dimensions: [
      { key: 'profile', title: '学业基础', desc: '绩点、排名与核心课程', status: '查看 / 补充 ›' },
      { key: 'english', title: '英语能力', desc: '四六级、雅思、托福等', status: '查看 / 补充 ›' },
      { key: 'research', title: '科研经历', desc: '项目、论文与导师经历', status: '查看 / 补充 ›' },
      { key: 'competition', title: '竞赛实践', desc: '竞赛、创新创业与作品', status: '查看 / 补充 ›' },
    ],
  },

  stopAuth: undefined as (() => void) | undefined,
  profileOwner: null as string | null,
  detachedProfileDrafts: [] as Array<{ owner: string; draft: PositionProfileForm }>,
  onShow() {
    this.stopAuth?.()
    this.stopAuth = observeShell((state) => {
      this.setData(shellView(state))
      if (state.phase === 'ready') this.initializePosition()
      else this.setData({ canEditProfile: false, profileLoading: false, profileError: '', profileForm: { ...EMPTY_POSITION_PROFILE } })
    })
  },
  onHide() {
    if (this.profileDraftDirty()) this.setData({ profileNeedsResume: true })
    this.stopAuth?.()
  },
  profileDraftDirty() {
    return Boolean(this.data.profileDraft && positionProfileDirty(this.data.profileDraft, this.data.profileForm))
  },
  initializePosition() {
    const auth = getSavedAuthResult()
    const canEditProfile =
      Boolean(auth) &&
      ((getReadOnlyContext()?.role||auth?.user.role) === 'user' || (getReadOnlyContext()?.role||auth?.user.role) === 'student')

    const owner = canEditProfile ? `${auth!.user.id}:${auth!.businessIdentity?.businessId || ''}:${getReadOnlyContext()?.id || ''}` : null
    if (owner !== this.profileOwner) {
      const previousOwner = this.profileOwner
      if (previousOwner && this.data.profileDraft && this.profileDraftDirty()) {
        this.detachedProfileDrafts = this.detachedProfileDrafts.filter(item => item.owner !== previousOwner)
        this.detachedProfileDrafts.push({ owner: previousOwner, draft: this.data.profileDraft })
        wx.showModal({ title: '身份已切换', content: '上一身份的未保存资料已隔离，返回该身份后可继续编辑。', showCancel: false })
      }
      this.profileOwner = owner
      const detached = this.detachedProfileDrafts.find(item => item.owner === owner)
      this.setData({ profileForm: { ...EMPTY_POSITION_PROFILE }, profileDraft: detached?.draft || null, profileNeedsResume: Boolean(detached), profileLoading: false, profileSaving: false, profileError: '', profileSaveError: '' })
    }
    this.setData({ canEditProfile })
    if (canEditProfile) void this.loadAcademicProfile()
  },

  async loadAcademicProfile() {
    const owner = this.profileOwner
    if (!owner || this.data.profileLoading) return
    this.setData({ profileLoading: true, profileError: '' })
    try {
      const profile = await getMyAcademicProfile()
      if (!this.data.canEditProfile ||
        owner !== this.profileOwner) return
      this.setData({ profileForm: positionProfileForm(profile) })
    } catch (error) {
      if (owner === this.profileOwner) this.setData({ profileError: friendlyRequestError(error, '学业资料暂时无法读取，请重试') })
    } finally {
      if (owner === this.profileOwner) this.setData({ profileLoading: false })
    }
  },

  onRetryProfile() { void this.loadAcademicProfile() },

  onProfileInput(event: WechatMiniprogram.Input) {
    const field = String(event.currentTarget.dataset.field) as keyof PositionProfileForm
    if (!this.data.profileDraft || !POSITION_PROFILE_FIELDS.includes(field)) return
    this.setData({ [`profileDraft.${field}`]: event.detail.value, profileSaveError: '' })
  },
  onProfileGradeChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const grade = this.data.gradeOptions[Number(event.detail.value)]
    if (grade && this.data.profileDraft) this.setData({ 'profileDraft.currentGrade': grade, profileSaveError: '' })
  },
  onContinueProfile() { if (this.data.profileDraft) this.setData({ profileNeedsResume: false }) },
  onCancelProfile() {
    if (!this.data.profileDraft) return
    const close = () => this.setData({ profileDraft: null, profileNeedsResume: false, profileSaveError: '' })
    if (!this.profileDraftDirty()) { close(); return }
    wx.showModal({ title: '放弃未保存修改？', content: '当前资料修改尚未保存。', confirmText: '放弃修改', cancelText: '继续编辑', success: result => { if (result.confirm) close() } })
  },
  async onSaveProfile() {
    const draft = this.data.profileDraft, owner = this.profileOwner
    if (!draft || !owner || this.data.profileSaving || !this.data.canEditProfile || isReadOnly()) return
    const validationError = positionProfileError(draft)
    if (validationError) { this.setData({ profileSaveError: validationError }); return }
    this.setData({ profileSaving: true, profileSaveError: '' })
    try {
      const saved = await updateMyAcademicProfile(positionProfilePatch(draft))
      if (owner !== this.profileOwner || isReadOnly()) return
      this.detachedProfileDrafts = this.detachedProfileDrafts.filter(item => item.owner !== owner)
      this.setData({ profileForm: positionProfileForm(saved), profileDraft: null, profileNeedsResume: false })
      await Promise.all([saveCachedAcademicProfile(saved), clearGrowthProfileBootstrapCache()])
      wx.showToast({ title: '资料已保存', icon: 'success' })
    } catch (error) {
      if (owner === this.profileOwner) this.setData({ profileSaveError: friendlyRequestError(error, '保存失败，草稿已保留，请重试') })
    } finally {
      if (owner === this.profileOwner) this.setData({ profileSaving: false })
    }
  },

  onUnload() { this.stopAuth?.() },

  onStartAssessment() {
    if(isReadOnly())return
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
    if(isReadOnly())return
    if (this.data.canEditProfile) this.setData({ profileDraft: this.data.profileDraft || { ...this.data.profileForm }, profileNeedsResume: false, profileSaveError: '' })
    else if (getSavedAuthResult()) openSlot('mine')
    else loginFor('pages/position/position', {}, true)
  },

  onDimensionTap(event: WechatMiniprogram.BaseEvent) {
    if(isReadOnly())return
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
      this.onProfileCardTap()
      return
    }

    if (!['english', 'research', 'competition'].includes(key)) return
    wx.navigateTo({
      url: `/pages/assessment-form/assessment-form?section=${encodeURIComponent(key)}`,
    })
  },
})
