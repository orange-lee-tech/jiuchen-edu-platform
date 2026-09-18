Page({
  data: {
    categories: ['推荐', '夏令营', '预推免', '政策', '经验'],
    currentCategory: 0,
    featured: {
      tag: '近期关注',
      title: '推免准备进入信息密集期，如何建立自己的院校追踪表',
      summary: '把报名节点、材料要求与目标梯度放进同一套可追踪流程。',
    },
    articles: [
      { school: '示例大学', title: '2027 年优秀大学生夏令营通知', meta: '招生动态 · 09-18', tag: '夏令营' },
      { school: '示例学院', title: '预推免报名材料与时间安排', meta: '招生动态 · 09-17', tag: '预推免' },
      { school: '九辰整理', title: '从大一到大三：不同阶段最该关注什么', meta: '规划方法 · 09-15', tag: '经验' },
      { school: '九辰整理', title: '如何判断一个项目是否值得重点准备', meta: '定位方法 · 09-13', tag: '经验' },
    ],
  },

  onCategoryTap(event: WechatMiniprogram.BaseEvent) {
    this.setData({ currentCategory: Number(event.currentTarget.dataset.index) })
  },

  onArticleTap() {
    wx.showToast({ title: '资讯详情页将在本阶段接入', icon: 'none' })
  },
})
