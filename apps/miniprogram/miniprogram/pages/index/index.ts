Page({
  data: {
    quickEntries: [
      { icon: 'AI', title: 'AI 保研定位', desc: '结合背景与目标生成定位建议', tone: 'blue' },
      { icon: '规', title: '规划定位', desc: '按阶段梳理保研准备路线', tone: 'violet' },
      { icon: '校', title: '院校库', desc: '查看院校、项目与夏令营信息', tone: 'cyan' },
      { icon: '讯', title: '资讯库', desc: '聚合保研政策与招生动态', tone: 'orange' },
    ],
    cases: [
      { title: '工科 · 双非背景', result: '录取 985 学硕', tag: '相似案例' },
      { title: '经管 · 英语突出', result: '录取财经强校', tag: '相似案例' },
    ],
    courses: [
      { title: '保研全流程入门', meta: '13 节 · 规划基础', badge: '基础' },
      { title: '夏令营材料准备', meta: '9 节 · 文书方法', badge: '材料' },
      { title: '面试表达训练', meta: '11 节 · 高频问题', badge: '面试' },
    ],
    updates: [
      { school: '示例大学', title: '2027 年推免招生预通知', date: '09-18' },
      { school: '示例学院', title: '优秀大学生夏令营报名提醒', date: '09-17' },
      { school: '示例研究院', title: '预推免材料清单更新', date: '09-16' },
    ],
  },

  onSearchTap() {
    wx.showToast({ title: '搜索将在 P2 后续接入', icon: 'none' })
  },

  onEntryTap(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    if (index === 0) {
      wx.switchTab({ url: '/pages/position/position' })
      return
    }
    wx.showToast({ title: '功能骨架已预留', icon: 'none' })
  },
})
