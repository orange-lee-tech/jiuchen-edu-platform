Page({
  data: {
    stages: ['大一上', '大一下', '大二上', '大二下', '大三上', '大三下', '大四'],
    currentStage: 0,
    plans: [
      { type: 'GPA', title: '课程成绩计划', progress: '0 / 5', note: '按课程设置目标分数' },
      { type: '英', title: '英语计划', progress: '0 / 3', note: '四六级 / 雅思 / 托福' },
      { type: '赛', title: '竞赛计划', progress: '0 / 2', note: '阶段性竞赛与作品' },
      { type: '研', title: '科研计划', progress: '0 / 2', note: '导师、项目与科研积累' },
    ],
    mentor: {
      name: '导师信息待录入',
      desc: '点击后查看导师介绍与指导安排',
    },
    records: [
      { date: '09-12', title: '辅导记录待后台录入', content: '由九辰工作人员维护本阶段辅导记录。' },
    ],
  },

  onStageChange(event: WechatMiniprogram.BaseEvent) {
    this.setData({ currentStage: Number(event.currentTarget.dataset.index) })
  },

  onPlanTap() {
    wx.showToast({ title: '计划详情页将在 P2 继续完善', icon: 'none' })
  },

  onMentorTap() {
    wx.showToast({ title: '导师介绍页已预留', icon: 'none' })
  },
})
