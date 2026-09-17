# 九辰教育平台 / Jiuchen Edu Platform

九辰保研微信小程序、AI 保研评估、学员课堂与内部管理后台的一体化平台。

> 当前阶段：P0 项目奠基。先冻结产品基线、工程约束与系统边界，再开始业务页面开发。

## 产品范围

V1 由四个核心部分组成：

- **微信小程序**：首页、AI 保研定位、院校与案例信息、学堂、资讯、个人中心。
- **我的课堂**：面向签约学员展示阶段规划、目标与辅导记录。
- **AI 保研评估**：基于学生资料、院校/项目信息和真实案例进行结构化分析。
- **九辰内部管理后台**：由公司员工维护学员课堂数据，并逐步承接其他高频运营数据。

课程在 V1 中只做展示与在线咨询，不做课程在线购买。在线支付仅用于 AI 评估次数/额度充值。

## V1 原型原则

AIFORCE 提供的九辰保研小程序原型是 V1 的高权威需求基线：

1. 第一版原则上按原型实现；
2. 开发过程中可以指出明显缺陷和大幅优化空间；
3. 未经确认，不因开发者个人偏好擅自改变已经明确的业务流程；
4. 优化建议统一进入 `docs/product/optimization-backlog.md`，与 V1 实现范围分离。

## 技术方向

当前冻结的首选方向：

- 微信端：**原生微信小程序 + TypeScript + TDesign Miniprogram**
- 管理后台：**Vue 3 + TypeScript + Vite + TDesign Vue Next**
- API：**Node.js + TypeScript**（轻量单体服务）
- 数据：本地 XLSX/CSV 可作为整理与导入源，**线上数据库是唯一真实状态源**
- AI：由服务端 AI Agent 层统一调用，模型供应商与业务逻辑解耦

V1 不引入微服务、Kubernetes、复杂消息队列或无明确收益的跨端框架。

## 工程文档

- [`CONSTITUTION.md`](./CONSTITUTION.md)：不可随意突破的工程与产品约束
- [`docs/product/v1-baseline.md`](./docs/product/v1-baseline.md)：V1 已确认需求
- [`docs/product/prototype-notes.md`](./docs/product/prototype-notes.md)：原型解读与实现注意事项
- [`docs/product/optimization-backlog.md`](./docs/product/optimization-backlog.md)：不阻塞 V1 的优化候选
- [`docs/architecture/system-overview.md`](./docs/architecture/system-overview.md)：系统总览
- [`docs/architecture/domain-model.md`](./docs/architecture/domain-model.md)：核心领域模型
- [`docs/architecture/data-flow.md`](./docs/architecture/data-flow.md)：数据与 AI 流程
- [`docs/adr/`](./docs/adr/)：关键架构决策记录

## 开发阶段

| 阶段 | 目标 |
| --- | --- |
| P0 奠基 | 产品基线、宪法、架构、领域模型与开发边界 |
| P1 骨架 | 小程序、后台、API、数据库、微信登录基础链路 |
| P2 原型还原 | 首页、定位、学堂、资讯、我的等主体页面 |
| P3 我的课堂 | 学员时间轴、规划表、导师与辅导记录、后台维护 |
| P4 AI 评估 | 数据检索、Agent、结构化输出、历史记录 |
| P5 评估额度与支付 | 免费额度、充值、流水、微信支付回调与幂等 |
| P6 收尾 | 权限、安全、隐私、异常态、性能、真机和微信审核 |

## 发布原则

小程序前端通过微信开发者工具进行开发、预览、体验版和版本上传；API 与数据库部署到独立的测试/生产环境。不会等到“全部做完”才第一次部署后端：基础链路稳定后会尽早建立测试环境，以便真机联调微信登录、合法域名、支付和网络行为。

## 保密与数据

本仓库为商业项目。真实学生隐私数据、微信 AppSecret、支付密钥、AI API Key、数据库凭据等不得提交到 Git。示例与测试数据必须脱敏或使用虚构数据。
