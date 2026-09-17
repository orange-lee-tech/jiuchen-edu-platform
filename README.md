# 九辰教育平台 / Jiuchen Edu Platform

九辰保研微信小程序、AI 保研评估、学员课堂与内部管理后台的一体化平台。

> 当前阶段：**P1 基础骨架**。P0 产品基线、工程约束与基础设施方向已经冻结；当前只搭建最小可运行骨架，不提前堆业务功能。

## V1 产品范围

- **微信小程序**：首页、AI 保研定位、院校与案例信息、学堂、资讯、个人中心。
- **我的课堂**：面向签约学员展示阶段规划、目标与辅导记录。
- **AI 保研评估**：基于学生资料、院校/项目信息和真实案例进行结构化分析。
- **九辰内部管理后台**：第一阶段主要维护学员与“我的课堂”数据。

课程在 V1 中只做展示与在线咨询，不做课程在线购买。在线支付只用于 AI 评估次数/额度充值。

## 核心原则

AIFORCE 原型是 V1 的高权威需求基线：第一版原则上照原型实现；明显问题进入优化清单，未经确认不擅自改变业务流程。

工程目标不是追求技术复杂度，而是：**简单、好用、可靠、方便维护。**

## 已冻结技术方向

- 微信端：**原生微信小程序 + TypeScript + TDesign Miniprogram**
- 管理后台：**Vue 3 + TypeScript + Vite + TDesign Vue Next**
- API：**Node.js + TypeScript + Fastify**，保持一个轻量单体服务
- 数据库：**MySQL**，线上数据库为唯一真实状态源
- ORM / Migration：**Drizzle**
- 基础设施：**腾讯 CloudBase 优先**；API 使用云托管，数据库使用托管 MySQL，文件使用云存储
- AI：服务端统一调用外部模型 API，不自建模型平台
- 环境：本地开发 → CloudBase Test → CloudBase Production

V1 不引入微服务、Kubernetes、Redis、消息队列、向量数据库或无明确收益的跨端框架。

## 仓库结构

```text
apps/
  miniprogram/   # 微信原生小程序
  admin/         # 九辰内部管理后台
services/
  api/           # 单体 API 服务

docs/            # 产品、架构与 ADR
```

当前刻意不建立共享包和复杂 workspace；当真实重复出现后再抽取。

## 工程文档

- [`CONSTITUTION.md`](./CONSTITUTION.md)：工程与产品硬约束
- [`docs/product/v1-baseline.md`](./docs/product/v1-baseline.md)：V1 已确认需求
- [`docs/product/prototype-notes.md`](./docs/product/prototype-notes.md)：原型实现注意事项
- [`docs/product/optimization-backlog.md`](./docs/product/optimization-backlog.md)：不阻塞 V1 的优化候选
- [`docs/architecture/system-overview.md`](./docs/architecture/system-overview.md)：系统总览
- [`docs/architecture/domain-model.md`](./docs/architecture/domain-model.md)：核心领域模型
- [`docs/architecture/data-flow.md`](./docs/architecture/data-flow.md)：数据与 AI 流程
- [`docs/architecture/p1-acceptance.md`](./docs/architecture/p1-acceptance.md)：P1 最小闭环验收标准
- [`docs/adr/`](./docs/adr/)：关键架构决策记录

## 开发阶段

| 阶段 | 目标 |
| --- | --- |
| P0 奠基 | 产品基线、宪法、架构、领域模型与技术边界 |
| **P1 骨架** | 小程序、后台、API、数据库、基础身份链路 |
| P2 原型还原 | 首页、定位、学堂、资讯、我的等主体页面 |
| P3 我的课堂 | 学员时间轴、规划表、导师与辅导记录、后台维护 |
| P4 AI 评估 | 数据检索、Agent、结构化输出、历史记录 |
| P5 评估额度与支付 | 免费额度、充值、流水、微信支付回调与幂等 |
| P6 收尾 | 权限、安全、隐私、异常态、性能、真机和微信审核 |

## 本地开发

三个运行单元保持独立，避免为 monorepo 引入额外工具：

```bash
# 微信小程序
cd apps/miniprogram
npm install
# 然后用微信开发者工具导入 apps/miniprogram

# 管理后台
cd apps/admin
npm install
npm run dev

# API
cd services/api
npm install
npm run dev
```

## 发布原则

小程序前端通过微信开发者工具进行开发、预览、体验版和版本上传；API、MySQL 和管理后台先进入 CloudBase Test，稳定后再建立 Production。早期保持人工发布，不为了自动化而自动化。

## 保密与数据

真实学生隐私数据、微信 AppSecret、支付密钥、AI API Key、数据库凭据等不得提交到 Git。示例与测试数据必须脱敏或使用虚构数据。
