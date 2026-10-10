import { INITIAL_SHELL, loginFor, observeSlot, openPage, openSlot, shellView } from '../../utils/navigation'
import { openWechatCustomerService } from '../../utils/customer-service'
import { getMyAcademicProfile } from '../../utils/request'

Page({
  data: { ...INITIAL_SHELL, loggedIn: false, assessmentReady: false },
  homeEpoch: 0,
  stopShell: undefined as (() => void) | undefined,
  onShow() {
    this.stopShell?.()
    const epoch = ++this.homeEpoch
    this.stopShell = observeSlot('home', (state) => {
      const studentId = state.phase === 'ready' && state.auth?.user.role === 'student'
        ? state.auth.user.id : null
      this.setData({ ...shellView(state), loggedIn: Boolean(state.auth), assessmentReady: false })
      if (!studentId) return
      void getMyAcademicProfile().then(profile => {
        if (epoch !== this.homeEpoch || this.data.shellPhase !== 'ready') return
        // A bound student with the minimum required canonical academic identity.
        const ready = Boolean(profile.university?.trim() && profile.major?.trim() && profile.currentGrade?.trim())
        this.setData({ assessmentReady: ready })
      }).catch(() => {
        // Fail closed: never show a completed-profile CTA from a stale client cache.
        if (epoch === this.homeEpoch) this.setData({ assessmentReady: false })
      })
    })
  },
  onHide() { ++this.homeEpoch; this.stopShell?.(); this.setData({ shellPhase: 'loading', assessmentReady: false }) },
  onUnload() { ++this.homeEpoch; this.stopShell?.() },
  onPrimary() {
    if (this.data.assessmentReady) openPage('/pages/position/position')
    else if (this.data.loggedIn) openPage('/pages/profile-edit/profile-edit')
    else loginFor('pages/profile-edit/profile-edit')
  },
  onAssessment() { openPage('/pages/position/position') },
  onPlanning() { openSlot('plan') },
  onNews() { openSlot('opportunity') },
  onProducts() { openPage('/pages/products/products') },
  onBrand() { openPage('/pages/brand/brand') },
  onWebsite() { (this.selectComponent('#website-dialog') as { open?: () => void } | null)?.open?.() },
  onCustomerService() { openWechatCustomerService() },
})
