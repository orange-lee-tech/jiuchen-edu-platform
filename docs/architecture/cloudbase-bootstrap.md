# CloudBase Test 环境接入清单

本文件只记录 CloudBase Test 的现状与历史验证结果。任何数据库密码、微信 AppSecret、支付密钥、AI API Key 都不得写入仓库。

> 2026-09-20 起，CloudBase 不再被视为 Production 唯一目标。Production 方向见 Proposed ADR-0008。

## 1. 当前 Test 环境

- 小程序 AppID：`wxe0f480606408ae2e`
- CloudBase 环境名称：`cloud1`
- CloudBase 环境 ID：`cloud1-d3geim00r03edb212`
- 云托管服务：`jiuchen-api`
- MySQL：已开通，当前主要通过本地 API + Test MySQL 进行开发联调

这些均为非敏感标识。数据库账号、密码和连接字符串不得写入仓库。

## 2. 已验证能力

已验证：
- 本机 Fastify → Test MySQL：可连接；
- `GET /health` 可返回数据库状态；
- 演示学员数据库链路可工作；
- 小程序 → CloudBase 云托管 API：可访问；
- CloudBase 运行时环境变量注入：可用；
- 小程序请求层可在本地 HTTP 与 CloudBase 之间切换。

另已完成：
- Auth Foundation Schema；
- Identity V2 Schema；
- 测试 Student / Teacher / Admin 内部ID Seed。

## 3. 已知限制

CloudBase 免费体验云托管 → MySQL 的链路曾持续返回数据库连接错误，而同一个 MySQL 从本地可正常访问。

因此当前判断：
- 该问题属于 Test 基础设施/网络能力限制；
- 不再为免费 CloudBase 套餐持续堆叠 workaround；
- 不阻塞 P2/P3 产品开发；
- 需要真机验证时仍可使用 CloudBase API 或本地调试链路；
- Production 不以该免费网络模型为基础。

## 4. 当前请求传输策略

请求适配层必须保持三种传输可替换：

```text
local:
wx.request -> http://127.0.0.1:3000

CloudBase Test:
wx.cloud.callContainer -> jiuchen-api

Production（Proposed）:
wx.request -> HTTPS API domain -> Alibaba Cloud jiuchen-api
```

页面业务代码不得直接绑定某一种传输方式。

## 5. 数据库初始化与演进

早期空 Test 数据库曾使用 `db:push` 快速建立 Schema。

当前已进入受控演进阶段：
- 不再把 `db:push` 作为正常升级策略；
- 现有临时升级脚本必须幂等、可审阅、可重复执行；
- Production 前要收敛为正式 Migration；
- 真实学员数据不得进入 Git。

目前使用过：
- `db:upgrade:auth`
- `db:upgrade:identity-v2`
- `db:upgrade:native-auth`（为微信手机号快速验证增加可选手机号身份字段）
- `db:upgrade:assessment`（为 AI Assessment Draft/History/Run 增加独立表）
- `db:seed:test-internal-ids`

## 6. 微信身份

CloudBase Test 可以利用平台注入的可信微信 Header。

本地/未来普通 HTTPS API 则使用：
```text
wx.login code
  -> 服务端 jscode2session
  -> User
  -> UserSession
  -> Bearer session
```

因此业务身份与会话不能依赖 CloudBase 专属 Header。

## 7. Production 迁移关系

当前 Production 方向：
- 公司官网继续维持现有静态部署；
- 小程序 API 作为独立容器/系统服务部署到公司阿里云主机；
- 使用独立 API 域名；
- 服务号同步从固定公网出口 IP 发起；
- 官网与 API 独立目录、配置、日志、发布、回滚。

详细方案见：
- `docs/adr/0008-alibaba-shared-host-isolation.md`
- `docs/architecture/construction-map.md`

在服务器规格、Docker/Nginx Proxy Manager 实际状态、Production MySQL 方案确认之前，不执行迁移。
