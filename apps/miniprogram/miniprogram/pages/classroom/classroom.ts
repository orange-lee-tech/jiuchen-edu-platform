type PlanType = 'gpa' | 'english' | 'competition' | 'research' | 'internship'

type StageMode = 'term' | 'holiday' | 'internship'

type StageDefinition = {
  code: string
  label: string
  mode: StageMode
  description: string
  planTypes: PlanType[]
}

type PlanCard = {
  type: PlanType
  badge: string
  title: string
  progress: string
  note: string
}

const PLAN_CARDS: Record<PlanType, PlanCard> = {
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

const TERM_PLANS: PlanType[] = ['gpa', 'english', 'competition', 'research']
const HOLIDAY_PLANS: PlanType[] = ['english', 'competition']
const INTERNSHIP_PLANS: PlanType[] = ['internship']

const STAGES: StageDefinition[] = [
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
  { code: 'senior-fall', label: '大四上', mode: 'internship', description: '大四阶段 · 仅展示实习规划', planTypes: INTERNSHIP_PLANS },
  { code: 'senior-winter', label: '大四寒假', mode: 'internship', description: '大四寒假 · 仅展示实习规划', planTypes: INTERNSHIP_PLANS },
  { code: 'senior-spring', label: '大四下', mode: 'internship', description: '大四阶段 · 仅展示实习规划', planTypes: INTERNSHIP_PLANS },
]

function getStageView(index: number) {
  const stage = STAGES[index] ?? STAGES[0]
  return {
    currentStage: index,
    currentStageCode: stage.code,
    currentStageLabel: stage.label,
    stageDescription: stage.description,
    plans: stage.planTypes.map((type) => PLAN_CARDS[type]),
    showGuidance: stage.mode !== 'internship',
  }
}

Page({
  data: {
    stages: STAGES,
    ...getStageView(0),
    mentor: {
      name: '导师信息待录入',
      desc: '点击后查看导师介绍与指导安排',
    },
    records: [
      { date: '09-12', title: '辅导记录待后台录入', content: '由九辰工作人员维护本阶段辅导记录。' },
    ],
  },

  onStageChange(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || index < 0 || index >= STAGES.length) {
      return
    }

    this.setData(getStageView(index))
  },

  onPlanTap(event: WechatMiniprogram.BaseEvent) {
    const planType = String(event.currentTarget.dataset.type ?? '')
    wx.showToast({
      title: planType === 'internship' ? '实习规划详情页待接入数据' : '计划详情页待接入数据',
      icon: 'none',
    })
  },

  onMentorTap() {
    wx.showToast({ title: '导师介绍页已预留', icon: 'none' })
  },
})
