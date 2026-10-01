import { runtimeConfig } from './config/runtime'

App({
  onLaunch() {
    if (!runtimeConfig.cloudEnvId) {
      console.error('CloudBase environment ID is empty; Storage uploads will fail')
      return
    }

    // Core API traffic can run on ECS while CloudBase remains initialized for
    // platform-native Storage calls such as wx.cloud.uploadFile.
    wx.cloud.init({
      env: runtimeConfig.cloudEnvId,
      traceUser: true,
    })
  },

  globalData: {
    appName: '九辰保研',
  },
})
