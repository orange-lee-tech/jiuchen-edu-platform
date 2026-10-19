# 九辰教育平台

微信原生小程序、Fastify API 与 Vue 管理后台的单仓库。线上业务数据以 MySQL 为准；官网与小程序 API 在同一台 ECS 上独立运行。

## 当前发布基线（2026-10-19）

- **正式版本尚未发布。** 用户指定的下一次微信体验版为 `0.0.19`，固定小程序源码 `9da7f9178b737b8ebbc7b17ece1ef3260824f893`。版本号设定不等于已经上传或设为体验版。
- 生产 API 的最后现场回执：`dbd7d9a818523cc3b007afe47a03519510415652`，健康与 News V2 公开读取通过；官网发布指针未变。
- `main` 已整合上述固定前端与现役 API 源码。整合树经本地 API typecheck、222 项测试与 build，小程序 typecheck、106 项回归，管理端 typecheck、2 项测试与 build。历史固定配对自托管 Gate 已通过；GitHub 托管 CI 因 Actions 额度在步骤前失败，不记为代码失败或 CI 绿灯。
- 微信新客服卡片、真实商户充值与次数统计、AI 真实负载、正式审核和发布仍待验。四篇十月稿已公开可读；后续公众号持续自动同步尚有来源缺口。

**最新事实与操作边界只看 [CURRENT.md](docs/handoff/CURRENT.md)。** 该页顶部是现态，下面保留历史回执，旧章节标题中的“待切流”等不代表当前状态。

## 代码入口

| 模块 | 路径 |
| --- | --- |
| 微信小程序 | `apps/miniprogram` |
| 管理后台 | `apps/admin` |
| API | `services/api` |
| 运维与演练 | `ops/ecs`、`tools/release`、`tools/maintenance` |
| 验收与交接 | `tools/testing`、`docs/handoff` |

三个 npm 工程独立安装依赖。API 使用 Node 22；小程序的 `apps/miniprogram` 没有固定 lockfile，安装时用 `npm install --package-lock=false`。本地常用检查：

```sh
cd services/api && npm ci --no-audit --no-fund && npm run typecheck && npm test && npm run build
cd ../../apps/miniprogram && npm install --package-lock=false --no-audit --no-fund && npm run typecheck
cd ../admin && npm install --no-audit --no-fund && npm run typecheck && npm test && npm run build
```

此外从仓库根目录运行 `node --test tools/testing/miniprogram-navigation.test.cjs tools/testing/school-catalog.test.cjs tools/testing/report-export.test.cjs tools/testing/real-data.test.cjs`。

## 发布边界

合并到 `main` 仅表示源码统一，不会部署 ECS、启用支付、改数据库或发布微信正式版。生产变更按 [当前交接](docs/handoff/CURRENT.md) 的固定 SHA、恢复点、审批范围和真机回执执行。凭据和真实学生数据不得进入 Git；工程约束见 [CONSTITUTION.md](CONSTITUTION.md) 与 [AGENTS.md](AGENTS.md)。
