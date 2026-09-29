import { getSavedAuthResult } from '../../utils/auth'
import {
  getClassroomStages,
  getMyClassroom,
  type ClassroomCoachingRecord,
  type ClassroomMentor,
  type ClassroomPlan,
  type ClassroomPlanType,
  type ClassroomStage,
} from '../../utils/request'

type PlanCard = {
  type: ClassroomPlanType
  badge: string
  title: string
  progress: string
  note: string
  revisionStatus: 'none' | 'pending' | 'approved'
}

const PLAN_CARDS: Record<ClassroomPlanType, Omit<PlanCard, 'revisionStatus'>> = {
  gpa: {
    type: 'gpa',
    badge: 'GPA',
    title: '课程成绩计划',
    progress: '0 / 0',
    note: '按真实课程、课程难度与保研目标设置目标分数',
  },
  english: {
    type: 'english',
    badge: '英',
    title: '英语计划',
    progress: '0 / 0',
    note: '四六级 / 雅思 / 托福等阶段性目标',
  },
  competition: {
    type: 'competition',
    badge: '赛',
    title: '竞赛计划',
    progress: '0 / 0',
    note: '按阶段安排竞赛准备、参赛与成果沉淀',
  },
  research: {
    type: 'research',
    badge: '研',
    title: '科研计划',
    progress: '0 / 0',
    note: '导师、项目、论文与科研能力积累',
  },
  internship: {
    type: 'internship',
    badge: '习',
    title: '实习规划',
    progress: '0 / 0',
    note: '岗位方向、投递准备与实习执行安排',
  },
}

const FALLBACK_STAGES: ClassroomStage[] = [
  { code: 'freshman-fall', label: '大一上', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: ['gpa', 'english', 'competition', 'research'] },
  { code: 'freshman-winter', label: '大一寒假', mode: 'holiday', description: '假期 · 仅英语规划', planTypes: ['english'] },
  { code: 'freshman-spring', label: '大一下', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: ['gpa', 'english', 'competition', 'research'] },
  { code: 'freshman-summer', label: '大一暑假', mode: 'holiday', description: '假期 · 仅英语规划', planTypes: ['english'] },
  { code: 'sophomore-fall', label: '大二上', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: ['gpa', 'english', 'competition', 'research'] },
  { code: 'sophomore-winter', label: '大二寒假', mode: 'holiday', description: '假期 · 仅英语规划', planTypes: ['english'] },
  { code: 'sophomore-spring', label: '大二下', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: ['gpa', 'english', 'competition', 'research'] },
  { code: 'sophomore-summer', label: '大二暑假', mode: 'holiday', description: '假期 · 仅英语规划', planTypes: ['english'] },
  { code: 'junior-fall', label: '大三上', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: ['gpa', 'english', 'competition', 'research'] },
  { code: 'junior-winter', label: '大三寒假', mode: 'holiday', description: '假期 · 仅英语规划', planTypes: ['english'] },
  { code: 'junior-spring', label: '大三下', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: ['gpa', 'english', 'competition', 'research'] },
  { code: 'junior-summer', label: '大三暑假', mode: 'holiday', description: '阶段规划由九辰老师确认', planTypes: [] },
  { code: 'senior-fall', label: '大四上', mode: 'internship', description: '大四阶段 · 实习规划', planTypes: ['internship'] },
  { code: 'senior-winter', label: '大四寒假', mode: 'internship', description: '大四寒假 · 实习规划', planTypes: ['internship'] },
  { code: 'senior-spring', label: '大四下', mode: 'internship', description: '大四阶段 · 实习规划', planTypes: ['internship'] },
]

function emptyStageView(stage: ClassroomStage, index: number) {
  return {
    currentStage: index,
    currentStageCode: stage.code,
    currentStageLabel: stage.label,
    stageDescription: stage.description,
    plans: [] as PlanCard[],
    showGuidance: stage.mode !== 'internship',
    mentors: [] as ClassroomMentor[],
    records: [] as Array<ClassroomCoachingRecord & { dateLabel: string }>,
  }
}

function toPlanCard(plan: ClassroomPlan): PlanCard {
  const template = PLAN_CARDS[plan.type]
  const completed = plan.items.filter((item) => item.status === 'done').length
  return {
    ...template,
    title: plan.title,
    progress: `${completed} / ${plan.items.length}`,
    revisionStatus: plan.revisionStatus || (plan.id ? 'approved' : 'none'),
  }
}

Page({
  data: {
    mode: 'guest' as 'guest' | 'student' | 'teacher',
    loading: false,
    studentName: '',
    stages: FALLBACK_STAGES,
    ...emptyStageView(FALLBACK_STAGES[0], 0),
  },

  onShow() {
    void this.initializeClassroom()
  },

  async initializeClassroom() {
    const auth = getSavedAuthResult()
    if (!auth) {
      this.setData({ mode: 'guest', plans: [], mentors: [], records: [] })
      return
    }

    if (auth.user.role === 'teacher' || auth.user.role === 'staff' || auth.user.role === 'admin') {
      this.setData({ mode: 'teacher', plans: [], mentors: [], records: [] })
      return
    }

    if (auth.user.role !== 'student') {
      this.setData({ mode: 'guest', plans: [], mentors: [], records: [] })
      return
    }

    this.setData({ mode: 'student', loading: true })
    try {
      const [stages, initial] = await Promise.all([
        getClassroomStages().catch(() => FALLBACK_STAGES),
        getMyClassroom(),
      ])
      const index = Math.max(
        0,
        stages.findIndex((stage) => stage.code === initial.stage.code),
      )
      const stage = stages[index] || initial.stage
      this.setData({
        stages,
        ...emptyStageView(stage, index),
        studentName: initial.student.name,
        plans: initial.plans.map(toPlanCard),
        showGuidance: initial.showGuidance,
        mentors: initial.mentors,
        records: initial.records.map((record) => ({
          ...record,
          dateLabel: this.formatRecordDate(record.occurredAt),
        })),
      })
    } catch (error) {
      console.info('Current student classroom unavailable.', error)
      wx.showToast({ title: '课堂资料暂时无法加载', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async hydratePlanData(stageCode: string) {
    const result = await getMyClassroom(stageCode)
    if (this.data.currentStageCode !== stageCode) return

    this.setData({
      studentName: result.student.name,
      plans: result.plans.map(toPlanCard),
      showGuidance: result.showGuidance,
      mentors: result.mentors,
      records: result.records.map((record) => ({
        ...record,
        dateLabel: this.formatRecordDate(record.occurredAt),
      })),
    })
  },

  onStageChange(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const stages = this.data.stages as ClassroomStage[]
    const stage = stages[index]
    if (!stage) return
    this.setData(emptyStageView(stage, index))
    void this.hydratePlanData(stage.code)
  },

  onPlanTap(event: WechatMiniprogram.BaseEvent) {
    const type = String(event.currentTarget.dataset.type || '')
    if (!type) return
    wx.navigateTo({
      url: `/pages/plan-editor/plan-editor?stage=${encodeURIComponent(this.data.currentStageCode)}&type=${encodeURIComponent(type)}`,
    })
  },

  onScheduleImport() {
    wx.navigateTo({ url: '/pages/schedule-import/schedule-import' })
  },

  onTeacherWorkspace() {
    wx.navigateTo({ url: '/pages/teacher-students/teacher-students' })
  },

  onLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  formatRecordDate(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  },

  onMentorTap(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const mentor = this.data.mentors[index] as ClassroomMentor | undefined
    if (!mentor) return
    wx.showModal({
      title: mentor.name,
      content: [mentor.title || '九辰辅导老师', mentor.bio || '老师介绍待完善。'].join('\n\n'),
      showCancel: false,
    })
  },
})
