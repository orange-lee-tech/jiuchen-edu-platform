import { enableNativeShare, disableNativeShare, friendShare, timelineShare } from '../../utils/native-share'
Page({
  onShareAppMessage() { return friendShare('pages/user-agreement/user-agreement', this) },
  onShareTimeline() { return timelineShare('pages/user-agreement/user-agreement', this) },
  onUnload() { disableNativeShare(this) },
  onHide() { disableNativeShare(this) },
  onShow() { enableNativeShare('pages/user-agreement/user-agreement', this) },
})
