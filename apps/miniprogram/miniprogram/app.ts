import { runtimeConfig } from './config/runtime'

App({
  onLaunch() {
    if (runtimeConfig.apiTransport === 'cloud') {
      if (!runtimeConfig.cloudEnvId) {
        console.error('CloudBase transport is enabled but cloudEnvId is empty')
        return
      }

      wx.cloud.init({
        env: runtimeConfig.cloudEnvId,
        traceUser: true,
      })
    }
  },

  globalData: {
    appName: '九辰保研',
  },
})
