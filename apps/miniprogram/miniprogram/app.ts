import { runtimeConfig } from './config/runtime'
import { initializeNavigation } from './utils/navigation'
import { refreshAuthResult } from './utils/auth'

App({
  onLaunch() {
    if (!runtimeConfig.cloudEnvId) {
      console.error('CloudBase environment ID is empty; Storage uploads will fail')
      initializeNavigation()
      return
    }

    // Core API traffic can run on ECS while CloudBase remains initialized for
    // platform-native Storage calls such as wx.cloud.uploadFile.
    wx.cloud.init({
      env: runtimeConfig.cloudEnvId,
      traceUser: true,
    })
    initializeNavigation()
  },

  onShow() { void refreshAuthResult() },

  globalData: {
    appName: '九辰保研',
  },
})
