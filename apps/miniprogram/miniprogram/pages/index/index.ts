import { INITIAL_SHELL, loginFor, observeSlot, openPage, openSlot, shellView } from '../../utils/navigation'
import { openVerifiedWechatCustomerService } from '../../utils/customer-service'
import { getLatestScheduleImport, getMyAcademicProfile } from '../../utils/request'
import { courseTimeLabel, weeklyScheduleView } from '../../utils/schedule-view'

Page({
  data: { ...INITIAL_SHELL, loggedIn: false, assessmentReady: false,
    scheduleLoading: false, scheduleError: '', scheduleLabel: '', scheduleStage: '', scheduleEmptyWeek: false,
    scheduleCourses: [] as Array<{day:string;time:string;name:string;location:string}> },
  homeEpoch: 0,
  currentHomeStudentId: null as string | null,
  stopShell: undefined as (() => void) | undefined,
  onShow() {
    this.stopShell?.()
    const epoch = ++this.homeEpoch
    this.stopShell = observeSlot('home', (state) => {
      const studentId = state.phase === 'ready' && state.auth?.user.role === 'student'
        ? state.auth.user.id : null
      this.currentHomeStudentId = studentId
      this.setData({ ...shellView(state), loggedIn: Boolean(state.auth), assessmentReady: false })
      if (!studentId) return
      this.setData({ scheduleLoading: true, scheduleError: '', scheduleStage: '', scheduleEmptyWeek: false, scheduleCourses: [] })
      void getLatestScheduleImport().then(latest => {
        if (epoch !== this.homeEpoch || studentId !== this.currentHomeStudentId) return
        const view = weeklyScheduleView(latest?.schedule || null)
        const stages: Record<string, string> = { 'freshman-fall':'大一上','freshman-spring':'大一下',
          'sophomore-fall':'大二上','sophomore-spring':'大二下','junior-fall':'大三上',
          'junior-spring':'大三下','senior-fall':'大四上','senior-spring':'大四下' }
        this.setData({ scheduleLoading: false, scheduleStage: stages[latest?.schedule?.stageCode || ''] || '学期待确认',
          scheduleLabel: view.state === 'missing' ? '尚未导入课表' : view.state === 'date' ? '待设置第一周周一' : view.currentWeekLabel,
          scheduleEmptyWeek: view.state === 'empty', scheduleCourses: view.visibleCourses.slice(0, 3).map(course => ({
            day:course.day,time:courseTimeLabel(course),name:course.name,location:course.location || '暂无',
          })) })
      }).catch(() => {
        if (epoch === this.homeEpoch && studentId === this.currentHomeStudentId)
          this.setData({ scheduleLoading: false, scheduleError: '本周课表读取失败，请稍后重试' })
      })
      void getMyAcademicProfile().then(profile => {
        if (epoch !== this.homeEpoch || studentId !== this.currentHomeStudentId ||
          this.data.shellPhase !== 'ready') return
        // A bound student with the minimum required canonical academic identity.
        const ready = Boolean(profile.university?.trim() && profile.major?.trim() && profile.currentGrade?.trim())
        this.setData({ assessmentReady: ready })
      }).catch(() => {
        // Fail closed: never show a completed-profile CTA from a stale client cache.
        if (epoch === this.homeEpoch && studentId === this.currentHomeStudentId)
          this.setData({ assessmentReady: false })
      })
    })
  },
  onHide() { ++this.homeEpoch; this.currentHomeStudentId = null; this.stopShell?.(); this.setData({ shellPhase: 'loading', assessmentReady: false, scheduleCourses: [] }) },
  onUnload() { ++this.homeEpoch; this.stopShell?.() },
  onPrimary() {
    // The daily workflow starts with the plan, not another AI request.
    // Public visitor still enters the planning shell and can bind an account there.
    openSlot('plan')
  },
  onCompleteProfile() {
    if(this.data.loggedIn)openPage('/pages/profile-edit/profile-edit')
    else loginFor('pages/profile-edit/profile-edit')
  },
  onAssessment() { openPage('/pages/position/position') },
  onPlanning() { openSlot('plan') },
  onNews() { openSlot('opportunity') },
  onProducts() { openPage('/pages/products/products') },
  onBrand() { openPage('/pages/brand/brand') },
  onWebsite() { (this.selectComponent('#website-dialog') as { open?: () => void } | null)?.open?.() },
  onCustomerService() { void openVerifiedWechatCustomerService('保研规划咨询') },
})
