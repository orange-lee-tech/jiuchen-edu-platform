# CloudBase Test 环境接入清单

本文件只记录接入步骤与非敏感标识。任何数据库密码、微信 AppSecret、支付密钥、AI API Key 都不得写入仓库。

## 目标

P1 需要先建立一个 **Test** 环境，用来完成：

1. API 云托管部署；
2. MySQL 测试数据库；
3. 微信开发者工具与真机访问；
4. 演示学员从数据库 → API → 后台 / 小程序的最小闭环；
5. CloudBase 自动注入的微信 OpenID → 业务用户映射。

Production 暂不创建。

## 当前 Test 环境

- 小程序 AppID：`wxe0f480606408ae2e`
- CloudBase 环境名称：`cloud1`
- CloudBase 环境 ID：`cloud1-d3geim00r03edb212`
- 云托管服务：`jiuchen-api`
- 当前云托管版本：`001`，状态正常
- MySQL：已开通；Test Schema 已通过 Drizzle `db:push` 建立，演示学员 Seed 已写入

这些均为非敏感标识。数据库账号、密码和连接字符串不得写入仓库。

## 推荐创建方式

这是纯微信小程序项目，Test 环境优先从 **微信开发者工具 → 云开发** 创建。这样环境会自动与当前小程序关联，后续小程序可直接使用 `wx.cloud.callContainer` 访问云托管 API，无需额外维护 request 合法域名。

## 当前代码已经准备好的内容

- `services/api/Dockerfile`：用于部署 API 容器；
- `GET /health`：检查 API 与数据库状态；
- Drizzle Schema 与演示学员 Seed；
- `GET /students/:id`：读取测试学员；
- `POST /auth/wechat/bootstrap`：优先读取 CloudBase 自动注入的 `x-wx-openid` 并映射为业务用户；
- 本地 HTTP 调试时保留 `wx.login` + `jscode2session` 兜底；
- 小程序请求适配层支持本地 HTTP / Test 云托管两种传输；
- 管理后台 API 健康检查与演示学员读取页面。

## 数据库连接

CloudBase MySQL 采用直连方式供 `jiuchen-api` 使用：

1. 在 CloudBase「SQL 型数据库 → 数据库设置」开启直连服务；
2. 为应用创建专用数据库账号；
3. 云托管使用内网连接地址；
4. 连接字符串只配置到 CloudBase 云托管环境变量 `DATABASE_URL`；
5. 如本地需要执行 Migration，可临时开启外网连接，并仅将外网连接串写入本地 `services/api/.env`；调试结束后关闭外网连接。

标准格式：

```text
mysql://<username>:<password>@<host>:<port>/<database>
```

不得提交到 GitHub。

## 微信身份

Test / Production 小程序通过 `wx.cloud.callContainer` 访问云托管时，平台会自动向后端注入可信的微信用户 Header（如 `x-wx-openid`）。因此主链路不需要把 AppSecret 交给小程序，也不需要自行在前端维护 Token。

`WECHAT_APP_ID` / `WECHAT_APP_SECRET` 仅作为本地 HTTP 调试 `jscode2session` 的可选兜底，不是 CloudBase Test 环境的必需配置。

## P1 初始化命令

数据库可连接后，Test 环境首次初始化在 `services/api` 执行：

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

`db:push` 仅用于空的开发 / Test 数据库快速落 Schema。后续正式 Schema 演进仍需生成并提交 Migration，不能把 `push` 当作 Production 迁移策略。

预期：

- `GET /health` 返回 `database: ok`；如果数据库可连但核心表缺失，返回 `database: schema_missing`；
- `GET /students/00000000-0000-4000-8000-000000000001` 返回“演示学员”；
- 管理后台能显示该演示学员；
- 小程序测试页能显示该演示学员；
- 小程序通过 `callContainer` 调用身份初始化接口后，服务端能够把自动注入的 OpenID 映射为业务用户。

## 当前已验证

- 本机 → CloudBase MySQL 外网直连：通过；
- `users` / `students` / `student_plans` / `plan_items` 四张核心表：已创建；
- 演示学员 Seed：已写入；
- 本地 Fastify `GET /health`：`database: ok`；
- 本地 `GET /students/00000000-0000-4000-8000-000000000001`：成功返回“演示学员”。

当前剩余 P1 闭环：将内网 `DATABASE_URL` 配置到云托管新版本，验证云端 `/health`、小程序 `callContainer` 和 OpenID 映射，然后关闭数据库外网直连。

## 暂不做

- Production 环境；
- 微信支付；
- AI API Key；
- 真实学员数据；
- 自动发布到微信正式版。
