import { getSchoolById, MOE_985_SOURCE, C9_SOURCE, type School } from '../../data'
Page({
  data: {
    school: null as School | null,
    heroLabel: '',
    cityLabel: '',
    hasIntro: false,
  },
  onLoad(options: Record<string,string|undefined>) {
    const school = getSchoolById(String(options.id || ''))
    if (!school) {
      wx.showModal({ title: '资料未找到', content: '学校可能尚未收录，返回院校库重新查找。', showCancel: false, success: () => wx.navigateBack() })
      return
    }
    wx.setNavigationBarTitle({ title: school.name })
    this.setData({ school, heroLabel: school.name.slice(0,2), cityLabel: school.province === school.city ? school.city : school.province + ' · ' + school.city, hasIntro: Boolean(school.intro) })
  },
  copyUrl(event: WechatMiniprogram.BaseEvent) {
    const key = String(event.currentTarget.dataset.key)
    const school = this.data.school
    const urls: Record<string,string> = {
      website: school?.website || '',
      intro: school?.introSource || '',
      address: school?.addressSource || '',
      moe: MOE_985_SOURCE, c9: C9_SOURCE,
    }
    const url = urls[key]
    if (!url || !/^https:\/\//.test(url)) return
    wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '地址已复制', icon: 'success' }) })
  },
  onCopyAddress() {
    const address = this.data.school?.address
    if (!address) return
    wx.setClipboardData({ data: address, success: () => wx.showToast({ title: '地址已复制', icon: 'success' }) })
  },
})
