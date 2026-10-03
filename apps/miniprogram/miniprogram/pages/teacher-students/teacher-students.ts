import {
  approvePlanRevision,
  friendlyRequestError,
  getPendingPlanRevisions,
  getTeacherStudents,
  rejectPlanRevision,
  type ClassroomPlanType,
  type PendingPlanRevision,
  type TeacherStudent,
} from '../../utils/request'

function planTypesForStage(stage: string | null): ClassroomPlanType[] {
  if (!stage) return ['gpa', 'english', 'competition', 'research']
  if (stage.startsWith('senior-')) return ['internship']
  if (stage === 'junior-summer') return []
  if (stage.includes('winter') || stage.includes('summer')) return ['english']
  return ['gpa', 'english', 'competition', 'research']
}

const LABELS: Record<ClassroomPlanType, string> = {
  gpa: '课程成绩',
  english: '英语',
  competition: '竞赛',
  research: '科研',
  internship: '实习',
}

Page({
  data: {
    loading: true,
    students: [] as TeacherStudent[],
    pending: [] as PendingPlanRevision[],
  },

  onShow() {
    void this.loadData()
  },

  async loadData() {
    try {
      this.setData({ loading: true })
      const [students, pending] = await Promise.all([
        getTeacherStudents(),
        getPendingPlanRevisions(),
      ])
      this.setData({ students, pending })
    } catch (error) {
      wx.showToast({ title: '老师工作台加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onStudentTap(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const student = this.data.students[index]
    if (!student) return
    const stage = student.assignedStageCode || student.currentStage || 'freshman-fall'
    const types = planTypesForStage(stage)
    if (types.length === 0) {
      wx.showToast({ title: '该阶段暂未配置计划类型', icon: 'none' })
      return
    }

    wx.showActionSheet({
      itemList: types.map((type) => LABELS[type]),
      success: (result) => {
        const type = types[result.tapIndex]
        if (!type) return
        wx.navigateTo({
          url: `/pages/plan-editor/plan-editor?studentId=${encodeURIComponent(student.studentId)}&studentName=${encodeURIComponent(student.name)}&stage=${encodeURIComponent(stage)}&type=${encodeURIComponent(type)}`,
        })
      },
    })
  },

  onApprove(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    if (!id) return
    wx.showModal({
      title: '通过学员更新？',
      content: '通过后，该版本会写入正式档案并成为默认最新版。',
      success: async (result) => {
        if (!result.confirm) return
        try {
          await approvePlanRevision(id)
          wx.showToast({ title: '已通过', icon: 'success' })
          await this.loadData()
        } catch (error) {
          wx.showToast({
            title: friendlyRequestError(error, '审核失败，请稍后重试'),
            icon: 'none',
            duration: 2600,
          })
        }
      },
    })
  },

  onReject(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    if (!id) return
    wx.showModal({
      title: '否决本次更新',
      editable: true,
      placeholderText: '可填写原因（选填）',
      success: async (result) => {
        if (!result.confirm) return
        try {
          await rejectPlanRevision(id, result.content || null)
          wx.showToast({ title: '已否决并回退正式版', icon: 'none' })
          await this.loadData()
        } catch (error) {
          wx.showToast({
            title: friendlyRequestError(error, '审核失败，请稍后重试'),
            icon: 'none',
            duration: 2600,
          })
        }
      },
    })
  },
})
