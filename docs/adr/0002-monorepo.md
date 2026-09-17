# ADR-0002：V1 使用单仓库管理，但不引入复杂 Workspace

- 状态：Accepted
- 日期：2026-09-17

## 背景

V1 包含微信小程序、管理后台和 API，它们属于同一产品和同一发布周期。与此同时，微信开发者工具对小程序 npm 构建有自己的工作方式；为了统一依赖而引入额外 workspace 工具，收益有限。

## 决策

V1 保持 `jiuchen-edu-platform` 单仓库：

```text
apps/
  miniprogram/
  admin/
services/
  api/
docs/
```

三个运行单元各自维护 `package.json`，使用普通 npm 安装和运行。

P1 **不建立** pnpm workspace、Nx、Turborepo，也暂不建立 `packages/shared` / `packages/ai`。当真实代码重复或共享 Schema 的收益明确后，再以最小改动抽取共享包。

## 原因

- 微信小程序自身的 npm 构建方式保持最清晰；
- 新成员无需理解额外 monorepo 工具；
- 三个运行单元数量很少，各自安装依赖的成本可接受；
- 避免“为了单仓库而搭一套平台”。

## 何时重新评估

只有在共享类型、Schema 或工具代码出现持续重复，或者构建/发布明显变得繁琐时，再引入 workspace 或共享包。
