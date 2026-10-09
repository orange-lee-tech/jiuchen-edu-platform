import {
  bootstrapPhoneUser,
  bootstrapWechatUser,
  saveAuthResult,
  type BootstrapResult,
} from '../../utils/auth'
import { friendlyRequestError } from '../../utils/request'
import { clearLoginIntent, finishLoginNavigation } from '../../utils/navigation'

async function finishLogin(result: BootstrapResult) {
  saveAuthResult(result)

  wx.showToast({ title: '登录成功', icon: 'success' })

  finishLoginNavigation(result)
}

Page({
  data: {
    agreed: false,
    loading: false,
  },
  onUnload() { clearLoginIntent() },

  onAgreementChange(event: WechatMiniprogram.CustomEvent<{ value: string[] }>) {
    this.setData({ agreed: event.detail.value.includes('accepted') })
  },

  onAgreementTap() {
    wx.navigateTo({ url: '/pages/user-agreement/user-agreement' })
  },

  async onWechatLogin() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先勾选用户协议', icon: 'none' })
      return
    }

    try {
      this.setData({ loading: true })
      const result = await bootstrapWechatUser(true)
      await finishLogin(result)
    } catch (error) {
      wx.showToast({
        title: friendlyRequestError(error, '登录失败，请稍后重试'),
        icon: 'none',
        duration: 2600,
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async onPhoneLogin(
    event: WechatMiniprogram.CustomEvent<{ code?: string; errMsg?: string }>,
  ) {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先勾选用户协议', icon: 'none' })
      return
    }

    const phoneCode = event.detail.code
    if (!phoneCode) {
      wx.showToast({ title: '未完成手机号授权', icon: 'none' })
      return
    }

    try {
      this.setData({ loading: true })
      const result = await bootstrapPhoneUser(phoneCode, true)
      await finishLogin(result)
    } catch (error) {
      wx.showToast({
        title: friendlyRequestError(error, '手机号登录失败，请稍后重试'),
        icon: 'none',
        duration: 2600,
      })
    } finally {
      this.setData({ loading: false })
    }
  },
})
