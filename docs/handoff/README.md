# 九辰教育交接文档导航

## 当前状态

- **唯一当前状态：** [CURRENT.md](CURRENT.md)
- **GitHub 工作台规整回执：** [github-workbench-cleanup-2026-10-27.md](github-workbench-cleanup-2026-10-27.md)
- **历史分支清理记录：** [github-branch-prune-2026-10-19.md](github-branch-prune-2026-10-19.md)（历史快照；不得直接照搬其中旧 SHA 或旧分支数量）
- **项目规则：** 根目录 [CONSTITUTION.md](../../CONSTITUTION.md)、[AGENTS.md](../../AGENTS.md)

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

1. 开始任何工作先读 CURRENT.md；它的顶部状态优先于历史章节。
2. 日期化故障、验收和交接文件用于追溯当时事实，不自动代表当前代码、生产 release 或发布状态。
3. CI 通过只证明对应 SHA 的仓库检查通过，不等于生产部署、DDL、真实支付或微信发布完成。
4. 生产状态以最新 ECS 只读回执、生产数据库证据与用户明确授权为准。
5. 保留历史记录，不以清理工作台为由删除 Git 提交历史或未审查的本地资料。
