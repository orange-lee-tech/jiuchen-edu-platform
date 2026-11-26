# Batch 10 微信分享链路代码审计（2026-11-17）

- 首页和品牌页都在 `onShow` 调用 `wx.showShareMenu`，启用好友和朋友圈分享；两页分别实现 `onShareAppMessage` 和 `onShareTimeline`。好友分享路径分别是 `/pages/index/index`、`/pages/brand/brand`，均在 `app.json` 的主包页面清单且对应页面文件存在。
- 两类回调使用的 `/assets/jiuchen-visual-v1/banners/today-campus-hero.png` 在小程序包内存在。朋友圈分享留在当前页面，不指定不存在的跳转路径；已移除无用途的空 `query`。
- 后端 `services/api/src/services/wechat.ts` 实现了 stable access_token 的获取与缓存，供手机号等微信接口使用。检查 `services/api/src` 的服务及路由，未发现微信小程序 URL Link 的官方生成接口调用或对外路由。
- **独立待办：** 如需向微信外部发送 HTTPS URL Link，应单独设计服务端官方生成接口、权限和失效策略，并单独验收。现有小程序页面路径不是 HTTPS URL Link，不应对外冒用。
- 本轮是源码及包内资源审计。微信真机的好友转发、朋友圈入口及接收方打开结果仍待人类开发者在体验版复验；不据此宣称真机通过。
