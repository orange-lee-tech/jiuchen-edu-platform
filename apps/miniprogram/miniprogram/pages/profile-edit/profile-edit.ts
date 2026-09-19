import {
  getSavedAuthResult,
  updateSavedIdentity,
  type UserRole,
} from '../../utils/auth'
import {
  claimMyInternalIdentity,
  getMyAcademicProfile,
  getMyInternalIdentity,
  updateMyAcademicProfile,
  type AcademicProfile,
  type InternalIdentity,
} from '../../utils/request'

type ProfileField = keyof AcademicProfile

const EMPTY_FORM = {
  university: '',
  major: '',
  currentGrade: '',
  gpaText: '',
  rankText: '',
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
      wx.navigateTo({ url: '/pages/login/login' })
      this.setData({ loading: false })
      return
    }

    const canEditAcademic = auth.user.role === 'user' || auth.user.role === 'student'
    this.setData({
      role: auth.user.role,
      canEditAcademic,
    })

    void this.loadAll()
  },

  async loadAll() {
    try {
      const identityResult = await getMyInternalIdentity()
      this.setData({
        identity: identityResult.identity,
        identityLocked: identityResult.locked,
      })

      if (this.data.canEditAcademic) {
        const profile = await getMyAcademicProfile()
        this.setData({
          form: {
            university: profile.university ?? '',
            major: profile.major ?? '',
            currentGrade: profile.currentGrade ?? '',
            gpaText: profile.gpaText ?? '',
            rankText: profile.rankText ?? '',
          },
        })
      }
    } catch (error) {
      console.info('Profile data is not available yet.', error)
    } finally {
      this.setData({ loading: false })
    }
  },

  onInternalIdInput(event: WechatMiniprogram.Input) {
    this.setData({ internalIdInput: event.detail.value.toUpperCase() })
  },

  async onClaimInternalId() {
    const businessId = this.data.internalIdInput.trim()

    if (!businessId) {
      wx.showToast({ title: '请填写内部ID', icon: 'none' })
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
      const message = error instanceof Error ? error.message : ''
      const title = message.includes('invalid_internal_id')
        ? '填写错误，请核对重新填写'
        : message.includes('internal_id_locked')
          ? '内部ID已绑定，如需变更请联系管理员'
          : '身份绑定失败'
      wx.showToast({ title, icon: 'none', duration: 2600 })
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

      wx.showToast({ title: '资料已保存', icon: 'success' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败'
      wx.showToast({ title: message, icon: 'none', duration: 2500 })
    } finally {
      this.setData({ saving: false })
    }
  },
})
