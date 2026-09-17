# ADR-0002：V1 使用单仓库管理

- 状态：Accepted
- 日期：2026-09-17

## 背景

V1 包含微信小程序、管理后台、API，以及后续共享类型和 AI 适配层。这些部分属于同一产品、同一团队、同一发布周期，且共享业务模型。

## 决策

V1 保持 `jiuchen-edu-platform` 单仓库，不提前拆分多个仓库。

预期结构：

```text
apps/
  miniprogram/
  admin/
services/
  api/
packages/
  shared/
  ai/
docs/
```

具体 package manager 和 workspace 方案在 P1 初始化时冻结。

## 原因

- 产品规模适合单仓库；
- 领域类型和 Schema 可共享；
- 需求、代码和架构文档保持同一版本历史；
- 降低跨仓库版本协调成本。

## 何时重新评估

只有当某个服务形成独立团队、独立发布周期或安全/部署边界时，再考虑拆仓库。
