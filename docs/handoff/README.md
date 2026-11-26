# 九辰教育交接文档导航

## 当前状态

- **唯一当前交接（2026-11-26）：** [真实备份迁移演练与 API 发布准备](STATUS-2026-11-26-api-release-preparation.md)。包含真实数据库备份恢复、迁移幂等性、业务数据不变性、当前 PR/CI 与生产 Gate。
- **当前代码候选：** 分支 `codex/ux-consolidation-20261116`；应用代码候选 `01864846a2f0e000555abde27cf50001535491d5`，后续提交为交接文档更新；PR [#16](https://github.com/orange-lee-tech/jiuchen-edu-platform/pull/16) OPEN，尚未合并或部署。
- **生产 API 最后记录：** `cfb0f85c39b44b8a8a2726c26108e465da6f9a45`（2026-11-08 发布回执）。11-26 未重新核验 ECS current，发布前必须现场读取。
- **当前 CI：** 最新 PR CI run [45778331694](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/45778331694) FAILURE：小程序检查及 174 项回归 PASS，管理端 npm install 被取消，API/MySQL 门禁 skipped；应用代码候选 run [45771861494](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/45771861494) 另有 API 367/368、身份解绑测试 1 项失败。最近完整 PASS 是旧 SHA `b2c7ea99` 的 run [45758876276](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/45758876276)。
- **真实备份迁移：** `20261121-050720-63f7e5` 数据库组件在 11-26 完成隔离 personal-workspace 迁移演练，56 表前后不变，迁移双次 PASS，`productionWrites=false`；不代表七组件全部恢复验收。
- **历史状态（2026-11-08）：** [Batch A/B/C 合并与 API 生产发布](STATUS-2026-11-08-batch-abc-release.md)，只用于追溯 11-08 当时生产事实。
- **历史状态（2026-11-01）：** [生产发布与 GitHub 台面收尾](STATUS-2026-11-01-release-and-github.md)，不得作为当前 API SHA。
- **历史工作区审计（2026-11-17）：** [本地工作区整合审计](workspace-consolidation-audit-2026-11-17.md)与[收束记录](workspace-consolidation-closeout-2026-11-17.md)。本地归档、stash、worktree 清理仍须本机证据，GitHub 无法替代。
- **CURRENT.md：** 本文件是短入口；完整状态以本节第一项状态页为准。

## 运维、备份与架构地图

- **[自主手动备份与选择性恢复规范](../ops/manual-backup-and-selective-restore.md)**：管理员 WSL 手动备份、七个加密组件、选择性恢复、隔离 MySQL 演练、三代保留目标与当前覆盖缺口。
- **[小程序后端工程地图与部署架构](../ops/miniprogram-backend-engineering-map.md)**：小程序、ECS API、CloudBase MySQL、AI Provider、微信支付、官网入口、发布回滚和生产保护边界。
- [ECS 资源地图](../ops/ecs-resource-map.md)：ECS 资源盘点与基础设施保护。
- [ECS 运维保护规则](../../ops/ecs/AGENTS.md)：ECS 操作范围、禁止操作和发布门禁。

## 现役业务合同与技术依据

- [虚拟支付可靠性与对账边界（2026-10-27）](virtual-payment-reliability-2026-10-27.md)
- [商业控制盒规则（2026-10-23）](commercial-controls-2026-10-23.md)
- [商业 V2 真机产品合同（2026-10-25）](commercial-v2-real-device-product-contract-2026-10-25.md)
- [商业 V2 生产预检（2026-10-24）](production-preflight-commercial-v2-2026-10-24.md)
- [ECS 资源治理（2026-10-13）](ecs-resource-governance-2026-10-13.md)
- [工作流登记](../automation/registry.yml)

## 阅读规则

1. 开始任何工作先读 `CURRENT.md` 与 `STATUS-2026-11-26-api-release-preparation.md`；11-17 工作区审计只代表当时本地资产状态。
2. `docs/handoff` 共 99 份 Markdown。日期化事故、验收、CI 和专项交接文件按历史快照保留；除非文件明确标注 CURRENT，否则不得把其“当前/尚未/下一步”解释为今天状态。
3. CI 通过只证明对应 SHA 的仓库检查通过，不等于生产部署、DDL、真实支付或微信发布完成。
4. 生产状态以最新 ECS 只读回执、生产数据库证据与用户明确授权为准；当前文档记录的 11-08 active SHA 不是 11-26 实时核验。
5. 保留历史记录，不以清理工作台为由删除 Git 提交历史或未审查的本地资料。
