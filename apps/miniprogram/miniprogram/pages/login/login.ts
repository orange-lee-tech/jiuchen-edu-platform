import {
  bootstrapPhoneUser,
  bootstrapWechatUser,
  saveAuthResult,
  type BootstrapResult,
} from '../../utils/auth'

async function finishLogin(result: BootstrapResult) {
  saveAuthResult(result)

  if (result.user.role === 'user') {
    await new Promise<void>((resolve) => {
      wx.showModal({
        title: '登录成功',
        content: '当前账号为游客。可在“我的 → 个人资料”填写九辰内部ID完成身份绑定。',
        showCancel: false,
        success: () => resolve(),
        fail: () => resolve(),
      })
    })
  } else {
    wx.showToast({ title: '登录成功', icon: 'success' })
  }

  wx.switchTab({ url: '/pages/profile/profile' })
}

Page({
  data: {
    agreed: false,
    loading: false,
  },

  onAgreementChange(event: WechatMiniprogram.CustomEvent<{ value: string[] }>) {
    this.setData({ agreed: event.detail.value.includes('accepted') })
  },

  onAgreementTap() {
    wx.showModal({
      title: '用户协议（占位）',
      content: '当前为开发阶段占位协议。正式上线前将替换为经审核的完整用户协议文本。',
      showCancel: false,
      confirmText: '我知道了',
    })
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
      const message = error instanceof Error ? error.message : '登录失败'
      wx.showToast({ title: message, icon: 'none', duration: 2500 })
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
      const message = error instanceof Error ? error.message : '手机号登录失败'
      wx.showToast({ title: message, icon: 'none', duration: 2500 })
    } finally {
      this.setData({ loading: false })
    }
  },
})
