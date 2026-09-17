# ADR-0007：Test/Production 小程序通过 `wx.cloud.callContainer` 调用 API

- 状态：Accepted
- 日期：2026-09-17

## 背景

V1 只面向微信小程序，API 计划部署在与小程序关联的 CloudBase 云托管环境。微信官方/CloudBase 原生提供 `wx.cloud.callContainer` 访问云托管服务。

## 决策

- 本地开发允许继续使用 `http://127.0.0.1:3000` 访问 API；
- Test / Production 真机环境优先使用 `wx.cloud.callContainer`；
- 不为小程序单独维护传统 request 合法域名作为首选链路；
- 管理后台仍通过标准 HTTPS 访问同一个 API。

## 原因

- 小程序与 CloudBase 环境天然关联；
- 不需要额外配置小程序服务器域名；
- 减少公网链路与额外运维；
- 保持 API 本身为普通 HTTP 服务，不把业务逻辑绑定到前端调用方式。

## 约束

调用方式切换只能发生在请求适配层。业务页面不得直接散落 `wx.cloud.callContainer` 调用，以便本地开发、Test 与未来迁移仍可替换传输方式。
