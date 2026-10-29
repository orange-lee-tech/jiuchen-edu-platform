import { getSavedAuthResult } from '../../utils/auth'
import {getReadOnlyContext,isReadOnly} from '../../utils/read-only-context'
import { INITIAL_SHELL, loginFor, observeSlot, openPage, shellView } from '../../utils/navigation'
import { weeklyScheduleView, courseTimeLabel } from '../../utils/schedule-view'
import { resolveCurrentStage } from '../../utils/current-stage'
import {
  getClassroomStages,
  getLatestScheduleImport,
  getMyClassroom,
  getCurrentStageSuggestion,
  setCurrentClassroomStage,
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
  { code: 'freshman-winter', label: '大一寒假', mode: 'holiday', description: '假期 · 英语、竞赛规划', planTypes: ['english', 'competition'] },
  { code: 'freshman-spring', label: '大一下', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: ['gpa', 'english', 'competition', 'research'] },
  { code: 'freshman-summer', label: '大一暑假', mode: 'holiday', description: '假期 · 英语、竞赛规划', planTypes: ['english', 'competition'] },
  { code: 'sophomore-fall', label: '大二上', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: ['gpa', 'english', 'competition', 'research'] },
  { code: 'sophomore-winter', label: '大二寒假', mode: 'holiday', description: '假期 · 英语、竞赛规划', planTypes: ['english', 'competition'] },
  { code: 'sophomore-spring', label: '大二下', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: ['gpa', 'english', 'competition', 'research'] },
  { code: 'sophomore-summer', label: '大二暑假', mode: 'holiday', description: '假期 · 英语、竞赛规划', planTypes: ['english', 'competition'] },
  { code: 'junior-fall', label: '大三上', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: ['gpa', 'english', 'competition', 'research'] },
  { code: 'junior-winter', label: '大三寒假', mode: 'holiday', description: '假期 · 英语、竞赛规划', planTypes: ['english', 'competition'] },
  { code: 'junior-spring', label: '大三下', mode: 'term', description: '正常学期 · GPA、英语、竞赛、科研', planTypes: ['gpa', 'english', 'competition', 'research'] },
  { code: 'junior-summer', label: '大三暑假', mode: 'holiday', description: '本阶段暂未配置可编辑计划', planTypes: [] },
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
    guidanceRecordsReady: true,
    mentors: [] as ClassroomMentor[],
    records: [] as Array<ClassroomCoachingRecord & { dateLabel: string }>,
  }
}
function stageLabels(stages: ClassroomStage[]) {
  return stages.map(s => ({ ...s, yearLabel: s.label.slice(0, 2), periodLabel: s.label.slice(2) }))
}
function stageGroups(stages: ClassroomStage[]) {
  const years = ['freshman', 'sophomore', 'junior', 'senior']
  return years.map((year, index) => ({ year, label: `大${'一二三四'[index]}`,
    stages: stages.filter(stage => stage.code.startsWith(year + '-')) }))
}

function toPlanCard(plan: ClassroomPlan, scheduleCourseCount = 0): PlanCard {
  const template = PLAN_CARDS[plan.type]
  const completed = plan.items.filter((item) => item.status === 'done').length
  return {
    ...template,
    title: plan.title,
    progress: plan.items.length ? `${completed} / ${plan.items.length}` : '',
    note:
      plan.type === 'gpa' && plan.items.length === 0 && scheduleCourseCount > 0
        ? `已导入 ${scheduleCourseCount} 门课程，点击进入后生成课程成绩计划`
        : template.note,
    revisionStatus: plan.revisionStatus || (plan.id ? 'approved' : 'none'),
  }
}

Page({
  data: {
    ...INITIAL_SHELL,
    mode: 'guest' as 'guest' | 'unbound' | 'student' | 'teacher',
    loading: false,
    loadError: '',
    studentName: '',
    scheduleCourseCount: 0,
    selectedView: 'stage',
    weekLoading: false, weekError: '', weekState: 'missing', weekLabel: '',
    weekCourses: [] as Array<{ name: string; day: string; slot: string; location: string | null; teacher: string | null }>,
    stages: stageLabels(FALLBACK_STAGES),
    stageGroups: stageGroups(FALLBACK_STAGES), stagePickerOpen: false, actualStageLabel: '待确认',
    actualStageCode: '', stageMode: null as 'auto' | 'manual' | null, stageNotice: '', stageScheduleSafe: false,
    stageChangeBusy: false,
    ...emptyStageView(FALLBACK_STAGES[0], 0),
  },

  stopShell: undefined as (() => void) | undefined,
  viewGeneration: 0,
  selectedOwner: '',
  weekRequest: 0,
  onShow() {
    this.stopShell?.()
    this.stopShell = observeSlot('plan', (state) => {
      this.setData(shellView(state))
      if (state.phase === 'ready') void this.initializeClassroom()
      else { this.viewGeneration += 1; this.setData({ plans: [], mentors: [], records: [], studentName: '', actualStageCode: '' }) }
    })
  },
  onHide() { this.stopShell?.(); this.viewGeneration += 1; this.setData({ shellPhase: 'loading' }) },
  onUnload() { this.stopShell?.() },

  async initializeClassroom() {
    const generation = ++this.viewGeneration
    const auth = getSavedAuthResult()
    const role=getReadOnlyContext()?.role||auth?.user.role
    if (!auth) {
      this.setData({ mode: 'guest', plans: [], mentors: [], records: [], actualStageCode: '' })
      return
    }

    if (role === 'teacher' || role === 'staff' || role === 'admin') {
      this.setData({ mode: 'teacher', plans: [], mentors: [], records: [], actualStageCode: '' })
      return
    }

    if (role !== 'student') {
      this.setData({ mode: 'unbound', plans: [], mentors: [], records: [], actualStageCode: '' })
      return
    }
    const owner=getReadOnlyContext()?.id||auth.user.id
    const sameOwner = this.selectedOwner === owner
    this.selectedOwner = owner
    if (!sameOwner) this.setData({ selectedView: 'stage' })

    this.setData({ mode: 'student', loading: true, loadError: '', plans: [], mentors: [], records: [] })
    try {
      const [stages, resolution] = await Promise.all([
        getClassroomStages().catch(() => FALLBACK_STAGES),
        isReadOnly() ? Promise.resolve(null) : resolveCurrentStage().catch(() => null),
      ])
      if (generation !== this.viewGeneration) return
      const browsingAnotherStage = sameOwner && this.data.currentStageCode !== this.data.actualStageCode
      const initial = await getMyClassroom(browsingAnotherStage ? this.data.currentStageCode : resolution?.stage || undefined)
      if (generation !== this.viewGeneration) return
      const stageChanged = Boolean(resolution && initial.student.currentStage !== resolution.stage)
      const matchingTerm = /^(freshman|sophomore|junior|senior)-(fall|spring)$/.test(initial.stage.code)
      const latestSchedule = matchingTerm
        ? await getLatestScheduleImport(initial.stage.code).catch(() => null)
        : null
      if (generation !== this.viewGeneration) return
      const index = Math.max(
        0,
        stages.findIndex((stage) => stage.code === initial.stage.code),
      )
      const stage = stages[index] || initial.stage
      const scheduleCourseCount = latestSchedule?.schedule?.stageCode === initial.stage.code
        ? latestSchedule.schedule.courses.length : 0
      this.setData({
        stages: stageLabels(stages),
        stageGroups: stageGroups(stages),
        actualStageLabel: stages.find(item => item.code === initial.student.currentStage)?.label || '未设置',
        actualStageCode: initial.student.currentStage || '',
        stageMode: resolution?.mode ?? null,
        stageNotice: isReadOnly() ? '只读查看档案中保存的阶段。' : stageChanged ? '档案阶段已变化，请刷新后核对。' : resolution?.notice || (resolution ? '' : '自动定位暂不可用，请核对当前学期。'),
        stageScheduleSafe: isReadOnly() || Boolean(resolution?.scheduleSafe && !stageChanged),
        ...emptyStageView(stage, index),
        studentName: initial.student.name,
        scheduleCourseCount,
        plans: initial.plans.map((plan) => toPlanCard(plan, scheduleCourseCount)),
        showGuidance: initial.showGuidance,
        guidanceRecordsReady: initial.guidanceRecordsReady,
        mentors: initial.mentors,
        records: initial.records.map((record) => ({
          ...record,
          dateLabel: this.formatRecordDate(record.occurredAt),
        })),
      })
      if (this.data.selectedView === 'week') void this.loadCurrentWeek()
    } catch (error) {
      if (generation !== this.viewGeneration) return
      console.info('Current student classroom unavailable.', error)
      this.setData({ loadError: '规划资料暂时无法加载，请重试。' })
    } finally {
      if (generation === this.viewGeneration) this.setData({ loading: false })
    }
  },

  async hydratePlanData(stageCode: string) {
    const generation = this.viewGeneration
    const [result, latestSchedule] = await Promise.all([
      getMyClassroom(stageCode),
      /^(freshman|sophomore|junior|senior)-(fall|spring)$/.test(stageCode)
        ? getLatestScheduleImport(stageCode).catch(() => null) : Promise.resolve(null),
    ])
    if (this.data.currentStageCode !== stageCode || generation !== this.viewGeneration) return
    const scheduleCourseCount = latestSchedule?.schedule?.stageCode === stageCode
      ? latestSchedule.schedule.courses.length : 0
    this.setData({
      studentName: result.student.name,
      scheduleCourseCount,
      plans: result.plans.map((plan) => toPlanCard(plan, scheduleCourseCount)),
      showGuidance: result.showGuidance,
      guidanceRecordsReady: result.guidanceRecordsReady,
      mentors: result.mentors,
      records: result.records.map((record) => ({
        ...record,
        dateLabel: this.formatRecordDate(record.occurredAt),
      })),
    })
  },

  onStageChange(event: WechatMiniprogram.BaseEvent) {
    const code = String(event.currentTarget.dataset.code || '')
    const stages = this.data.stages as ClassroomStage[]
    const index = code ? stages.findIndex(item => item.code === code) : Number(event.currentTarget.dataset.index)
    const stage = stages[index]
    if (!stage) return
    this.setData({ ...emptyStageView(stage, index), selectedView: 'stage', stagePickerOpen: false, scheduleCourseCount: 0 })
    void this.reloadStage(stage.code)
  },
  onToggleStagePicker() { this.setData({ stagePickerOpen: !this.data.stagePickerOpen }) },
  onPlanCategoryTap(event: WechatMiniprogram.BaseEvent) {
    const type = String(event.currentTarget.dataset.type || '')
    if (this.data.plans.some(item => item.type === type)) wx.pageScrollTo({ selector: '#plan-' + type, duration: 200 })
  },
  onAcademicProfile() { if (!isReadOnly()) openPage('/pages/profile-edit/profile-edit') },
  async onReviewCurrentStage() {
    if (isReadOnly() || this.data.stageChangeBusy) return
    const generation = this.viewGeneration, owner = this.selectedOwner
    this.setData({ stageChangeBusy: true })
    try {
      const result = await getCurrentStageSuggestion()
      if (generation !== this.viewGeneration || owner !== this.selectedOwner) return
      const stage = (this.data.stages as ClassroomStage[]).find(item => item.code === result.suggestedStage)
      if (!stage) {
        wx.showModal({ title: '当前阶段待确认', content: '无法根据入学年份确定阶段。请在学期选择器中选择实际阶段，再设为当前。', showCancel: false })
      } else if (stage.code === result.currentStage && result.mode === 'auto') {
        wx.showToast({ title: '当前阶段与建议一致', icon: 'none' })
      } else {
        wx.showModal({ title: '启用自动定位', content: `按普通四年制及入学年份估算为${stage.label}。如有休学或其他学制，请手动选择实际阶段。`, confirmText: '启用自动',
          success: outcome => { if (outcome.confirm && generation === this.viewGeneration && owner === this.selectedOwner) void this.saveCurrentStage(stage.code, result.currentStage, 'auto', result.mode ?? null) } })
      }
    } catch { wx.showToast({ title: '暂无法读取阶段建议，请稍后重试', icon: 'none' }) }
    finally { this.setData({ stageChangeBusy: false }) }
  },
  onSetViewedStage() {
    if (isReadOnly() || this.data.stageChangeBusy) return
    const code = this.data.currentStageCode, expected = this.data.actualStageCode || null
    const generation = this.viewGeneration, owner = this.selectedOwner
    wx.showModal({ title: '设为当前阶段', content: `确认将${this.data.currentStageLabel}设为当前阶段？历史计划和课表会保留。`,
      success: outcome => { if (outcome.confirm && generation === this.viewGeneration && owner === this.selectedOwner) void this.saveCurrentStage(code, expected, 'manual', this.data.stageMode) } })
  },
  onKeepCurrentStage() {
    if (isReadOnly() || this.data.stageChangeBusy || !this.data.actualStageCode) return
    const code = this.data.actualStageCode, mode = this.data.stageMode, generation = this.viewGeneration, owner = this.selectedOwner
    wx.showModal({ title: '保持手动阶段', content: '将已保存的阶段设为手动模式，之后可随时修改。',
      success: outcome => { if (outcome.confirm && generation === this.viewGeneration && owner === this.selectedOwner) void this.saveCurrentStage(code, code, 'manual', mode) } })
  },
  async saveCurrentStage(code: string, expected: string | null, mode: 'auto' | 'manual' = 'manual', expectedMode?: 'auto' | 'manual' | null) {
    if (this.data.stageChangeBusy || isReadOnly()) return
    const generation = this.viewGeneration
    this.setData({ stageChangeBusy: true })
    try {
      const result = await setCurrentClassroomStage(code, expected, { mode, expectedMode: expectedMode === undefined ? this.data.stageMode : expectedMode, ...(mode === 'auto' ? { confirmAuto: true } : {}) })
      if (generation !== this.viewGeneration) return
      const index = (this.data.stages as ClassroomStage[]).findIndex(item => item.code === result.currentStage)
      if (index < 0) throw new Error('unknown_stage')
      this.setData({ ...emptyStageView(this.data.stages[index], index), selectedView: 'stage' })
      await this.initializeClassroom()
      wx.showToast({ title: '当前阶段已更新', icon: 'success' })
    } catch { if (generation === this.viewGeneration) wx.showToast({ title: '阶段未更新，请刷新后重试', icon: 'none' }) }
    finally { this.setData({ stageChangeBusy: false }) }
  },
  async reloadStage(stageCode: string) {
    const generation = this.viewGeneration
    this.setData({ loading: true, loadError: '' })
    try { await this.hydratePlanData(stageCode) }
    catch { if (generation === this.viewGeneration && this.data.currentStageCode === stageCode) this.setData({ loadError: '该阶段暂时无法加载，请重试。' }) }
    finally { if (generation === this.viewGeneration && this.data.currentStageCode === stageCode) this.setData({ loading: false }) }
  },

  onPlanTap(event: WechatMiniprogram.BaseEvent) {
    const type = String(event.currentTarget.dataset.type || '')
    if (!type) return
    wx.navigateTo({
      url: `/pages/plan-editor/plan-editor?stage=${encodeURIComponent(this.data.currentStageCode)}&type=${encodeURIComponent(type)}`,
    })
  },

  onCurrentWeekSchedule() {
    this.setData({ selectedView: 'week', stagePickerOpen: false })
    void this.loadCurrentWeek()
  },
  async loadCurrentWeek() {
    const generation = this.viewGeneration, request = ++this.weekRequest
    this.setData({ weekLoading: true, weekError: '', weekCourses: [] })
    try {
      // The current-week panel follows the student's actual stage, not the viewed stage.
      const stageCode = this.data.actualStageCode
      if (!this.data.stageScheduleSafe) {
        this.setData({ weekState: 'unknown', weekLabel: '当前学期待核对' })
        return
      }
      if (!stageCode) {
        this.setData({ weekState: 'unknown', weekLabel: '档案当前阶段待确认' })
        return
      }
      if (!/^(freshman|sophomore|junior|senior)-(fall|spring)$/.test(stageCode)) {
        this.setData({ weekState: 'holiday', weekLabel: '档案当前阶段没有学期课表' })
        return
      }
      const latest = await getLatestScheduleImport(stageCode)
      if (generation !== this.viewGeneration || request !== this.weekRequest) return
      if (latest?.schedule && latest.schedule.stageCode !== stageCode) {
        this.setData({ weekError: '课表阶段与档案当前阶段不一致，请核对课表' })
        return
      }
      const view = weeklyScheduleView(latest?.schedule || null)
      const ownerStage = (this.data.stages as ClassroomStage[]).find(stage => stage.code === stageCode)
      const weekLabel = ownerStage ? `${ownerStage.label} · ${view.currentWeekLabel}` : view.currentWeekLabel
      this.setData({ weekState: view.state, weekLabel, weekCourses: view.visibleCourses.map(c => ({ ...c, slot: courseTimeLabel(c) })) })
    } catch {
      if (generation === this.viewGeneration && request === this.weekRequest) this.setData({ weekError: '本周课表读取失败，请重试。' })
    } finally { if (generation === this.viewGeneration && request === this.weekRequest) this.setData({ weekLoading: false }) }
  },

  onScheduleImport() {
    if(isReadOnly())return
    wx.navigateTo({ url: '/pages/schedule-import/schedule-import?view=manage' })
  },

  onTeacherWorkspace() {
    openPage('/pages/teacher-students/teacher-students')
  },

  onLogin() {
    loginFor('pages/profile-edit/profile-edit')
  },

  onBindIdentity() {
    openPage('/pages/profile-edit/profile-edit')
  },
  onRetryPlan() {
    if (this.data.studentName) void this.reloadStage(this.data.currentStageCode)
    else void this.initializeClassroom()
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
