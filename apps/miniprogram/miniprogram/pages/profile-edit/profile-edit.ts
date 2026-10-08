import {
  getSavedAuthResult,
  updateSavedIdentity,
  type UserRole,
} from '../../utils/auth'
import {
  claimMyInternalIdentity,
  friendlyRequestError,
  getMyAcademicProfile,
  getMyInternalIdentity,
  updateMyAcademicProfile,
  type AcademicProfile,
  type InternalIdentity,
} from '../../utils/request'
import {
  getCachedAcademicProfile,
  saveCachedAcademicProfile,
} from '../../utils/profile-cache'
import { clearGrowthProfileBootstrapCache } from '../../utils/growth-profile-cache'

type ProfileField = keyof AcademicProfile

const EMPTY_FORM = {
  university: '',
  major: '',
  currentGrade: '',
  gpaText: '',
  rankText: '',
}

function normalizeInternalId(value: string) {
  // NFKC handles full-width Latin letters/digits and punctuation pasted from chat.
  const normalized = value.normalize('NFKC').toUpperCase()
  const compact = normalized.replace(/[^A-Z0-9]/g, '')
  const match = compact.match(/^(JC[STA])([A-Z0-9]{4})([A-Z0-9]{4})$/)

  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`
  }

  return normalized.replace(/\s+/g, '')
}

Page({
  data: {
    loading: true,
    saving: false,
    claiming: false,
    role: 'user' as UserRole,
    canEditAcademic: true,
    internalIdInput: '',
    identity: null as InternalIdentity | null,
    identityLocked: false,
    form: { ...EMPTY_FORM },
  },

  onLoad() {
    const auth = getSavedAuthResult()

    if (!auth) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      wx.redirectTo({ url: '/pages/login/login' })
      this.setData({ loading: false })
      return
    }

    const canEditAcademic = auth.user.role === 'user' || auth.user.role === 'student'
    this.setData({
      role: auth.user.role,
      canEditAcademic,
    })

    void this.hydrateThenLoad()
  },

  async hydrateThenLoad() {
    await this.hydrateCachedProfile()
    await this.loadAll()
  },

  async hydrateCachedProfile() {
    if (!this.data.canEditAcademic) return
    const profile = await getCachedAcademicProfile()
    if (!profile) return

    this.setData({
      form: {
        university: profile.university ?? '',
        major: profile.major ?? '',
        currentGrade: profile.currentGrade ?? '',
        gpaText: profile.gpaText ?? '',
        rankText: profile.rankText ?? '',
      },
    })
  },

  async loadAll() {
    try {
      const [identityResult, profile] = await Promise.all([
        getMyInternalIdentity(),
        this.data.canEditAcademic
          ? getMyAcademicProfile()
          : Promise.resolve(null),
      ])

      this.setData({
        identity: identityResult.identity,
        identityLocked: identityResult.locked,
      })

      if (profile) {
        this.setData({
          form: {
            university: profile.university ?? '',
            major: profile.major ?? '',
            currentGrade: profile.currentGrade ?? '',
            gpaText: profile.gpaText ?? '',
            rankText: profile.rankText ?? '',
          },
        })
        void saveCachedAcademicProfile(profile)
      }
    } catch (error) {
      console.info('Profile data is not available yet.', error)
    } finally {
      this.setData({ loading: false })
    }
  },

  onInternalIdInput(event: WechatMiniprogram.Input) {
    this.setData({ internalIdInput: normalizeInternalId(event.detail.value) })
  },

  async onClaimInternalId() {
    const businessId = normalizeInternalId(this.data.internalIdInput.trim())

    if (!businessId) {
      wx.showToast({ title: '请填写内部ID', icon: 'none' })
      return
    }

    // Security boundary: possession of a JCA code must never grant admin access.
    // Explain the expected admin-assisted binding workflow instead of showing
    // the generic invalid-code error from the self-claim endpoint.
    if (/^JCA-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(businessId)) {
      wx.showModal({
        title: '管理员ID需后台授权',
        content: '管理员ID不支持在个人资料自行认领。请先使用未绑定身份的微信账号登录，再由已有管理员在「我的 → 内部用户与ID → 绑定游客账号」中完成绑定。',
        showCancel: false,
      })
      return
    }

    try {
      this.setData({ claiming: true })
      const result = await claimMyInternalIdentity(businessId)
      updateSavedIdentity(result.role, result.identity)
      this.setData({
        role: result.role,
        canEditAcademic: result.role === 'student',
        identity: result.identity,
        identityLocked: true,
        internalIdInput: '',
      })
      wx.showModal({
        title: '身份绑定成功',
        content: `已绑定内部ID：${result.identity.businessId}。此ID已锁定，如需变更请联系管理员。`,
        showCancel: false,
      })
    } catch (error) {
      wx.showToast({
        title: friendlyRequestError(error, '身份绑定失败，请稍后重试'),
        icon: 'none',
        duration: 2600,
      })
    } finally {
      this.setData({ claiming: false })
    }
  },

  onFieldInput(event: WechatMiniprogram.Input) {
    const field = String(event.currentTarget.dataset.field) as ProfileField
    if (!(field in this.data.form)) return

    this.setData({
      [`form.${field}`]: event.detail.value,
    })
  },

  async onSave() {
    if (!this.data.canEditAcademic) return

    try {
      this.setData({ saving: true })
      const form = this.data.form
      const saved = await updateMyAcademicProfile({
        university: form.university.trim() || null,
        major: form.major.trim() || null,
        currentGrade: form.currentGrade.trim() || null,
        gpaText: form.gpaText.trim() || null,
        rankText: form.rankText.trim() || null,
      })

      this.setData({
        form: {
          university: saved.university ?? '',
          major: saved.major ?? '',
          currentGrade: saved.currentGrade ?? '',
          gpaText: saved.gpaText ?? '',
          rankText: saved.rankText ?? '',
        },
      })

      await Promise.all([
        saveCachedAcademicProfile(saved),
        clearGrowthProfileBootstrapCache(),
      ])
      wx.showToast({ title: '资料已保存', icon: 'success' })
    } catch (error) {
      wx.showToast({
        title: friendlyRequestError(error, '保存失败，请稍后重试'),
        icon: 'none',
        duration: 2600,
      })
    } finally {
      this.setData({ saving: false })
    }
  },
})
