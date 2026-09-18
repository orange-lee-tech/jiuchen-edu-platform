Page({
  data: {
    user: {
      name: '未登录用户',
      meta: '完善资料后生成你的保研档案',
    },
    stats: [
      { value: '0', label: '评估次数' },
      { value: '0', label: '收藏院校' },
      { value: '0', label: '学习任务' },
    ],
    menus: [
      { title: '个人资料', desc: '院校、专业、年级与成绩背景' },
      { title: '我的评估', desc: '查看历史 AI 定位结果' },
      { title: '我的收藏', desc: '收藏的院校、项目与资讯' },
      { title: '评估额度', desc: '查看剩余次数与使用记录' },
      { title: '联系客服', desc: '课程与保研规划咨询' },
    ],
  },

  onMenuTap(event: WechatMiniprogram.BaseEvent) {
    const title = String(event.currentTarget.dataset.title || '')
    wx.showToast({ title: title + '功能已预留', icon: 'none' })
  },
})
