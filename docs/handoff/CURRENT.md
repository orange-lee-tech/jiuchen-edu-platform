# CURRENT — 九辰保研小程序唯一活跃交接入口

**更新：2026-10-09 · Gate 0 规范纠偏完成；Phase 1a 等待 Codex 代码施工。** 本文件管理当前任务与验收状态；历史日期交接仅记录当时事实，不覆盖本文件。

## 权威读取顺序

1. `CONSTITUTION.md` + `AGENTS.md`：架构、安全和协作红线。
2. `docs/product/v1-baseline.md` + `docs/design/jiuchen-v1-experience-blueprint.md`：已批准产品和体验规则。
3. **本 CURRENT**：实际生产状态、开放 Gate、执行优先级。
4. **`docs/handoff/phase1-codex-execution-2026-10-09.md`**：Phase 1a Codex 唯一有效的开工边界及验收清单。
5. `docs/design/jiuchen-v1-design-system.md`、`docs/handoff/experience-blueprint-phase0-map-2026-10-04.md`：设计系统与历史导航地图；施工前必须按最新代码局部校正。

2026-09-22 旧施工地图、2026-10-04 “仅 Phase 0”旧指令、2026-10-06 过期主控和早期测试 TODO，不得覆盖上述新事实；出现不一致必须报告，不得自行恢复旧版业务规则。

## 分支 / ECS / 微信开发环境

- 唯一日常开发集成分支：`p1/foundation`。Gate 0 前 HEAD：`7d9db7bbf55007232815184fa36539a7c8ef8924`；Codex 每次自行 `git fetch` / `git status --short` / `git rev-parse HEAD`，**不得继续以这枚旧 SHA 当新代码基线**。
- 微信开发者工具正确项目：`C:\Users\yulia\Desktop\jiuchen-edu-platform\apps\miniprogram`。旧 `jiuchen-edu-client-gate` 是归档副本，禁止预览。保留本地 `apps/miniprogram/project.config.json` 未提交修改。
- **生产 API，用户提供 ECS promote + public health 证据：`ea8c971008a9efd042ec43fdc62398e136262259`**；上一个可回滚 release 为 `b9993dfe1e4c1c4be70cf75d8a48873d8bc8166c`。发布曾短时连接拒绝，随后 `PROMOTE_OK`，`/health/live`、`/health` (`database=ok`)、`/health/config` 均通过。Gate 0 本身没有登录 ECS 验证实时生产版本。
- `app.json` 截至 Gate 0 仍为**五个原生 Tab**：首页｜定位｜学堂｜资讯｜我的；产品已批准四个角色化物理入口，但 Phase 1a **代码尚未开始**。

## 已验收能力（不能被旧 TODO 推翻）

- **管理员首次绑定**：真实存在、可用且未认领的 JCA 可由已登录游客直接认领；生产真机成功转为 admin 并进入工作台（PASS），无“已有管理员批准”前置。编号暂保留字母数字组合，输入规范化；绝不公开未认领的高权限 JCA。
- **管理员生命周期**：暂停、撤销、恢复三类操作用户真机确认 PASS。旧 session、并发抢占、未知/禁用ID、第二账号及操作审计还需单独回归，不因基本路径通过就自动 PASS。
- **Assessment**：真实模型后台执行、评估中→成功→保存结果→历史复看（PASS）；六个用户可见章节 01–06；重看不应再次调用模型或收费。
- **材料与课表**：用户报告 PDF/DOCX/图片材料导入、真实 XLS 及编辑保存重开 PASS；课表课程→绩点计划可编辑预填 PASS；学员提交待审核与老师正式版的语义不可更改。
- 微信客服人工双向链路已通过；微信登录及 CloudBase Storage → ECS split 采用官方生态基础能力。ECS、DNS/NPM/HTTPS、模型选择等冻结，不开新迁移工程。

## 仍未完成的门槛（**不等于 UI Phase 1a blocker**）

| 类别 | 事实与待办 | Phase 1a |
| --- | --- | --- |
| News 自动同步 | 10-08 ECS 只读证据显示 `jiuchen-news-sync.service`/`.timer` **未安装**，脚本存在。需要受控安装、一轮成功 sync、timer enabled/active/定期运行证据。 | 不阻塞；运维单独收口 |
| News 编辑与阅读 | 有真实服务号同步/正文接口与管理员标签代码；标签增改删、重复同步保留标签与学员阅读图片还缺完整本轮验收记录。 | 保留现有路径即可 |
| 成长档案、辅导记录 | canonical/DOCX 等代码存在，但部分 production schema、DOCX/指导记录真机 Gate 尚无充分证据。 | 缺值显示诚实空/不可用态 |
| 支付、额度、退款 | Ledger/订单回调等后端合同存在；微信商户、批准价格/free-grant、生产 schema、退款一致性、真机支付仍待门槛；**仅 AI 评估额度可付费，课程只咨询**。 | 禁止 UI 伪造价格、购买或余额 |
| 隐私、安全、正式发布 | 账号注销与老师/学员越权回归、管理员审计、用户协议实际版本与隐私指引、多角色 iOS/Android 仍需最终验证。 | 不阻塞导航开发，但阻塞无条件称“正式上线” |
| Home 状态聚合 | `HomeExperienceSnapshot` 只读 API 尚未获具体合同批准；不可用客户端串接大型请求/猜测任务来替代。 | Phase 1a 不阻塞；Phase 1b 独立 Gate |

## 唯一主施工顺序

**Gate 0（本轮 docs-only）：**修正上述历史误导、更新 V1 约束和验证清单、明确 Codex 入口；未改任何运行代码。

**Phase 1a（下一轮 Codex 已放行）：**四个原生物理 Tab（index/classroom/news/profile）与安全角色标签/入口；position 降为非 Tab 但保留页面；原有 switchTab 调用与登录/权限/旧链接一次原子处理；staff 暂沿用已有 teacher-like 壳但不得提权为 admin；每个新增页面至少达到手机阅读、交互、窄屏及错误态基本要求；不改 API/Schema/生产。

**Phase 1b 及后续：**经独立审批的只读 Home snapshot → 生命周期首页 → 高频事实更新/规划/机会 → 教师和管理员工作台移动 UX → 全站视觉统一 → 真机全链路回归。各批不得使用占位数据伪装完整功能。

**禁止：**`main` 合并、force push、覆盖本地工作、生产 promote/写 Schema、AI 提示词/运行时和商业账本改动、虚构案例/截止日/排名/未读、将老交接当现行施工命令。
