import { INITIAL_SHELL, loginFor, observeSlot, openPage, openSlot, shellView } from '../../utils/navigation'
import { openVerifiedWechatCustomerService } from '../../utils/customer-service'
import { getMyAcademicProfile } from '../../utils/request'

Page({
  data: { ...INITIAL_SHELL, loggedIn: false, assessmentReady: false },
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
  onHide() { ++this.homeEpoch; this.currentHomeStudentId = null; this.stopShell?.(); this.setData({ shellPhase: 'loading', assessmentReady: false }) },
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
