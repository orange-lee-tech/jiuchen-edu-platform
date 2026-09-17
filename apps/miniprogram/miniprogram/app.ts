import { runtimeConfig } from './config/runtime'

App({
  onLaunch() {
    if (runtimeConfig.apiTransport === 'cloud') {
      wx.cloud.init({
        env: runtimeConfig.cloudEnvId,
      })
    }
  },

  globalData: {
    appName: '九辰保研',
  },
})
