import { OFFICIAL_WEBSITE } from '../../utils/website'

Component({
  data: { visible: false, url: OFFICIAL_WEBSITE },
  methods: {
    open() { this.setData({ visible: true }) },
    close() { this.setData({ visible: false }) },
    preventTouch() {},
    onCopy() {
      wx.setClipboardData({
        data: OFFICIAL_WEBSITE,
        success: () => { this.close(); wx.showToast({ title: '官网地址已复制', icon: 'success' }) },
        fail: () => wx.showToast({ title: '复制失败，请重试', icon: 'none' }),
      })
    },
    onLinkTap() {
      // WeChat does not expose a general API to start the system default browser.
      // Never claim an unapproved business domain can be visited by mini-program web-view.
      wx.setClipboardData({
        data: OFFICIAL_WEBSITE,
        success: () => wx.showModal({
          title: '官网地址已复制',
          content: '微信小程序暂不支持直接唤起手机默认浏览器。请在手机浏览器粘贴地址访问；小程序内打开需另行完成微信业务域名验证。',
          showCancel: false,
        }),
        fail: () => wx.showToast({ title: '复制失败，请重试', icon: 'none' }),
      })
    },
  },
})
