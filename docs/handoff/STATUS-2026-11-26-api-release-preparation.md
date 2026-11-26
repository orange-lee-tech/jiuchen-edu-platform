# 九辰教育交接｜2026-11-26｜真实备份迁移演练与 API 发布准备

> **当前权威状态页。** 本页记录截至 2026-11-26 已取得的 GitHub、CI、备份和迁移演练证据。它是交接与发布准备记录，不是生产部署批准。生产现场状态必须在切流前重新只读核验。

## 0. 一页结论

| 项目 | 当前证据 | 状态 |
|---|---|---|
| 生产 API | 最后有明确发布回执的 SHA：`cfb0f85c39b44b8a8a2726c26108e465da6f9a45`（2026-11-08） | 历史已发布；11-26 未重新 SSH 核实 |
| 当前代码分支 | `codex/ux-consolidation-20261116` | PR #16，OPEN |
| 当前候选 | `01864846a2f0e000555abde27cf50001535491d5` | 未合并、未部署 |
| PR 基线 | `main`：`d179ea8db76b2796f0bb9c929ec2c467fa45c87a` | PR #16 base |
| 生产祖先关系 | 候选相对最后记录生产 SHA `cfb0f85`：40 commits ahead、0 behind | Git 历史关系 PASS；不代表现场 current 未变化 |
| 最新候选 CI | Run [45771861494](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/45771861494) | FAILURE |
| 最新完整绿色 CI | Run [45758876276](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/45758876276)，SHA `b2c7ea99251f8c829f1159d90c09b93ca01dd966` | PASS；不是当前 HEAD |
| 真实备份迁移演练 | 2026-11-21 数据库备份组件，2026-11-26 执行隔离迁移 | PASS |
| ECS staging / promote | 当前候选尚无新鲜现场回执 | PENDING |
| 生产 DDL / API 切流 | 本轮没有执行 | NOT RUN |
| 微信小程序上传 / 提审 / 正式发布 | 本轮没有执行 | NOT RUN |

**当前发布结论：备份迁移演练已取得真实数据 PASS；API 候选仍被最新 CI 阻断，不能进入生产切流。**

## 1. GitHub 与 CI 固定事实

### 1.1 仓库和 PR

- 仓库：`orange-lee-tech/jiuchen-edu-platform`
- 工作分支：`codex/ux-consolidation-20261116`
- PR：[ #16 — 当前用户端统一化与 API 候选](https://github.com/orange-lee-tech/jiuchen-edu-platform/pull/16)
- PR 状态：OPEN，`merged=false`
- 当前 HEAD：`01864846a2f0e000555abde27cf50001535491d5`
- Base：`main`，`d179ea8db76b2796f0bb9c929ec2c467fa45c87a`
- 最后记录生产 API：`cfb0f85c39b44b8a8a2726c26108e465da6f9a45`
- GitHub compare：当前候选相对 `cfb0f85` 领先 40 个提交、落后 0 个提交。当前候选包含该生产提交的历史，不等于已在 ECS 运行。

### 1.2 当前 HEAD 的 CI

Run [45771861494](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/45771861494)，固定 SHA `01864846a2f0e000555abde27cf50001535491d5`：

| 阶段 | 结果 |
|---|---|
| 小程序 TypeScript 检查 | PASS |
| 小程序导航、真实数据及导出回归 | PASS |
| 管理端测试与构建 | PASS |
| API 测试与构建阶段 | FAILURE |
| API 测试数 | 367/368 通过，1 项失败 |
| 失败位置 | `services/api/src/services/identity-roles.test.ts:49` |
| 错误 | `identity_entity_not_owned` |
| 后续 disposable MySQL 迁移门禁 | 未执行到，不能记 PASS |

该失败与身份解绑新增的实体归属校验处于同一测试范围。当前证据只定位到失败测试和错误码；具体测试夹具或业务逻辑根因仍须修复后重新验证，不把推断写成结论。

最近一次完整 CI PASS 是 SHA `b2c7ea99251f8c829f1159d90c09b93ca01dd966` 的 run [45758876276](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/45758876276)。该次完整执行了 due-date、personal-workspace、teacher todos、AI balance、commercial、control-box、object migration、virtual-payment 等 disposable MySQL 8 门禁。它只证明该 SHA，不覆盖之后的身份校验和计划来源修复。

### 1.3 代码变更中的两个重要保护点

1. 身份解绑：事务内锁定并校验 identity 与 student/teacher 实体的 `user_id` 归属；不匹配时回滚，禁止复制他人正式规划或解除他人关联。
2. 今日任务跳转：从任务卡把准确的 `planId` 传到编辑页，编辑器按来源 ID 加载与保存，避免同阶段同类型的个人规划和正式学员规划混写。

以上代码尚未合并或部署。小程序导航回归已通过当前 HEAD 的 CI；API 身份测试仍有一项失败。

## 2. 真实备份与迁移演练证据

### 2.1 本轮实际使用的备份

- WSL 备份目录：`/home/orangelee-tech/jiuchen-backups/20261121-050720-63f7e5`
- 备份预检回执：`receiptVerified=true`、`sha256Verified=true`、`pinned=true`、`partial=false`
- 预检结果：`PASS`
- 数据库加密组件：`database.jcb`
- `database.jcb` SHA-256：`2d3971e0a95cacc924f552d84209b9129783994d2c4bc056cbfc52e4c8a18f68`

**范围边界：** 本轮真实迁移演练实际解密、恢复和核验的是数据库组件。该证据不替代七个备份组件的逐项恢复验收，也不据此宣称本代备份的所有网站、API、运行时、文件、密钥和入口资产均已完成恢复演练。

### 2.2 固定迁移源与脚本

| 项目 | 固定值 |
|---|---|
| 迁移源代码提交 | `d93ba079b75f6b48697497668035acf5f223c597` |
| 迁移文件 | `services/api/src/db/upgrade-personal-workspace.ts` |
| 迁移文件 SHA-256 | `4741148f3632107a86c2e2ee37264398cf824266f9fb85be483310408274a647` |
| 本地一次性演练脚本 SHA-256 | `66ce1dd9f5d6dccf42e307e06f6006004de3052d84f18008d7df502d547d1d3a` |
| 迁移命令 | `npm run db:upgrade:personal-workspace`，连续执行两次 |
| 验证命令 | `npm run db:verify:personal-workspace` |

经 GitHub 文件 Blob 核对，当前候选 `01864846` 中的 `upgrade-personal-workspace.ts`、`upgrade-plan-item-due-date.ts` 和 API package scripts 与上述迁移源提交 `d93ba079` 相同。注意：本次真实备份演练执行的是 personal-workspace migration；due-date migration 的证据来自独立 CI disposable MySQL gate，不是本次真实备份演练。

### 2.3 隔离环境与执行结果

| 检查项 | 实际结果 |
|---|---|
| 备份解密 | PASS |
| 真实备份导入 | PASS |
| 数据库引擎 | MySQL 8 |
| 容器网络 | `--network none` |
| TCP 端口映射 | 0 |
| 内存限制 | 768 MiB |
| CPU 限制 | 1 CPU |
| PID 限制 | 256 |
| 事件调度 | OFF |
| 迁移第一次执行 | PASS |
| 迁移第二次执行 | PASS |
| 幂等性 | `idempotent=true` |
| 迁移前表数 | 56 |
| 迁移后表数 | 56 |
| 生产写入 | `productionWrites=false` |
| 临时容器清理 | `containerRemoved=true` |
| 临时文件清理 | `temporaryFilesRemoved=true` |

八张关键业务表的行数及内容摘要在迁移前后均保持一致：

| 表 | 行数 |
|---|---:|
| `users` | 14 |
| `students` | 14 |
| `user_profiles` | 7 |
| `student_plans` | 7 |
| `plan_items` | 9 |
| `schedule_imports` | 14 |
| `plan_revisions` | 1 |
| `growth_records` | 0 |

验收结论：`REAL_BACKUP_MIGRATION_AUDIT=PASS`。该结论证明指定真实数据库备份在隔离环境中的解密、恢复、personal-workspace 迁移重复执行和关键业务记录不变性；不代表生产 DDL 已执行或业务真机验收通过。

### 2.4 与旧备份演练的区别

- `20261108-055750-dac461`：11 月 8 日旧备份，曾完成 56 表 SQL 导入和物理表检查；不包含本次 11 月 26 日的逐表业务行数/摘要核验与 personal-workspace 迁移重复执行证据。
- `20261121-050720-63f7e5`：本次真实备份迁移演练使用的新一代数据库备份组件。两代备份不可混为同一份演练证据。

## 3. 当前 API 发布链路与脚本约束

### 3.1 现有打包器

`tools/release/package-isolated-api.mjs`：

- 固定校验候选 SHA、工作树 clean 状态和生产祖先关系；
- 归档 `services/api` 及必要测试生成器/学校数据；
- 排除 `.env`、密钥证书、私有案例、`node_modules` 和 `dist`；
- 生成 manifest 与归档 SHA-256；
- 输出状态为 `REVIEW_ARTIFACT_ONLY_NOT_PRODUCTION_APPROVED`。

**需更新的基线约束：** 当前脚本内的 `production` 常量仍是 `8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`；最后记录的生产发布 SHA 已是 `cfb0f85c39b44b8a8a2726c26108e465da6f9a45`。正式打包前应先读取 ECS 实际 `current`，再把打包器祖先校验基线与现场确认的生产 SHA 对齐，不能只依赖旧常量。

### 3.2 现有 staging 脚本

`ops/ecs/verify-isolated-staging-readonly.sh` 仍固定：

- 候选 SHA：`1b8ae8b3c5a1285b84ab6b5f573ca9db5d93d0a7`
- 归档 SHA-256：`98279923d783889caa87deb815d3828d53266a84a7be081714188a71f1fc1fb8`
- 生产祖先：`8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`

该脚本是 10 月旧候选专用脚本，**禁止原样用于当前候选 `01864846`**。必须先生成/核验新候选专属归档、manifest、哈希及 staging 脚本，再执行。

### 3.3 生产 promote 机制

现有 `ops/ecs/jiuchen-promote` 使用：

- `/opt/jiuchen-api/staging/READY`
- `/etc/jiuchen-api/approved-release`
- `/opt/jiuchen-api/releases/<SHA>`
- root:root 所有权与权限检查
- `jiuchen-api` 服务用户读取/执行检查
- `/health/live` 与 readiness 检查
- 失败自动切回旧 `current`

不得手动改 `current`，不得绕过 READY、approved-release、发布锁和健康回滚机制。

## 4. 生产发布前必须完成的 Gate

1. 修复当前 HEAD 的 API 身份解绑失败测试；以新的固定 SHA 运行完整 CI。
2. 读取 ECS 真实 `current`、`previous`、approved-release、服务 active 状态、健康端点、资源限制和实际数据库连接/结构；当前没有 11 月 26 日现场回执。
3. 根据 ECS 实际 active SHA 更新打包器祖先约束；生成当前候选专属 archive、manifest、SHA-256。
4. 生成并执行候选专属 ECS staging 只读验证，确认 Node 22、服务用户权限、256 MiB / 50% CPU / 64 Tasks 限制和无数据库 smoke。无数据库 smoke 不代表真实 DB/AI 负载通过。
5. 对候选所有生产迁移建立精确清单。personal-workspace 已有真实备份隔离演练；due-date 有 CI disposable MySQL 证据。生产前仍需核对生产 schema 差异、迁移顺序和回滚/兼容策略。
6. 生产 DDL 必须单独取得明确批准；真实备份 PASS 不自动授权生产写入。
7. 切流前确认上一版本不可变 release 与回滚目标存在，READY 与 approved-release 完全一致；只使用 `jiuchen-promote`。
8. 切流后核验 active SHA、服务状态、live/ready、数据库状态和关键 API 读写；保留实际输出。
9. 微信开发者工具编译、上传、体验版指定、真机验收、提审和正式发布分别登记；GitHub 合并或 ECS 切流不能替代微信发布回执。

## 5. 文档审计结论

截至本轮审计，仓库有 169 份 Markdown，其中 `docs/handoff` 目录 98 份。

- `CURRENT.md`、`README.md` 是当前入口，必须指向本页。
- 2026-11-08 生产发布状态页和 2026-11-01 状态页保留历史事实，不再作为当前状态。
- 2026-11-17 工作区审计是当时本地资产快照；GitHub 无法证明本机归档、stash、worktree 清理是否已执行。
- 2026-11-07 Batch A/B/C 文档是当时交付快照；Batch A 文件已实际存在于仓库，PR #14 后续已合并；Batch C 文档是业务合同，不代表所有生产事实均已迁移。
- 2026-10-30 `product-closeout-scope-audit` 仍是未完成草稿，不能作为完整审计报告。
- 2026-10-13 ECS 资源地图中的 CPU、内存、磁盘、监听和 timer 数值均是旧快照；本页不把它们改写成实时数据。
- 0.0.19 仍是版本登记中最后一条微信小程序体验候选记录；当前 PR #16 未上传微信，不能登记为新体验版或正式版。

### 文档维护规则

日期化事故、验收、分支清理和专项交接保留原始时点事实，不为追求“全部同一天”而重写历史。凡带有“当前”“最新”“尚未”等操作性措辞的文档，应在顶部标注快照日期并链接本页；新状态只写入 CURRENT、README 和新状态页。运维规范中的真实命令/安全边界保留，实际执行结果追加证据章节。

## 6. 下一步唯一工作顺序

**先修 CI → 再核 ECS → 固定候选归档 → staging → 迁移审批 → promote → 生产验收 → 微信体验验收。**

当前阻断为 API 测试 1 项失败。没有生产写入、没有切流、没有微信上传。