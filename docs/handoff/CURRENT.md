# CURRENT — 九辰保研小程序唯一活跃交接入口

**更新：2026-10-09 · Phase 1a-R UI Closeout 本地代码与 23 项回归完成；CI 和手机验收状态见本文件末尾。** 本文件管理当前任务与验收状态；历史日期交接仅记录当时事实，不覆盖本文件。

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
- `app.json` Phase 1a 已改为**四个原生 Tab**：index/classroom/news/profile。普通用户/学员：首页｜规划｜机会｜我的；teacher/staff：工作台｜学员｜辅导｜我的；admin：工作台｜用户｜业务｜我的。position 仍注册为非 Tab 页面。代码完成不等于手机视觉及业务真机验收完成。

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

**Phase 1a（本轮代码已实现，手机验收待补）：**四个原生物理 Tab（index/classroom/news/profile）与角色入口、position 降级、旧 switchTab、登录恢复/权限协调已原子处理；staff 保持内部员工身份及已有 teacher-like 能力。新增错误态有重试/返回，身份确认期间不显示私有内容；仍需开发者工具与真机确认窄屏、字体、键盘及完整业务闭环。不改 API/Schema/生产。

**Phase 1b 及后续：**经独立审批的只读 Home snapshot → 生命周期首页 → 高频事实更新/规划/机会 → 教师和管理员工作台移动 UX → 全站视觉统一 → 真机全链路回归。各批不得使用占位数据伪装完整功能。

**禁止：**`main` 合并、force push、覆盖本地工作、生产 promote/写 Schema、AI 提示词/运行时和商业账本改动、虚构案例/截止日/排名/未读、将老交接当现行施工命令。

## Phase 1a 本轮实际证据

- 施工基线：`a934da0b40cba836cfca609aa75b38ac7cce6a1b`；单一导航代码提交 `cf3fe98008ebd8d0834342189a4d90e63ccdab17`，已推送 `p1/foundation`。后续提交仅补充 CI 证据和文件清单。
- `npm.cmd --prefix apps/miniprogram run typecheck`：PASS。
- `node --test tools/testing/miniprogram-navigation.test.cjs`：16 项 PASS；六种身份 × 四个槽位，登录/claim/401/旧会话竞态、只读历史结果、无栈返回、页面参数与 WXML 回归。测试使用合成账号和 wx double，**不是手机/生产权限验收**。
- 代码提交 CI：[Push #37928893951](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/37928893951) / [PR #37928901681](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/37928901681) 均 SUCCESS。小程序 typecheck + 16 项导航回归、Admin typecheck/build、API typecheck/test/build 通过；未使用基线绿色代替新提交。
- Developer Tools / 手机截图 / 真机 / 字体放大 / 键盘：**NOT RUN**。computer-use 的 node_repl 无法启动，诊断为 `windows sandbox failed: helper_unknown_error: setup refresh had errors`；没有生成或冒充手机截图。普通 shell 同样失败，获审批的终端通道可执行本地检查。
- 完整页面契约、界面评审、局部 hot-file 校正、待验收项及回滚见 `docs/handoff/phase1a-screen-review-2026-10-09.md`。
- 原有本地 `apps/miniprogram/project.config.json` 修改和所有原有未跟踪文件保留，不提交；`services/`、`ops/` 无代码变更。未部署生产、写 schema、改模型/Prompt/支付；Phase 1b 尚未开始。

## Phase 1a-R UI Closeout

本轮人类指令批准管理员移动列表整改，替代旧执行文档“留待 Phase 4”的该项限制；不批准身份合同、后端、AI、支付、数据库和生产发布变更。起始 HEAD `f49c26608a236705aa0e6bbfa52d82b41ee3182d`。

- 管理员工作台仅保留高频编号查找；用户承接账号/编号，业务承接分配/资讯，我的仅本人账号/支持。无虚构管理数字。
- 编号搜索/中文状态筛选/复制/状态适配原生操作菜单；新增表单按需展开，取消、防重复、原 API 权威及敏感后果确认保留。
- 规划右侧本周课表同页切换，阶段与课表读取状态分开；共享周次算法，按星期/节次排序；不改导入和规划审核合同。
- 公开 OA 文章读查确认图片重复 style（固定 530×707px 与自适应并存）、正文前重复封面与隐藏段。客户端安全节点修复布局；保留真实文字/图片/表格；后端未变。
- 原生四槽角色图标与功能图标、深浅蓝/暖黄层级；21 个原创 PNG 约 10KB，无 UI 依赖或字体包。
- 官网提供“复制地址”降级，**OPERATOR ACTION REQUIRED**：公众平台 → 开发管理 → 开发设置 → 业务域名，完成官网域名核验与真机 web-view 测试后才能批准直接打开。
- 代码提交 `0c5378cb8c419309176dc93bdf9bfc2f9211f2e2` 已推送。本地小程序 typecheck PASS；原 16 项 + 7 项专项测试，23 PASS；[Push CI #37938435444](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/37938435444) / [PR CI #37938437942](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/37938437942) 均 SUCCESS，小程序检查、Admin typecheck/build、API typecheck/test/build 成功。无小程序 npm build 脚本，未声称原生编译 PASS。
- computer-use 再试 Node 内核退出；开发者工具、窄屏/字体/键盘与真机截图全部 **NOT RUN**。不宣称移动 UX 已验收。
- 逐页整改对照、具体 Gate、独立业务待办及整体回滚边界见 `docs/handoff/phase1a-r-closeout.md`。Group / 定制资讯授权 / 评估客服分享均未实现；Phase 1b 未开始。
