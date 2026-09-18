import { getSavedAuthResult } from '../../utils/auth'
import {
  getMyAcademicProfile,
  updateMyAcademicProfile,
  type AcademicProfile,
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
    form: { ...EMPTY_FORM },
  },

  onLoad() {
    const auth = getSavedAuthResult()

    if (!auth || auth.portal !== 'student') {
      wx.showToast({ title: '请先使用学员入口登录', icon: 'none' })
      wx.navigateTo({ url: '/pages/login/login' })
      this.setData({ loading: false })
      return
    }

    void this.loadProfile()
  },

  async loadProfile() {
    try {
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
    } catch (error) {
      console.info('Academic profile is not available yet.', error)
    } finally {
      this.setData({ loading: false })
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
