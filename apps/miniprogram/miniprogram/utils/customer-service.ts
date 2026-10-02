import { runtimeConfig } from '../config/runtime'

export function supportsWechatCustomerService(): boolean {
  try {
    return wx.canIUse('openCustomerServiceChat')
  } catch {
    return false
  }
}

export function openWechatCustomerService(): void {
  const { corpId, url } = runtimeConfig.wechatCustomerService

  if (!corpId || !url) {
    wx.showToast({
      title: '客服暂未配置',
      icon: 'none',
    })
    return
  }

  if (!supportsWechatCustomerService()) {
    wx.showToast({
      title: '当前微信版本暂不支持，请升级微信后重试',
      icon: 'none',
    })
    return
  }

  wx.openCustomerServiceChat({
    corpId,
    extInfo: { url },
    fail(error) {
      console.error('Failed to open WeChat customer service.', error)
      wx.showToast({
        title: '客服暂时无法打开，请稍后重试',
        icon: 'none',
      })
    },
  })
}
