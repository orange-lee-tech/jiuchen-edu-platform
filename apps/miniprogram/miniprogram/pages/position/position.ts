Page({
  data: {
    profileItems: [
      { label: '当前院校', value: '待完善' },
      { label: '专业方向', value: '待完善' },
      { label: '当前年级', value: '待完善' },
      { label: '目标方向', value: '待完善' }
    ],
    steps: ['填写背景', '选择目标', 'AI 分析', '获得建议']
  },
  onStart() {
    wx.showToast({ title: 'AI 定位将在后续接入真实分析', icon: 'none' })
  }
})
