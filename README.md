# 九辰教育平台

微信原生小程序、Fastify API 与 Vue 管理后台的单仓库。线上业务数据以 MySQL 为准；官网与小程序 API 在同一台 ECS 上独立运行。

## 当前工程状态（2026-10-30）

- `main` 当前 HEAD：`36aea4bab3e9bc1aa1c46403cc05e3b2208df1d4`；PR #10 已合并，包含学期校准与规划截止日期相关 API 变更。
- 用户提供的最新 ECS 回执：生产 API 已部署至 `36aea4bab3e9bc1aa1c46403cc05e3b2208df1d4`，DEPLOY PASS、API SMOKE PASS，健康检查 200；`academic-stage-mode` 和 `plan-item-due-date` 迁移已执行。此处记录用户提供的现场结果，不代表本次文档更新重新连接了 ECS。
- 本地产品候选 `codex/product-closeout-20261030` / `d3dcfe4...` 尚未推送、合并或部署；GitHub 远端不包含该候选。执行新工作前必须检查本地工作区和提交祖先，保护未提交文件、stash 和运维资产。
- 2026-10-30 产品收口需求与 Codex 执行基线：[产品施工基线](docs/handoff/product-workstream-authoritative-brief-2026-10-30.md)。该文件覆盖教师／管理员资料、教师规划工作台、资讯标签、管理员次数补发、AI 服务模型与余额核算、草稿、近期任务和课表折叠。
- 自主手动备份规范与后端工程地图正在 PR #12 中评审：[PR #12](https://github.com/orange-lee-tech/jiuchen-edu-platform/pull/12)。未合并前，相关资料不视为 `main` 已包含。
- 源码合并、CI 通过、ECS 部署、生产 DDL、微信体验版／正式版发布和真机验收是不同状态；必须按固定 SHA 分别记录。
- 当前唯一状态入口为 [docs/handoff/CURRENT.md](docs/handoff/CURRENT.md)，交接文档导航为 [docs/handoff/README.md](docs/handoff/README.md)，工作流登记为 [docs/automation/registry.yml](docs/automation/registry.yml)。

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
