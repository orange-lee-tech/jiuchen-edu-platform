Page({
  data: {
    quickActions: [
      { key: 'ai', title: 'AI 保研定位', desc: '结合背景与目标院校生成定位建议' },
      { key: 'plan', title: '规划定位', desc: '按年级拆解 GPA、英语、竞赛与科研' },
      { key: 'school', title: '院校库', desc: '快速了解目标院校与项目' },
      { key: 'info', title: '资讯库', desc: '查看夏令营、预推免与招生动态' }
    ],
    courses: [
      { title: '保研全流程入门', meta: '基础课 · 12 节' },
      { title: '科研能力提升', meta: '进阶课 · 9 节' },
      { title: '英语与材料准备', meta: '冲刺课 · 8 节' }
    ],
    updates: [
      '近期院校招生与夏令营信息持续更新',
      '个人规划建议将结合当前年级动态调整',
      'AI 定位模块进入 P2 交互开发阶段'
    ]
  },

  onQuickTap(event: WechatMiniprogram.BaseEvent) {
    const key = event.currentTarget.dataset.key
    if (key === 'ai' || key === 'plan') {
      wx.switchTab({ url: '/pages/position/position' })
      return
    }
    wx.switchTab({ url: '/pages/info/info' })
  },

  onSearchTap() {
    wx.showToast({ title: '搜索将在下一迭代接入', icon: 'none' })
  }
})
