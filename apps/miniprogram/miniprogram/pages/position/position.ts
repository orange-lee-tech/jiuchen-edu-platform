Page({
  data: {
    profile: [
      { label: '本科院校', value: '待填写' },
      { label: '专业方向', value: '待填写' },
      { label: '当前年级', value: '待填写' },
      { label: '绩点 / 排名', value: '待填写' },
    ],
    dimensions: [
      { title: '学业基础', desc: '绩点、排名与核心课程', status: '待补充' },
      { title: '英语能力', desc: '四六级、雅思、托福等', status: '待补充' },
      { title: '科研经历', desc: '项目、论文与导师经历', status: '待补充' },
      { title: '竞赛实践', desc: '竞赛、创新创业与作品', status: '待补充' },
    ],
  },

  onStartAssessment() {
    wx.showModal({
      title: 'AI 保研定位',
      content: 'P2 先完成资料录入与结果页骨架，真实 AI 分析将在服务端 Agent 接入后启用。',
      showCancel: false,
    })
  },

  onEditProfile() {
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' })
  },
})
