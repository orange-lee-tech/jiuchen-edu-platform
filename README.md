# 九辰教育平台

微信原生小程序、Fastify API 与 Vue 管理后台的单仓库。线上业务数据以 MySQL 为准；官网与小程序 API 在同一台 ECS 上独立运行。

## 当前工程状态（2026-10-27）

- `main` 已合并 PR #9（虚拟支付可靠性、订单核对与未付款订单恢复提示）。PR 合并提交：`8778fde63cfaa74170bfb50090fbac7c623278d9`；PR 源提交：`b6318c748e26c868374a7fdd92c345da8317ed44`。
- PR 头部 CI run [#40489949057](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/40489949057) 通过；合并提交的 main-push CI run [#40491735769](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/40491735769) 通过。检查包含小程序、管理员、API 及一次性 MySQL 8 迁移验证。
- 用户报告两笔安卓微信虚拟支付测试交易：JC000 ¥0.10 / 2 次、JC001 ¥1.90 / 1 次。此处记录为用户提供的验收事实，不代表本次仓库维护重新核对了微信商户账单或生产账本。
- 合并与 CI 不代表 ECS 部署、生产数据库迁移、微信正式发布、支付开关变更或密钥变更。当前生产 API SHA 需要新的 ECS 只读回执确认；不要把历史文档中的旧 SHA 当作当前生产版本。
- 当前唯一状态入口为 [docs/handoff/CURRENT.md](docs/handoff/CURRENT.md)，交接文档导航为 [docs/handoff/README.md](docs/handoff/README.md)，工作流登记为 [docs/automation/registry.yml](docs/automation/registry.yml)。
- 五条固定 SHA 的历史 P1 工作流已从现役工作流目录移除；GitHub 已有运行记录保留。当前保留通用 CI、News V2 MySQL Gate、Profile MySQL Gate。
- UI/UX 方向已批准为蓝金温润版。开始改版前，先完成远端分支与 Windows 本地工作区规整，并确认本地工程同步到最新 `main`。

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
