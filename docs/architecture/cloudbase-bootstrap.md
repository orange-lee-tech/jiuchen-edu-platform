# CloudBase Test 环境接入清单

本文件只记录接入步骤与非敏感标识。任何数据库密码、微信 AppSecret、支付密钥、AI API Key 都不得写入仓库。

## 目标

P1 需要先建立一个 **Test** 环境，用来完成：

1. API 云托管部署；
2. MySQL 测试数据库；
3. 微信开发者工具与真机访问；
4. 演示学员从数据库 → API → 后台 / 小程序的最小闭环。

Production 暂不创建。

## 需要由项目所有者提供 / 完成的内容

### 1. 微信小程序 AppID

- AppID 不是密钥，可以写入 `apps/miniprogram/project.config.json`。
- AppSecret 不得通过 Git 或截图公开传播。

### 2. CloudBase Test 环境

在与本小程序对应的腾讯云 / 微信云开发体系中创建一个测试环境，并记录：

- CloudBase 环境 ID（非敏感）；
- 所在地域；
- 是否已开通云托管；
- 是否已开通 MySQL / 关系型数据库能力。

### 3. 数据库连接

数据库连接字符串只放在：

- 本地 `services/api/.env`；或
- CloudBase 云托管的环境变量 `DATABASE_URL`。

不得提交到 GitHub。

### 4. P1 初始化命令

数据库可连接后，在 `services/api` 执行：

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

预期：

- `GET /health` 返回 `database: ok`；
- `GET /students/00000000-0000-4000-8000-000000000001` 返回“演示学员”；
- 管理后台能显示该演示学员；
- 小程序测试页能显示该演示学员。

## 暂不做

- Production 环境；
- 微信支付；
- AI API Key；
- 真实学员数据；
- 自动发布到微信正式版。
