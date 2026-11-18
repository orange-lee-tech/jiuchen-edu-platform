# 用户端统一化与个人工作区改造｜产品需求及 Codex 施工交接

**日期：2026-11-18**  
**仓库：** `orange-lee-tech/jiuchen-edu-platform`  
**施工分支：** `codex/ux-consolidation-20261116`  
**状态：** 产品规则已确认；本文为需求与技术交接，不代表代码、迁移或真机验收已经完成。

## 1. 本次目标

把九辰小程序的用户端统一为一套个人保研工作台。未登录用户、已登录未绑定学员身份的普通账号、已绑定正式学员身份的账号，使用相同的用户端页面结构、导航、规划、任务和课表交互。

**身份只决定保存权限、AI 评估额度和老师辅导权益，不决定个人工作台的主体 UI。**

本次是已确认的产品需求调整，不是单纯视觉修补。必须同时审计前端状态分支、API 身份门禁、数据库归属和绑定/解绑生命周期。

## 2. 产品规则（需求真相源）

### 2.1 三种用户状态

| 状态 | 定义 | 工作台能力 | 数据持久化 | AI 评估 | 老师辅导 |
|---|---|---|---|---|---|
| Guest | 未登录，没有 `userId` | 浏览完整用户端 UI；可临时填写、编辑当前页面内容 | 不允许任何持久化；仅保留当前登录流程所需的临时内存状态 | 提交时提示登录；登录后返回原表单 | 显示锁定提示，不展示任何学员私有辅导数据 |
| Unbound | 已登录，`users.role = user`，未绑定学员身份 | 完整使用个人规划、任务、学期设置和课表 | 以账号为所有者保存到服务端，支持跨设备同步 | 每个账号终身仅 1 次免费评估；服务端账本强制 | 显示正式学员专属锁定状态 |
| Bound Student | 已登录，`users.role = student`，已关联正式 `students` 档案 | 与 Unbound 使用同一套个人工作台 | 账号归属、跨设备同步；保留正式学员关联 | 沿用现有正式学员额度/账本规则，不在本次重写或硬编码 | 开放现有老师、辅导记录及相关正式学员服务 |

教师、内部员工、管理员的工作台、身份切换、只读查阅和现有权限完全保持，不纳入本次用户端统一化。

### 2.2 用户端 UI 规则

- 四个用户端入口继续使用「今天、规划、机会、我的」。现有 `shellKind('user')` 已映射到 student shell，保留这一行为。
- Guest、Unbound、Bound Student 进入首页和规划页时，展示同一套主要卡片、学期导航、规划分类、任务结构、课表结构和页面布局。
- 不再用“登录并绑定学员身份”或“绑定学员身份后查看阶段规划”这类入口页替代规划主体内容。
- Unbound 可以创建、编辑、删除自己的阶段规划和任务，可以设置当前阶段、导入/编辑/查看自己的课表；不需要先绑定学员编号。
- Bound Student 使用同一套规划、任务和课表 UI；只在老师辅导、评估额度等权益点体现身份差异。
- 老师辅导区域可以保留相同版位，但 Unbound/Guest 只显示简洁锁定说明，例如“正式学员专属服务，绑定学员身份后开放”；不得展示老师姓名、辅导记录或其他学员私有信息。
- 机会页的普通用户资讯浏览能力保持现状；不要借本次任务重做资讯系统。
- 「我的」页中与个人账号有关的资料、评估、钱包和常规菜单继续复用；课表管理入口应向 `user` 和 `student` 开放。教师/管理员专属菜单保持原状。

### 2.3 Guest 保存与登录回跳

- Guest 可以进入与正式学员相同的页面，填写表单、编辑当前页面的临时内容。
- Guest 点击任何会产生持久化副作用的操作（保存规划、保存任务、设置阶段、导入/上传课表、保存课表修改等）时，提示先登录。
- 登录前不创建云端业务记录，不上传课表源文件，不写入本机持久化草稿，不消耗额度。
- 登录跳转必须保留当前页面及尚未提交的表单内容；登录成功后返回原页面，用户可以检查内容并再次主动点击保存。不得在登录成功后未经用户再次确认就自动提交。
- AI 评估表单同样允许 Guest 进入和填写。Guest 点击“提交后台评估”时提示登录，保留当前表单的临时回跳状态；登录后回到评估表单并恢复填写内容，再由用户主动提交。正式评估草稿只在用户登录后按现有评估流程创建。
- 若微信页面栈或登录实现无法可靠保留复杂表单状态，Codex 应先检查现有登录回跳机制，提出最小可靠实现；不得通过把未登录内容写入服务端来绕过问题。

### 2.4 Unbound 与 Bound Student 的差异边界

允许出现的差异只有：

1. AI 评估额度：Unbound 账号终身 1 次免费；Bound Student 沿用现有正式学员额度、发放和扣减规则。
2. 老师辅导：Unbound 不开放正式学员老师辅导服务；Bound Student 使用现有老师关联、辅导老师和辅导记录。

规划、任务、阶段设置、课表、个人资料的基本编辑能力不应再因是否绑定学员身份而被锁定。

额度必须以服务端现有评估/额度账本为准。不得只在前端限制；不得通过切换身份、解绑再绑定、重新登录或跨设备重新获得 Unbound 免费额度；不得重置既有正式学员账本。正式学员具体额度以当前生效配置和账本为准，本次不写死“五次”等数字。

## 3. 当前代码审计发现

以下结论来自施工分支源码抽查。Codex 开始施工时仍须重新读取当前 HEAD 和文件，不得把本文当作实时工作树状态。

### 3.1 导航与前端页面

| 文件 | 已确认现状 | 本次处理方向 |
|---|---|---|
| `apps/miniprogram/miniprogram/utils/navigation.ts` | `shellKind(role)` 对 `user` 和 `student` 均返回 `student`；用户端四 Tab 标签已统一 | 保留既有映射，避免改动教师/管理员导航 |
| `pages/classroom/classroom.ts` | `initializeClassroom()` 对 Guest 直接清空规划并返回；对非 student 角色进入 `unbound` 并返回；只有 student 调用 `/me/classroom` | Guest、user、student 共用工作台数据结构；Guest 使用临时空态，user/student 读取账号工作区 |
| `pages/classroom/classroom.wxml` | Guest 和 Unbound 分别显示登录/绑定入口卡片；主体 `student-layout` 只在其他分支出现 | 移除阻断主体内容的 Guest/Unbound 入口分支，统一渲染主体布局；仅权限权益模块条件展示 |
| `pages/index/index.ts` | 首页只把 `role === student` 视为个人工作区所有者；user/Guest 不加载规划、近期任务和课表 | 对已登录 `user` 与 `student` 使用同一数据加载链；Guest 保持相同卡片结构和登录拦截 |
| `pages/index/index.wxml` | 未登录/未绑定时出现“登录后查看个人数据”“绑定学员身份后查看近期任务/规划”等替代文案 | 改为同一工作台结构；基础功能不以绑定为门槛，Guest 在保存动作上登录拦截 |
| `pages/profile/profile.ts` / `.wxml` | 个人菜单已对 user/student 复用；阶段和老师信息只对 student 读取；课表导入入口只对 student 显示 | 课表管理入口扩展到 user；老师资料继续仅对正式学员开放 |
| `pages/assessment-form/assessment-form.ts` | `initializeForm()` 当前对 Guest 直接跳转登录；user/student 可进入 | 按 2.3 实现 Guest 临时填写、提交时登录和回跳恢复；评估服务端账本不重构 |
| `pages/schedule-import/schedule-import.ts` | 课表导入页面使用账号登录状态和现有用户级课表 API | 允许 user 进入；未登录时在上传/持久化前拦截登录 |
| `utils/current-stage.ts` | `resolveCurrentStage()` 目前要求 `role === student` | 支持已登录 user 与 student；只读身份仍不可写 |

### 3.2 API 与数据模型

| 文件/对象 | 已确认现状 | 本次处理方向 |
|---|---|---|
| `services/api/src/db/schema.ts`：`users` / `userProfiles` | 用户账号和基础学业资料以 `userId` 归属；`userProfiles` 已有 `currentGrade`、`enrollmentYear` | 优先复用账号级资料，不另建重复个人资料体系 |
| `students` | `students.userId` 唯一关联用户；`currentStage`、`currentStageMode` 当前保存在 student 行 | 为 Unbound 提供账号级阶段设置，并定义与既有 student 阶段字段的唯一真相源/兼容策略 |
| `student_plans` | `studentId` 为非空外键，规划归属依赖 `students.id` | 这是当前 Unbound 无法拥有服务端规划的核心数据模型阻断点；需要设计账号级工作区归属，保留正式 student 关联 |
| `plan_items` | 通过 `planId` 归属规划；任务随规划保存 | 尽量保留现有任务表和字段，不建立第二套任务体系 |
| `plan_revisions` | `studentId` 为非空外键，属于现有正式学员计划历史结构 | 不得为 Unbound 伪造 student 记录；评估是否仅正式学员继续使用该历史表，保持旧数据可读 |
| `schedule_imports` | 已有非空 `userId` 和可空 `studentId`；课表最新记录及编辑接口已按当前会话 `userId` 过滤 | 继续以 `userId` 作为课表所有者；现有导入创建接口不应再要求 student 档案 |
| `classroom-workspace.ts`：`resolveStudentByUser()` / `loadClassroom()` / `applyApprovedPlan()` / `loadUpcomingTasks()` | 规划读取、保存、近期任务查询均以 studentId 为核心；阶段设置 API 只允许 role=student | 将个人工作区访问改为会话账号所有权；正式学员关系仅作为辅导/教师查阅关联 |

已确认的路由门禁：

- `GET /me/classroom` 当前要求能通过 `resolveStudentByUser()` 找到 student，否则返回 `student_profile_not_bound`。
- `GET /me/classroom/upcoming-tasks` 当前只允许 `role === student`，并以 `student.id` 查询任务。
- `GET /me/classroom/stage-suggestion` 与 `PUT /me/classroom/current-stage` 当前只允许 student；阶段值从 `students.currentStage/currentStageMode` 读取/写入。
- `PUT /me/classroom/plans/:stage/:type` 当前只允许 student，并通过 `student.id` 保存规划。
- `POST /me/classroom/schedule-imports` 当前虽然表结构有 `userId` 且 `studentId` 可空，但路由仍要求找到 student；`GET latest` 和后续课表修改已按 `schedule_imports.userId` 校验归属。
- `identity-roles.ts` 的解绑逻辑会清空 `students.userId` 并将身份置为 disabled；用户角色可能回到 `user`。个人工作区不得因此被删除或变成不可访问。

## 4. 数据归属与迁移要求

### 4.1 目标归属模型

**个人工作区的稳定所有者是登录账号 `users.id`，正式学员 `students.id` 是可选的服务身份关联，不是个人数据存在的前提。**

目标行为：

- 每个已登录 user/student 账号只有一个个人工作区；规划、任务、阶段设置、课表均由当前会话的 `userId` 隔离。
- 绑定正式学员身份后，把工作区与对应 student 档案建立关联，开放正式学员权益；不新建第二份工作区。
- 解绑正式学员身份后，个人工作区仍归原 `userId` 所有，规划、任务、阶段和课表继续可读写。
- 老师查阅仍通过现有 `studentTeacherAssignments` 和 student 关系授权；不得仅凭知道 `userId` 就扩大教师查阅权限。
- 所有写入的 owner 从服务端 session 推导。禁止客户端传入任意 `userId` / `studentId` 决定写入目标。

### 4.2 迁移约束

1. 不创建“假 student”或占位 `students` 行来绕过当前 studentId 外键；这会与正式身份绑定和唯一约束冲突。
2. 不创建第二套并行的规划/任务表，除非 Codex 能证明现有模型无法安全扩展，并先提交方案等待确认。
3. 现有正式学员 `student_plans`、`plan_items`、`plan_revisions`、老师关联、辅导记录必须完整保留；不得批量清空、覆盖或改变教师权限。
4. 现有 `schedule_imports.userId` 是正确的账号归属基础。保留现有记录、文件所有权校验、解析状态和结构化课表；不得把课表复制到第二套表。
5. 对已绑定用户的历史 student 规划，迁移/查询时应能通过 `students.userId` 解析到账号工作区；对尚未绑定的预置 student 数据，不能暴露给任意普通账号。
6. 若 Unbound 已创建规划后再绑定到一个已有规划的 student，必须制定事务化、无损的冲突处理规则：同一阶段/类型存在两份规划时，保留双方全部任务和字段，不静默覆盖、不丢失截止日期/状态/目标、不产生重复可见卡片。先审计实际约束和数据形态，再确定合并或双来源兼容策略。
7. 绑定/解绑必须覆盖并发、重复请求和事务失败回滚；绑定失败不得造成账号失去原工作区，解绑不得删除账号级数据。
8. 阶段状态迁移必须有明确的单一真相源。既有 `students.currentStage/currentStageMode` 与新账号级阶段设置之间必须定义回填、读取优先级、写入同步和回滚策略。
9. migration 必须可重复执行或具备明确的已执行检测；先在 disposable MySQL/测试数据库演练。不得执行生产 DDL。
10. 如果无损绑定合并需要破坏性选择、覆盖教师维护数据，或无法从现有结构证明安全，停止数据库实现并先回报方案，不自行决定丢弃哪一份数据。

### 4.3 课表和文件边界

- 课表结构化数据继续保存在现有 `schedule_imports`，以 `userId` 为 owner；`studentId` 仅作可选关联。
- `POST /me/classroom/schedule-imports` 对已登录 user/student 均开放；仍须验证上传文件属于当前用户、文件类型/大小合法，并沿用现有解析与临时源文件清理流程。
- 课表日期、课程编辑、最新课表读取等所有更新接口继续按 `session.userId` + 记录 ID 双重校验。
- Guest 不得上传文件、调用 OCR/AI 解析或创建 `schedule_imports` 记录。

## 5. 权限与安全边界

- Guest：服务端所有个人工作区读写 API 均未认证；公开资讯等原有公开接口不受影响。客户端不得把 Guest 表单写入云端。
- `role=user`：可读写自己的规划、任务、阶段、课表；不可读取老师辅导记录、教师列表或其他账号数据。
- `role=student`：可读写自己的个人工作区，并按既有绑定关系查看老师辅导服务。
- `role=teacher/staff/admin`：保留现有工作台和显式授权的只读/管理 API；不能因普通用户工作区开放而扩大其目标访问范围。
- `readOnly` capability/session：只读 GET 仍按既有规则工作；任何 PUT/POST/DELETE 必须继续被服务端拒绝。
- 对跨账号访问、猜测 planId/importId、篡改 stage/type、伪造 userId/studentId 的请求必须验证 owner，返回适当 403/404。
- AI 评估额度发放、预留、扣减、失败返还沿用服务端账本及幂等规则；UI 只显示额度，不承担授权。

## 6. Codex 施工文件范围（按实际依赖调整，禁止无关重构）

### 小程序

- `apps/miniprogram/miniprogram/pages/classroom/classroom.ts/.wxml/.wxss`
- `apps/miniprogram/miniprogram/pages/index/index.ts/.wxml/.wxss`
- `apps/miniprogram/miniprogram/pages/profile/profile.ts/.wxml`
- `apps/miniprogram/miniprogram/pages/assessment-form/assessment-form.ts/.wxml`
- `apps/miniprogram/miniprogram/pages/schedule-import/schedule-import.ts/.wxml`
- `apps/miniprogram/miniprogram/utils/current-stage.ts`
- `apps/miniprogram/miniprogram/utils/request.ts` 及确有需要的类型/请求辅助文件

### API 与数据库

- `services/api/src/db/schema.ts`
- `services/api/src/routes/classroom-workspace.ts`
- 必要时 `services/api/src/routes/identity.ts`、`services/api/src/services/identity-roles.ts`
- 新增单一职责、可重复执行的 migration/upgrade 脚本，并在 `services/api/package.json` 注册脚本
- 相关 API 测试与小程序回归测试

只修改满足本需求所必需的文件。不要顺手改资讯、分享、支付、AI Provider、ECS 发布工具或教师/管理员 UI。

## 7. 必须完成的测试

### 7.1 API 与数据

- Guest 对个人工作区读写接口均不能绕过认证；公开接口行为保持原样。
- `role=user` 可以创建、读取、更新、删除自己的阶段规划/任务；第二个 user 无法读取或修改第一位用户的数据。
- `role=user` 可以设置/读取自己的阶段，并能按入学年份建议自动定位；手动阶段不会被自动建议静默覆盖。
- `role=user` 可以导入课表、读取最新课表、设置学期第一周日期、编辑课程；上传文件和记录始终属于当前账号。
- `role=student` 原有规划、任务、课表、阶段和老师辅导读取行为不回归。
- teacher 仍只能通过现有 assignment 授权访问学生；user 不得读取任何辅导记录/教师私有信息。
- read-only capability 对所有写接口仍返回拒绝。
- 绑定：账号已有工作区时绑定 student 后，所有规划/任务/课表可继续读取；已有 student 规划冲突时按确定的无损规则处理。
- 解绑：解除 student 身份后，原账号仍可读取/编辑自己的工作区；teacher assignment 和正式学员历史数据按原权限保留。
- migration 在隔离 MySQL 中验证旧数据保留、外键/索引、重复执行、绑定/解绑和失败回滚。

### 7.2 小程序 UI 与流程

- Guest、Unbound、Bound Student 的首页和规划页主体结构一致；不得再出现 Guest/Unbound 专属阻断入口页。
- Guest 能浏览和临时填写规划、任务和课表编辑内容；点击持久化动作时提示登录，不发生 API 写入或文件上传。
- Guest 登录后返回原页面，临时内容仍在，用户可再次主动保存。
- Unbound 保存规划、任务、阶段和课表后，重新进入页面仍存在；同一账号在另一设备登录能读取相同数据。
- Bound Student 原有页面与业务不回归；老师辅导模块仅在正式学员身份下开放。
- 评估 Guest 回跳：填写表单后点击提交触发登录，登录成功返回原表单并恢复字段；再次点击才创建评估任务。
- Unbound 免费评估只发放一次；反复进入、重登、切换/解绑身份不得重复发放；正式学员原账本行为不变。
- 教师、管理员工作台和只读查阅回归通过。

### 7.3 必须执行的工程检查

API（在 `services/api`）：

```bash
npm run typecheck
npm test
npm run build
```

小程序（在 `apps/miniprogram`）：

```bash
npm run typecheck
```

另运行受影响的现有回归测试和新增测试；检查 `git diff --check`。如仓库已有针对小程序页面的导航/真实数据/页面结构测试，应扩展现有测试，不重复建立无意义测试框架。

## 8. Codex 执行顺序

1. 重新读取当前分支 HEAD、`git status --short --branch`、远端分支状态；确认仍在 `codex/ux-consolidation-20261116`。保留所有本地修改、未跟踪文件、stash 和 worktree；禁止 `reset --hard`、`clean -fd`、覆盖 `project.config.json`。
2. 阅读 `CONSTITUTION.md`、`AGENTS.md`、`docs/handoff/CURRENT.md`、`docs/handoff/README.md` 和本文。对照实际源码复核本文列出的文件与路由。
3. 先完成数据模型审计：列出规划/任务/阶段/课表读写端点、所有者字段、唯一索引、外键、绑定/解绑路径、教师查阅路径和当前测试。提交简短实现方案，明确工作区 owner 模型、阶段字段方案、绑定冲突处理和 migration 回滚边界。
4. 若方案能无损兼容旧 student 数据，按最小变更实施；若必须删除/覆盖数据或无法保证绑定合并无损，暂停并汇报，不执行猜测性迁移。
5. 先完成 API/数据库最小闭环和隔离 MySQL 测试，再接通小程序共享 UI。不要先做纯 UI 假象。
6. 完成三种身份状态、绑定/解绑、跨账号隔离、Guest 登录回跳、额度和老师辅导权限回归。
7. 只提交本需求范围内文件，提交并推送到 `codex/ux-consolidation-20261116`；不得合并 main。
8. 最终回报变更文件、migration 名称/行为、测试命令与真实结果、提交 SHA、未完成的微信开发者工具/真机验收项。

## 9. 发布边界与完成定义

- 本轮允许：GitHub 当前施工分支上的需求文档、源码、测试和隔离数据库 migration 演练。
- 本轮禁止：合并 `main`、执行生产数据库 DDL、操作 ECS、部署/切流 API、修改生产环境变量、上传/发布微信小程序、修改真实用户数据或额度账本。
- 代码完成、自动化测试通过、微信开发者工具构建、真机验收、生产部署是不同状态，必须分别报告。
- 最终交付至少证明：Unbound 真正拥有账号级可编辑、可跨设备同步的个人规划/任务/课表；Guest 与其他用户显示同一套主要 UI，且持久化操作被安全拦截；绑定/解绑不丢失数据；正式学员和教师权限不回归。

---

**人类产品决策摘要：** 不绑定学员身份，不等于不能使用九辰的个人保研工作台。绑定身份是获得正式学员评估额度和老师辅导服务的升级；不是规划、任务和课表的使用门槛。