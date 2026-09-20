import {
  getClassroomStages,
  getDemoStudentClassroom,
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
}

const PLAN_CARDS: Record<ClassroomPlanType, PlanCard> = {
  gpa: {
    type: 'gpa',
    badge: 'GPA',
    title: '课程成绩计划',
    progress: '0 / 5',
    note: '按真实课程、课程难度与保研目标设置目标分数',
  },
  english: {
    type: 'english',
    badge: '英',
    title: '英语计划',
    progress: '0 / 3',
    note: '四六级 / 雅思 / 托福等阶段性目标',
  },
  competition: {
    type: 'competition',
    badge: '赛',
    title: '竞赛计划',
    progress: '0 / 2',
    note: '按阶段安排竞赛准备、参赛与成果沉淀',
  },
  research: {
    type: 'research',
    badge: '研',
    title: '科研计划',
    progress: '0 / 2',
    note: '导师、项目、论文与科研能力积累',
  },
  internship: {
    type: 'internship',
    badge: '习',
    title: '实习规划',
    progress: '0 / 3',
    note: '岗位方向、投递准备与实习执行安排',
  },
}

const TERM_PLANS: ClassroomPlanType[] = ['gpa', 'english', 'competition', 'research']
const HOLIDAY_PLANS: ClassroomPlanType[] = ['english', 'competition']
const INTERNSHIP_PLANS: ClassroomPlanType[] = ['internship']

const FALLBACK_STAGES: ClassroomStage[] = [
  { code: 'freshman-fall', label: '大一上', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: TERM_PLANS },
  { code: 'freshman-winter', label: '大一寒假', mode: 'holiday', description: '假期 · 仅英语与竞赛规划', planTypes: HOLIDAY_PLANS },
  { code: 'freshman-spring', label: '大一下', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: TERM_PLANS },
  { code: 'freshman-summer', label: '大一暑假', mode: 'holiday', description: '假期 · 仅英语与竞赛规划', planTypes: HOLIDAY_PLANS },
  { code: 'sophomore-fall', label: '大二上', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: TERM_PLANS },
  { code: 'sophomore-winter', label: '大二寒假', mode: 'holiday', description: '假期 · 仅英语与竞赛规划', planTypes: HOLIDAY_PLANS },
  { code: 'sophomore-spring', label: '大二下', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: TERM_PLANS },
  { code: 'sophomore-summer', label: '大二暑假', mode: 'holiday', description: '假期 · 仅英语与竞赛规划', planTypes: HOLIDAY_PLANS },
  { code: 'junior-fall', label: '大三上', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: TERM_PLANS },
  { code: 'junior-winter', label: '大三寒假', mode: 'holiday', description: '假期 · 仅英语与竞赛规划', planTypes: HOLIDAY_PLANS },
  { code: 'junior-spring', label: '大三下', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: TERM_PLANS },
  { code: 'junior-summer', label: '大三暑假', mode: 'holiday', description: '阶段规划待九辰后台配置', planTypes: [] },
  { code: 'senior-fall', label: '大四上', mode: 'internship', description: '大四阶段 · 仅展示实习规划', planTypes: INTERNSHIP_PLANS },
  { code: 'senior-winter', label: '大四寒假', mode: 'internship', description: '大四寒假 · 仅展示实习规划', planTypes: INTERNSHIP_PLANS },
  { code: 'senior-spring', label: '大四下', mode: 'internship', description: '大四阶段 · 仅展示实习规划', planTypes: INTERNSHIP_PLANS },
]

function getStageView(stage: ClassroomStage, index: number) {
  return {
    currentStage: index,
    currentStageCode: stage.code,
    currentStageLabel: stage.label,
    stageDescription: stage.description,
    plans: stage.planTypes.map((type) => PLAN_CARDS[type]),
    showGuidance: stage.mode !== 'internship',
    mentors: [] as ClassroomMentor[],
    records: [] as Array<ClassroomCoachingRecord & { dateLabel: string }>,
  }
}

function toPlanCard(plan: ClassroomPlan): PlanCard {
  const template = PLAN_CARDS[plan.type]
  const completed = plan.items.filter((item) => item.status === 'done').length
  const progress = plan.id ? `${completed} / ${plan.items.length}` : template.progress

  return {
    ...template,
    title: plan.title,
    progress,
  }
}

Page({
  data: {
    stages: FALLBACK_STAGES,
    ...getStageView(FALLBACK_STAGES[0], 0),
    mentors: [] as ClassroomMentor[],
    records: [] as Array<ClassroomCoachingRecord & { dateLabel: string }>,
  },

  onLoad() {
    void this.hydrateStageCatalog()
    void this.hydratePlanData(this.data.currentStageCode)
  },

  async hydrateStageCatalog() {
    try {
      const stages = await getClassroomStages()
      if (stages.length === 0) return

      const currentCode = this.data.currentStageCode
      const resolvedIndex = stages.findIndex((stage) => stage.code === currentCode)
      const index = resolvedIndex >= 0 ? resolvedIndex : 0
      const stage = stages[index]

      this.setData({
        stages,
        ...getStageView(stage, index),
      })
    } catch (error) {
      console.info('Classroom stage catalog unavailable; using local fallback.', error)
    }
  },

  async hydratePlanData(stageCode: string) {
    try {
      const result = await getDemoStudentClassroom(stageCode)

      if (this.data.currentStageCode !== stageCode) {
        return
      }

      this.setData({
        plans: result.plans.map(toPlanCard),
        showGuidance: result.showGuidance,
        mentors: result.mentors,
        records: result.records.map((record) => ({
          ...record,
          dateLabel: this.formatRecordDate(record.occurredAt),
        })),
      })
    } catch (error) {
      console.info('Classroom data unavailable; keeping local placeholder plans.', error)
    }
  },

  onStageChange(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const stages = this.data.stages as ClassroomStage[]

    if (!Number.isInteger(index) || index < 0 || index >= stages.length) {
      return
    }

    const stage = stages[index]
    this.setData(getStageView(stage, index))
    void this.hydratePlanData(stage.code)
  },

  onPlanTap(event: WechatMiniprogram.BaseEvent) {
    const planType = String(event.currentTarget.dataset.type ?? '')
    wx.showToast({
      title: planType === 'internship' ? '实习规划详情页待完善' : '计划详情页待完善',
      icon: 'none',
    })
  },

  formatRecordDate(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${month}-${day}`
  },

  onMentorTap(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const mentors = this.data.mentors as ClassroomMentor[]
    const mentor = mentors[index]

    if (!mentor) return

    wx.showModal({
      title: mentor.name,
      content: [
        mentor.title || '九辰辅导老师',
        mentor.bio || '老师介绍待后台完善。',
        mentor.relationship === 'primary' ? '当前关系：主辅导' : '当前关系：协助',
      ].join('\n\n'),
      showCancel: false,
      confirmText: '知道了',
    })
  },
})
