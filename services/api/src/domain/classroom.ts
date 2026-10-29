export const PLAN_TYPES = ['gpa', 'english', 'competition', 'research', 'internship'] as const

export type PlanType = (typeof PLAN_TYPES)[number]
export type StageMode = 'term' | 'holiday' | 'internship'

export type StageDefinition = {
  code: string
  label: string
  mode: StageMode
  description: string
  planTypes: PlanType[]
}

const TERM_PLANS: PlanType[] = ['gpa', 'english', 'competition', 'research']
const HOLIDAY_PLANS: PlanType[] = ['english', 'competition']
const INTERNSHIP_PLANS: PlanType[] = ['internship']

export const STAGE_DEFINITIONS: StageDefinition[] = [
  { code: 'freshman-fall', label: '大一上', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: TERM_PLANS },
  { code: 'freshman-winter', label: '大一寒假', mode: 'holiday', description: '假期 · 英语、竞赛规划', planTypes: HOLIDAY_PLANS },
  { code: 'freshman-spring', label: '大一下', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: TERM_PLANS },
  { code: 'freshman-summer', label: '大一暑假', mode: 'holiday', description: '假期 · 英语、竞赛规划', planTypes: HOLIDAY_PLANS },
  { code: 'sophomore-fall', label: '大二上', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: TERM_PLANS },
  { code: 'sophomore-winter', label: '大二寒假', mode: 'holiday', description: '假期 · 英语、竞赛规划', planTypes: HOLIDAY_PLANS },
  { code: 'sophomore-spring', label: '大二下', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: TERM_PLANS },
  { code: 'sophomore-summer', label: '大二暑假', mode: 'holiday', description: '假期 · 英语、竞赛规划', planTypes: HOLIDAY_PLANS },
  { code: 'junior-fall', label: '大三上', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: TERM_PLANS },
  { code: 'junior-winter', label: '大三寒假', mode: 'holiday', description: '假期 · 英语、竞赛规划', planTypes: HOLIDAY_PLANS },
  { code: 'junior-spring', label: '大三下', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: TERM_PLANS },
  { code: 'junior-summer', label: '大三暑假', mode: 'holiday', description: '阶段规划待九辰后台配置', planTypes: [] },
  { code: 'senior-fall', label: '大四上', mode: 'internship', description: '大四阶段 · 仅展示实习规划', planTypes: INTERNSHIP_PLANS },
  { code: 'senior-winter', label: '大四寒假', mode: 'internship', description: '大四寒假 · 仅展示实习规划', planTypes: INTERNSHIP_PLANS },
  { code: 'senior-spring', label: '大四下', mode: 'internship', description: '大四阶段 · 仅展示实习规划', planTypes: INTERNSHIP_PLANS },
]

export const DEFAULT_PLAN_TITLES: Record<PlanType, string> = {
  gpa: '课程成绩计划',
  english: '英语计划',
  competition: '竞赛计划',
  research: '科研计划',
  internship: '实习规划',
}

export function getStageDefinition(code: string | null | undefined): StageDefinition | undefined {
  if (!code) return undefined
  return STAGE_DEFINITIONS.find((stage) => stage.code === code)
}

export function isPlanTypeAllowed(stageCode: string, planType: PlanType): boolean {
  return getStageDefinition(stageCode)?.planTypes.includes(planType) ?? false
}


export function isGuidanceAllowed(stageCode: string): boolean {
  return Boolean(getStageDefinition(stageCode))
}
