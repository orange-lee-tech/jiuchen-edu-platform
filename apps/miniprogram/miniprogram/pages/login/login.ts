import {
  bootstrapWechatUser,
  saveAuthResult,
} from '../../utils/auth'

type LoginMethod = 'wechat' | 'password' | 'phone'

Page({
  data: {
    method: 'wechat' as LoginMethod,
    agreed: false,
    loading: false,
    account: '',
    password: '',
    phone: '',
    phoneCode: '',
  },

  onMethodChange(event: WechatMiniprogram.BaseEvent) {
    const method = String(event.currentTarget.dataset.method) as LoginMethod
    if (!['wechat', 'password', 'phone'].includes(method)) return
    this.setData({ method })
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

  onInput(event: WechatMiniprogram.Input) {
    const field = String(event.currentTarget.dataset.field)
    if (!['account', 'password', 'phone', 'phoneCode'].includes(field)) return
    this.setData({ [field]: event.detail.value })
  },

  onUnavailableLogin() {
    wx.showToast({
      title: this.data.method === 'phone' ? '手机号认证服务待接入' : '账号密码登录待接入',
      icon: 'none',
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
    } catch (error) {
      const message = error instanceof Error ? error.message : '登录失败'
      wx.showToast({ title: message, icon: 'none', duration: 2500 })
    } finally {
      this.setData({ loading: false })
    }
  },
})
