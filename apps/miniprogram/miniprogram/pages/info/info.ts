Page({
  data: {
    tabs: ['最新', '院校', '项目', '经验'],
    activeTab: 0,
    news: [
      { tag: '招生动态', title: '近期夏令营与预推免信息汇总', source: '九辰资讯 · 更新中' },
      { tag: '院校信息', title: '目标院校项目选择时需要重点关注什么', source: '九辰资讯 · 指南' },
      { tag: '案例参考', title: '公开案例如何用于判断自身准备节奏', source: '来源信息将完整保留' }
    ]
  },
  onTabTap(event: WechatMiniprogram.BaseEvent) {
    this.setData({ activeTab: Number(event.currentTarget.dataset.index) })
  }
})
