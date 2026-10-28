import { authorizePage } from '../../utils/navigation'
import {isReadOnly} from '../../utils/read-only-context'
import {
  getTeacherStudents,
  getTeacherAiCosts,
  type ClassroomPlanType,
  type TeacherStudent,
  type TeacherAiCosts,
} from '../../utils/request'

function planTypesForStage(stage: string | null): ClassroomPlanType[] {
  if (!stage) return ['gpa', 'english', 'competition', 'research']
  if (stage.startsWith('senior-')) return ['internship']
  if (stage === 'junior-summer') return []
  if (stage.includes('winter') || stage.includes('summer')) return ['english', 'competition']
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
    aiCosts:null as TeacherAiCosts|null,
    aiCostsNotice:'',
  },

  onShow() {
    authorizePage('pages/teacher-students/teacher-students', {}, () => { void this.loadData() })
  },

  async loadData() {
    try {
      this.setData({ loading: true })
      const [students, costResult] = await Promise.all([
        getTeacherStudents(),
        getTeacherAiCosts().then(value=>({value})).catch(()=>({value:null})),
      ])
      this.setData({ students, aiCosts:costResult.value,
        aiCostsNotice:costResult.value?'':'已分配学员的供应商请求摘要暂不可用；请核对成本表与 API 版本。' })
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
    wx.navigateTo({
      url: '/packages/read-only/view/view?kind=student&id=' + encodeURIComponent(student.studentId),
    })
  },
  onEditStudentPlan(event: WechatMiniprogram.BaseEvent) {
    if(isReadOnly())return
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
})
