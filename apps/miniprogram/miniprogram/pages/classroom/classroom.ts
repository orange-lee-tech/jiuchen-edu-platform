import { getSavedAuthResult } from '../../utils/auth'
import {getReadOnlyContext,isReadOnly} from '../../utils/read-only-context'
import { INITIAL_SHELL, loginFor, observeSlot, openPage, shellView } from '../../utils/navigation'
import { weeklyScheduleView, courseTimeLabel } from '../../utils/schedule-view'
import { initialPlanView, type PlanNavigationIntent } from '../../utils/plan-navigation-intent'
import { resolveCurrentStage } from '../../utils/current-stage'
import {
  ApiRequestError,
  friendlyRequestError,
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

function stageErrorMessage(error: unknown) {
  if (error instanceof ApiRequestError && (error.code === 'backend_version_mismatch' || ((error.statusCode === 404 || error.statusCode === 405) && error.code !== 'student_profile_not_bound')))
    return '当前服务尚未支持学期校准，请联系管理员更新服务'
  if (error instanceof ApiRequestError && error.statusCode >= 500)
    return '学期服务暂不可用，请联系管理员核查'
  const fallback = error instanceof ApiRequestError
    ? error.statusCode === 404 || error.statusCode === 405
      ? '当前服务尚未支持学期校准，请联系管理员更新服务'
      : error.statusCode === 403 ? '当前身份无权校准学期，请返回本人学员身份'
        : error.statusCode === 409 ? '学期状态有变化，请重新读取档案后再选择'
          : error.statusCode >= 500 ? '学期服务暂不可用，请联系管理员核查'
            : '学期校准未完成，请保留页面并联系客服'
    : '学期校准未完成，请保留页面并联系客服'
  return friendlyRequestError(error, fallback)
}

function logStageFailure(operation: 'load' | 'suggest' | 'save' | 'verify', error: unknown) {
  console.warn('Academic stage request failed.', {
    operation, statusCode: error instanceof ApiRequestError ? error.statusCode : 0,
    code: error instanceof ApiRequestError && /^[a-z][a-z0-9_]{0,79}$/.test(error.code) ? error.code : 'unknown_error',
  })
}

type PlanCard = {
  type: ClassroomPlanType
  title: string
  progress: string
  revisionStatus: 'none' | 'pending' | 'approved'
}

const PLAN_CARDS: Record<ClassroomPlanType, Pick<PlanCard, 'type' | 'title'>> = {
  gpa: { type: 'gpa', title: '课程成绩计划' },
  english: { type: 'english', title: '英语计划' },
  competition: { type: 'competition', title: '竞赛计划' },
  research: { type: 'research', title: '科研计划' },
  internship: { type: 'internship', title: '实习规划' },
  custom: { type: 'custom', title: '自定义规划' },
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
function toPlanCard(plan: ClassroomPlan): PlanCard {
  const template = PLAN_CARDS[plan.type]
  const completed = plan.items.filter((item) => item.status === 'done').length
  return {
    ...template,
    title: plan.title,
    progress: plan.items.length ? `${completed} / ${plan.items.length}` : '',
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
    selectedView: 'stage',
    weekLoading: false, weekError: '', weekState: 'missing', weekLabel: '',
    weekCourses: [] as Array<{ name: string; day: string; slot: string; location: string | null; teacher: string | null }>,
    stages: stageLabels(FALLBACK_STAGES),
    stageScrollTarget: 'semester-freshman-fall', actualStageLabel: '待确认',
    actualStageCode: '', actualStageKnown: false, stageMode: null as 'auto' | 'manual' | null, stageModeKnown: false, stageNotice: '', stageScheduleSafe: false,
    stageChangeBusy: false, stageCalibrationMode: false, stageSaveError: '',
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
  onHide() { this.stopShell?.(); this.viewGeneration += 1; this.setData({ shellPhase: 'loading', stageCalibrationMode: false }) },
  onUnload() { this.stopShell?.() },

  async initializeClassroom() {
    const generation = ++this.viewGeneration
    const auth = getSavedAuthResult()
    const role=getReadOnlyContext()?.role||auth?.user.role
    if (!auth) {
      this.setData({ mode: 'guest', plans: [], mentors: [], records: [], actualStageCode: '', actualStageKnown: false, stageMode: null, stageModeKnown: false })
      return
    }

    if (role === 'teacher' || role === 'staff' || role === 'admin') {
      this.setData({ mode: 'teacher', plans: [], mentors: [], records: [], actualStageCode: '', actualStageKnown: false, stageMode: null, stageModeKnown: false })
      return
    }

    if (role !== 'student') {
      this.setData({ mode: 'unbound', plans: [], mentors: [], records: [], actualStageCode: '', actualStageKnown: false, stageMode: null, stageModeKnown: false })
      return
    }
    const owner=getReadOnlyContext()?.id||auth.user.id
    let navigationIntent: PlanNavigationIntent | undefined
    try {
      navigationIntent = wx.getStorageSync('jiuchen-navigation-intent:plan') as PlanNavigationIntent | undefined
      if (navigationIntent) wx.removeStorageSync('jiuchen-navigation-intent:plan')
    } catch { /* Ignore stale or unavailable navigation state. */ }
    const sameOwner = this.selectedOwner === owner
    this.selectedOwner = owner
    const initialView = initialPlanView(owner, navigationIntent)
    if (initialView === 'week' || !sameOwner) this.setData({ selectedView: initialView })

    this.setData({ mode: 'student', loading: true, loadError: '', studentName: '', actualStageKnown: false, stageModeKnown: false, plans: [], mentors: [], records: [] })
    let stageSuggestionError = ''
    try {
      const [stages, resolution] = await Promise.all([
        getClassroomStages().catch(() => FALLBACK_STAGES),
        isReadOnly() ? Promise.resolve(null) : resolveCurrentStage().catch(error => {
          logStageFailure('suggest', error)
          stageSuggestionError = stageErrorMessage(error)
          return null
        }),
      ])
      if (generation !== this.viewGeneration) return
      const browsingAnotherStage = sameOwner && this.data.currentStageCode !== this.data.actualStageCode
      const initial = await getMyClassroom(browsingAnotherStage ? this.data.currentStageCode : resolution?.stage || undefined)
      if (generation !== this.viewGeneration) return
      const stageChanged = Boolean(resolution && initial.student.currentStage !== resolution.stage)
      const index = Math.max(
        0,
        stages.findIndex((stage) => stage.code === initial.stage.code),
      )
      const stage = stages[index] || initial.stage
      this.setData({
        stages: stageLabels(stages),
        stageScrollTarget: `semester-${stage.code}`,
        actualStageLabel: stages.find(item => item.code === initial.student.currentStage)?.label || '未设置',
        actualStageCode: initial.student.currentStage || '',
        actualStageKnown: true,
        stageMode: resolution?.mode ?? null,
        stageModeKnown: Boolean(resolution),
        stageNotice: isReadOnly() ? '只读查看档案中保存的阶段。' : stageChanged ? '档案阶段已变化，请重新读取后核对。' : resolution?.notice || (resolution ? '' : stageSuggestionError),
        stageScheduleSafe: isReadOnly() || Boolean(resolution?.scheduleSafe && !stageChanged),
        ...emptyStageView(stage, index),
        studentName: initial.student.name,
        plans: initial.plans.map((plan) => toPlanCard(plan)),
        showGuidance: initial.showGuidance,
        guidanceRecordsReady: initial.guidanceRecordsReady,
        mentors: initial.mentors,
        records: initial.records.map((record) => ({
          ...record,
          dateLabel: this.formatRecordDate(record.occurredAt),
        })),
        stageSaveError: '',
      })
      if (this.data.selectedView === 'week') {
        void this.loadCurrentWeek()
        wx.pageScrollTo({ selector: '.current-week-link', duration: 0 })
      }
    } catch (error) {
      if (generation !== this.viewGeneration) return
      logStageFailure('load', error)
      this.setData({ loadError: '规划资料暂时无法加载，请重试。' })
    } finally {
      if (generation === this.viewGeneration) this.setData({ loading: false })
    }
  },

  async hydratePlanData(stageCode: string) {
    const generation = this.viewGeneration
    const result = await getMyClassroom(stageCode)
    if (this.data.currentStageCode !== stageCode || generation !== this.viewGeneration) return
    this.setData({
      studentName: result.student.name,
      plans: result.plans.map((plan) => toPlanCard(plan)),
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
    if (this.data.stageChangeBusy) return
    const code = String(event.currentTarget.dataset.code || '')
    const stages = this.data.stages as ClassroomStage[]
    const index = code ? stages.findIndex(item => item.code === code) : Number(event.currentTarget.dataset.index)
    const stage = stages[index]
    if (!stage) return
    if (this.data.stageCalibrationMode) {
      const expected = this.data.actualStageKnown ? (this.data.actualStageCode || null) : undefined
      const expectedMode = this.data.stageModeKnown ? this.data.stageMode : undefined
      this.setData({ stageScrollTarget: `semester-${stage.code}` })
      void this.saveCurrentStage(stage.code, expected, 'manual', expectedMode)
      return
    }
    this.setData({ ...emptyStageView(stage, index), selectedView: 'stage', stageCalibrationMode: false, stageScrollTarget: `semester-${stage.code}` })
    void this.reloadStage(stage.code)
  },
  onToggleStageCalibration() {
    if (isReadOnly() || this.data.stageChangeBusy) return
    const opening = !this.data.stageCalibrationMode
    this.setData({ stageCalibrationMode: opening })
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
          success: outcome => { if (outcome.confirm && generation === this.viewGeneration && owner === this.selectedOwner) void this.saveCurrentStage(stage.code, result.currentStage, 'auto', result.mode) } })
      }
    } catch (error) {
      if (generation === this.viewGeneration && owner === this.selectedOwner) {
        logStageFailure('suggest', error)
        this.setData({ stageSaveError: stageErrorMessage(error) })
        wx.showToast({ title: this.data.stageSaveError, icon: 'none' })
      }
    }
    finally { this.setData({ stageChangeBusy: false }) }
  },
  onSetViewedStage() {
    if (isReadOnly() || this.data.stageChangeBusy) return
    const code = this.data.currentStageCode, expected = this.data.actualStageKnown ? (this.data.actualStageCode || null) : undefined
    const expectedMode = this.data.stageModeKnown ? this.data.stageMode : undefined
    const generation = this.viewGeneration, owner = this.selectedOwner
    wx.showModal({ title: '设为当前阶段', content: `确认将${this.data.currentStageLabel}设为当前阶段？历史计划和课表会保留。`,
      success: outcome => { if (outcome.confirm && generation === this.viewGeneration && owner === this.selectedOwner) void this.saveCurrentStage(code, expected, 'manual', expectedMode) } })
  },
  onKeepCurrentStage() {
    if (isReadOnly() || this.data.stageChangeBusy || !this.data.actualStageCode) return
    const code = this.data.actualStageCode, mode = this.data.stageModeKnown ? this.data.stageMode : undefined, generation = this.viewGeneration, owner = this.selectedOwner
    wx.showModal({ title: '保持手动阶段', content: '将已保存的阶段设为手动模式，之后可随时修改。',
      success: outcome => { if (outcome.confirm && generation === this.viewGeneration && owner === this.selectedOwner) void this.saveCurrentStage(code, code, 'manual', mode) } })
  },
  async saveCurrentStage(code: string, expected: string | null | undefined, mode: 'auto' | 'manual' = 'manual', expectedMode?: 'auto' | 'manual' | null) {
    if (this.data.stageChangeBusy || isReadOnly()) return
    const generation = this.viewGeneration, owner = this.selectedOwner
    let operation: 'save' | 'verify' = 'save'
    this.setData({ stageChangeBusy: true, stageSaveError: '' })
    try {
      const modeToCheck = expectedMode === undefined ? (this.data.stageModeKnown ? this.data.stageMode : undefined) : expectedMode
      const options = { mode, ...(modeToCheck !== undefined ? { expectedMode: modeToCheck } : {}), ...(mode === 'auto' ? { confirmAuto: true } : {}) }
      const result = await setCurrentClassroomStage(code, expected, options)
      if (generation !== this.viewGeneration || owner !== this.selectedOwner) return
      if (!result.ok || result.currentStage !== code || result.mode !== mode) throw new ApiRequestError(409, 'stage_save_response_invalid')
      operation = 'verify'
      const confirmed = await getCurrentStageSuggestion()
      if (generation !== this.viewGeneration || owner !== this.selectedOwner) return
      if (!confirmed.ok || confirmed.currentStage !== code || confirmed.mode !== mode) throw new ApiRequestError(409, 'current_stage_changed')
      const index = (this.data.stages as ClassroomStage[]).findIndex(item => item.code === confirmed.currentStage)
      if (index < 0) throw new ApiRequestError(409, 'stage_save_response_invalid')
      this.setData({ ...emptyStageView(this.data.stages[index], index), selectedView: 'stage', stageScrollTarget: `semester-${this.data.stages[index].code}`, stageCalibrationMode: false })
      const refreshedGeneration = this.viewGeneration + 1
      await this.initializeClassroom()
      if (owner !== this.selectedOwner || refreshedGeneration !== this.viewGeneration) return
      if (this.data.actualStageKnown && this.data.stageModeKnown && this.data.actualStageCode === code && this.data.stageMode === mode) {
        wx.showToast({ title: '当前阶段已更新', icon: 'success' })
      } else {
        this.setData({ stageSaveError: '学期已保存并核实，但规划页面尚未同步，请重新读取档案' })
      }
    } catch (error) {
      if (generation === this.viewGeneration && owner === this.selectedOwner) {
        logStageFailure(operation, error)
        const reason = stageErrorMessage(error)
        this.setData({ stageSaveError: operation === 'verify' ? `保存请求已受理，暂未核实结果。${reason}` : reason })
        wx.showToast({ title: this.data.stageSaveError, icon: 'none', duration: 3500 })
      }
    }
    finally { this.setData({ stageChangeBusy: false }) }
  },
  onReloadCurrentStage() { if (!this.data.stageChangeBusy) void this.initializeClassroom() },
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
    const selectedView = this.data.selectedView === 'week' ? 'stage' : 'week'
    this.setData({ selectedView })
    if (selectedView === 'week') void this.loadCurrentWeek()
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
