export const OFFICIAL_WEBSITE = 'https://jiuchenedu.com'
/** Domain approval is an operator Gate, not a client-side bypass. */
export function copyOfficialWebsite() {
  wx.showModal({ title: '九辰官网', content: '小程序内网页入口尚未完成业务域名核验。可以复制官网地址，在浏览器中访问。', confirmText: '复制地址', cancelText: '取消', success: result => {
    if (!result.confirm) return
    wx.setClipboardData({ data: OFFICIAL_WEBSITE, success: () => wx.showToast({ title: '官网地址已复制', icon: 'success' }), fail: () => wx.showToast({ title: '复制失败，请重试', icon: 'none' }) })
  } })
}
