import { INITIAL_SHELL, loginFor, observeSlot, openPage, openSlot, shellView } from '../../utils/navigation'
import { openWechatCustomerService } from '../../utils/customer-service'

Page({
  data: { ...INITIAL_SHELL, loggedIn: false },
  stopShell: undefined as (() => void) | undefined,
  onShow() {
    this.stopShell?.()
    this.stopShell = observeSlot('home', (state) => this.setData({ ...shellView(state), loggedIn: Boolean(state.auth) }))
  },
  onHide() { this.stopShell?.(); this.setData({ shellPhase: 'loading' }) },
  onUnload() { this.stopShell?.() },
  onPrimary() {
    if (this.data.loggedIn) openPage('/pages/profile-edit/profile-edit')
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
