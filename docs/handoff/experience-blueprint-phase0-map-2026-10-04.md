# Experience Blueprint Phase 0 — Repository Mapping

日期：2026-10-04。仓库：orange-lee-tech/jiuchen-edu-platform。分支：`p1/foundation`。

Baseline HEAD（`git pull --ff-only origin p1/foundation` 后）：`e85c21cafb1d695679a71e13c5fc923819ab48e1`。

本文件是施工地图，不是施工授权。Phase 1 尚未开始。本轮只新增本文件；没有修改 Runtime / UI / Route / Backend / Schema，也没有连接生产环境进行验收。

## 1. 结论、证据及冻结边界

推荐：保留原生 TabBar，使用固定四个物理页面作为 role-aware shell；角色改变页面内容与标签，不改变同角色的一级导航数量。学生/普通用户为“首页｜规划｜机会｜我的”，老师为“工作台｜学员｜辅导｜我的”，管理员为“工作台｜用户｜业务｜我的”。旧二级页面先保留业务实现和参数契约。

不要把此次迁移做成重新开发 Assessment、Classroom、商业系统。真正缺少的是生命周期只读聚合、明确的事实变化历史，以及一部分机会元数据；不是另一个 AI Runtime 或另一个 Profile 数据库。

已阅读的规范与交接：

- `CONSTITUTION.md`、`AGENTS.md`。
- `docs/handoff/main-control-status-2026-10-04.md`。
- `docs/design/jiuchen-v1-experience-blueprint.md`、`docs/design/jiuchen-v1-design-system.md`。
- `docs/product/v1-baseline.md`、`docs/product/canonical-growth-profile-projection.md`。
- `docs/handoff/ai-runtime-worklog-2026-10-04.md`、`assessment-production-gate-2026-10-04.md`、`business-commercial-closeout-2026-10-04.md`、`ui-pre-blueprint-closeout-2026-10-04.md`、`growth-profile-output-performance-2026-10-04.md`。
- `docs/product/news-official-account-integration.md`、`docs/product/credit-payment-contract.md`。

实现证据主要来自 `apps/miniprogram/miniprogram/app.json`、全部 `pages/*`、`utils/request.ts`、`utils/auth.ts`，以及 `services/api/src/routes/` 下的 assessments、profile、growth-profile、classroom-workspace、students、teacher、mobile-admin、news、commercial 相关实现、`domain/classroom.ts` 和数据库 schema。下文短页面名均指 `pages/<name>/<name>`；API 路径不包含部署前缀。

证据优先级：宪法/当前明确批准范围 → 2026-10-04 主控与最新专项 handoff → 基线实现。发现冲突时记录并暂停相关规则修改，不静默选边。

| 区域 | 当前事实 | 迁移边界 |
| --- | --- | --- |
| Assessment | 最新生产 gate 记录 release `8e5a0ffe7869cd3f6ec8c0a8a876247798b65519`，18 字段 schema / 748 私有 corpus / 配置与健康检查 PASS；qwen3.8-flash、非 thinking、temperature 0、strict JSON Schema、Zod/evidence 校验及最多一次 repair 已确定 | 仅剩用户本人真机闭环验收；不重开模型、Provider、Prompt、检索或评测施工 |
| Commercial | deterministic ledger/payment/reservation server foundation 已实现；默认 `CREDIT_ENFORCEMENT_ENABLED=false` | 主控文档较早的“缺商业路由”描述不能覆盖最新专项 handoff 与实现；不等于生产表、商户配置或充值 UI 已完成 |
| Growth | canonical、确定性投影、bootstrap、DOCX 与缓存已有代码 | production growth schema gate 与 DOCX 真机验收独立；“仓库可用”不等于“生产已上线” |
| Classroom | 阶段规划、审核、版本、导入与辅导读取已有实现 | coaching schema、真机审核/导入验收等单独核实；不重写业务规则 |
| News / Product | 真实服务号文章链路与产品读取能力存在 | 文章不是结构化机会库；bundled 产品资料不是生产产品表安装证明 |
| 视觉 | 旧 jc-* / 大圆角为 exploratory | 后续执行已批准的 square-first 规则；本轮不做 sweep |

本轮未读取或展示真实学生案例正文、密钥及 `.env` 值；私有案例、打包文件和其他原有 untracked 文件不纳入提交。

## 2. 当前 Route / Page Inventory

`app.json` 注册 19 个页面；`pages/*` 共 76 个 TS/WXML/WXSS/JSON 文件。当前原生五个 Tab：index、position、classroom、news、profile。未发现 custom-tab-bar。`app.ts` 当前不是角色路由协调器。以下角色为现有入口/用途，不将客户端可见性当作服务端授权。

| Route 短名 | 用途 / 当前 Tab | 谁进入、谁跳向它 | Deep-link / 参数风险 |
| --- | --- | --- | --- |
| index | 门户首页；是 | 默认启动、全部用户、Tab | 无查询契约；含静态宣传/案例占位内容，不能直接当生命周期事实 |
| position | 定位概览与评估入口；是 | Tab、index、profile 普通用户入口；评估面向 user/student | 移出 Tab 后，现有两处 switchTab 必须同批修改；外部旧启动路径要兼容 |
| classroom | 学堂阶段规划；是 | Tab、index；guest/unbound/student/teacher 模式，staff/admin 进入 teacher 模式 | 默认阶段与身份敏感；后续路径在不同角色有不同语义 |
| news | 资讯流；是 | Tab、index；公开浏览 | 服务号文章外跳不是小程序内部 route；旧 news 路径需保留 |
| profile | 我的与角色菜单；是 | Tab、登录成功；全部角色 | 登录现在固定跳这里；退出/删除账号影响导航栈与缓存 |
| growth-profile | 成长档案、导入确认、简历/申请投影、DOCX；否 | profile 的成长档案入口；登录用户 | 用户隔离、schema readiness、确认导入及缓存敏感 |
| login | 微信登录；否 | position/classroom/profile/profile-edit/assessment 三页；删除账户后 reLaunch | 无通用登录后原意图恢复；当前完成登录一律 switchTab profile |
| profile-edit | 基础学业资料、内部身份绑定；否 | profile、position、classroom、growth-profile；登录用户 | claim 后角色可改变；不得只更新标题不刷新权限/缓存 |
| admin | 内部编号、用户、分配、资讯管理；否 | profile 管理员菜单 | `section=admin-users|admin-assignments|admin-news`；本地 admin guard + 服务端权限；冷启动无栈时 navigateBack 风险 |
| assessment-form | 新建/编辑草稿、显式运行评估；否 | position、history；user/student | `id` 草稿、`section=english|research|competition`；id 属主、草稿状态、返回栈敏感 |
| assessment-history | 草稿与历史评估；否 | position、profile student、result 返回 | 无查询参数；draft→form，succeeded→result，running/failed 不打开结果 |
| assessment-result | 持久化成功结果；否 | form 成功 redirect、history | `id`；重看不得再次调用模型或扣费；优先返回 history，否则 redirect history |
| products | 产品目录；否 | index | 公开产品入口；不等于支付/套餐可购买 |
| product-detail | 产品详情；否 | index、products、library | `documentKey` URL 编码与不存在处理；保留旧链接 |
| brand | 品牌介绍；否 | index | 无参数；低频公开页 |
| library | 产品＋资讯聚合，当前称院校库；否 | index 两个入口 | 并非学校/项目数据库；产品详情参数与文章外跳 |
| plan-editor | 学生提交审核 / 老师保存正式版；否 | classroom、teacher-students | `stage,type,studentId,studentName`；studentId 决定客户端模式但不授予权限；studentName 仅显示 |
| teacher-students | 学员列表、待审核与阶段计划入口；否 | classroom、profile 的学员/课表/记录菜单 | teacher/staff/admin 现有入口；实际访问受 API 约束，不能依赖入口隐藏 |
| schedule-import | 课表文件上传与解析结果；否 | classroom | 登录、学生关系、文件/临时存储、解析状态敏感；不要改变上传适配器 |

### 2.1 导航调用完整索引

对 miniprogram 全目录检索五种 API；以下为基线行号（新提交可能移动）。同一格括号中的数字是各调用所在行，覆盖全部检出的调用；未发现 WXML `navigator`、`onShareAppMessage` 或 `onShareTimeline`。这不证明没有外部二维码、后台配置的页面路径或用户已有启动记录。

| 源 TS | API → 目标 / 行号 |
| --- | --- |
| index | navigateTo brand(88)、library(92,106)、products(115)、product-detail?documentKey(122)；switchTab position(98)、classroom(102)、news(110) |
| position | navigateTo login(167,182,190,196)、assessment-form(176)、history(185)、profile-edit(207)、form?section(212) |
| classroom | navigateTo plan-editor?stage&type(190)、schedule-import(196)、teacher-students(200)、login(204)、profile-edit(208) |
| profile | navigateTo profile-edit(175,191)、login(178,183,233)、growth-profile(196)、history(202)、teacher-students(210)、admin?section(215)；switchTab position(204)；reLaunch login(257，删除账户后) |
| login | switchTab profile(26) |
| profile-edit | redirectTo login(60) |
| growth-profile | navigateTo profile-edit(237) |
| admin | navigateBack(60，非 admin / 未登录) |
| assessment-form | redirectTo login(245)、result?id(670)；navigateBack(251，角色不适用；267，非草稿) |
| assessment-history | redirectTo login(37)；navigateTo form?id(80)、result?id(91)、form(97) |
| assessment-result | redirectTo login(41)、history(98)；navigateBack(94，上页为 history) |
| teacher-students | navigateTo plan-editor?studentId&studentName&stage&type(70) |
| products / library | 各 navigateTo product-detail?documentKey(89 / 96) |
| news / brand / product-detail / plan-editor / schedule-import | 没有上述五种 API 调用；文章/客服/文件打开属于独立平台动作，不可误删 |

## 3. Old → New Experience Mapping

标记是下一阶段建议，不表示本轮已迁移。RENAME 指信息架构/标题，默认不改磁盘 route。SHELL 指一级容器；MERGE 指入口/信息层级整合，不是合并事实表。DEEP-LINK ONLY 指内部带上下文的二级页，不能解释为取消用户可发现入口。

| 旧页面 | 标记 | 新归属与安全迁移方式 |
| --- | --- | --- |
| index | SHELL + RENAME | 学生 lifecycle Home；teacher/admin 工作台。替换静态门户优先级之前先取得真实 snapshot，品牌营销下沉 |
| position | DEMOTE + KEEP | 首页/我的的 contextual Assessment capability；保留旧 route 和历史入口。先降级导航，后决定概览是否 MERGE，不能直接删除 |
| classroom | SHELL + RENAME | student Plan；teacher 学员、admin 用户的物理槽位。学生阶段读取/编辑仍用原业务，老师/管理员先链接既有二级页 |
| news | SHELL + RENAME | student Opportunity；teacher 辅导、admin 业务的物理槽位。学生内容先明确为文章，不能把旧文章对所有角色直接复用 |
| profile | SHELL + KEEP | Mine，按角色保持稳定入口；身份/资料/评估/成长/设置分组 |
| growth-profile | KEEP + MERGE（入口） | Mine → 完整成长记录/简历/申请；复用现有 bootstrap、确认导入和 DOCX，不复制履历 |
| login | KEEP | 共享登录流程，后续增加安全 intent restore，不改认证真相源 |
| profile-edit | KEEP + MERGE（入口） | Mine 的身份与低频资料编辑；高频事实编辑逐步拆交互，不另建 profile |
| admin | KEEP + DEEP-LINK ONLY | admin 用户/业务 shell 的具体管理工作页，保留 section 参数；不是学生 Mine 菜单 |
| assessment-form | KEEP + DEEP-LINK ONLY | 从 Home/Mine/position 明确进入；保持草稿、运行、收费与输入契约 |
| assessment-history | KEEP | Mine 的评估记录；Home 可直达最近成功记录/草稿 |
| assessment-result | KEEP + DEEP-LINK ONLY | 按 id 阅读持久化结果，八类输出和免责声明继续保留 |
| plan-editor | KEEP + DEEP-LINK ONLY | Plan / teacher 学员详情中的编辑操作；不改审批、正式版与阶段规则 |
| schedule-import | KEEP + DEMOTE | Plan 的课表工具，不设一级入口；保留真实解析结果 |
| teacher-students | KEEP + MERGE（入口） | teacher 学员 shell 的既有能力；先不复制审批处理逻辑，再单批拆列表/详情 |
| products | KEEP + DEMOTE | Mine/低优先级发现中的服务介绍；与真实商业可用性分开 |
| product-detail | KEEP + DEEP-LINK ONLY | 保留 documentKey 与官方客服动作，不擅自添加购买 |
| brand | KEEP + DEMOTE | Mine → 关于九辰；不占 Home 学生行动位 |
| library | MERGE + REMOVE-CANDIDATE（远期） | 真实文章归 Opportunity、产品归服务目录；无学校实体就撤销“院校库”的能力承诺。先保留兼容入口；待所有入口/外部链接审计后才可申请删除 |

DEFER：真实学校/项目/夏令营/预推免目录、截止日排序、老师推荐关系、排名/成绩趋势、自动 GPA 推导、PDF、支付 UI。不是用占位假数据完成这些栏目。

## 4. Navigation Architecture recommendation

### 4.1 微信约束与证据边界

原生 tabBar 是 app.json 中静态注册的页面列表（平台规范为 2–5 项），不是运行时随角色增删的路由表。不能注册三套四项 Tab 再假设可由 setTabBarItem 切换 pagePath。

本地已安装的官方 `miniprogram-api-typings`：`types/wx/lib.wx.api.d.ts` 的 `SetTabBarItemOption`（11599 起）只有 index、text、iconPath、selectedIconPath 及回调，没有 pagePath 或列表数量；`SwitchTabOption`（12752 起）明确只能跳 app.json tabBar 页面，URL 不能带参数。navigateTo/redirectTo 用于非 Tab 页；switchTab 会关闭非 Tab 页面；reLaunch 重置页面栈。Tab 上下文应采用受控内存 intent，而不是 query 拼接。

官方参考入口：[app 配置](https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app.html)、[setTabBarItem](https://developers.weixin.qq.com/miniprogram/dev/api/ui/tab-bar/wx.setTabBarItem.html)、[switchTab](https://developers.weixin.qq.com/miniprogram/dev/api/route/wx.switchTab.html)、[custom tabBar](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/custom-tabbar.html)。本轮网络工具无法打开这些官方网页，未用第三方页面冒充核验；API 参数结论由本地官方 typings 交叉验证。Phase 1 开工时仍需在开发者工具及项目支持的真机基础库验证列表/栈行为，尤其冷启动、role 切换与 custom 方案的兼容性（若未来采用）。

custom tabBar 解决自定义视觉/交互，不自动解决角色授权、登录恢复或路由静态注册；仍须遵守平台 Tab 配置与同步选中态。当前四个普通文本槽位没有充分理由引入自定义组件与多页面实例状态同步。

### 4.2 推荐固定四槽，先兼容旧路径

| 固定物理 route | guest / user / student | teacher | admin |
| --- | --- | --- | --- |
| index | 首页 | 工作台 | 工作台 |
| classroom | 规划 | 学员 | 用户 |
| news | 机会 | 辅导 | 业务 |
| profile | 我的 | 我的 | 我的 |

优点：保留四条已注册 Tab 路径；旧业务页先不搬迁；角色表只有一份；原生返回/切换行为更可预测。缺点：classroom/news 名称与 teacher/admin 内容不完全一致，必须将“物理 slot”与“业务目的地”分开，不能继续到处裸写 switchTab('/news') 来表达“查看文章”。中性新 shell 路径更清晰，但会同时扩大全部旧入口、启动路径与恢复逻辑的迁移面，暂不推荐。

Phase 1 必须原子处理：移出 position Tab、修正 index:98/profile:204 两处 switchTab、角色→四槽标签映射、三个角色的安全内容分支、登录/角色切换协调，以及旧路径兼容测试。不能先改 Tab 数量再等待后续批次补坏掉的调用。老师/管理员暂用链接到既有工作页的轻量内容，不伪造统计，也不把学生资讯/规划误显示成管理能力。

### 4.3 角色、登录、Deep link 与 ownership

- 服务端 `/auth/me` 为身份确认来源；本地 `getSavedAuthResult` 是展示缓存，不是永久有效权限。其返回 shape 与登录 BootstrapResult 不同，不能直接塞给 `saveAuthResult`。
- 冷启动先处理未知角色/恢复中状态，不闪现带私人数据的其他角色内容。确定角色后一次协调四项标签与默认首页；切换失败保留可恢复提示，不留下混合角色导航。
- 登录前记录 allowlisted intent（页面枚举＋经验证的 id/section/stage/type）；一次性消费、短时有效、按账号隔离。禁止任意 URL、token 或自动执行 run/save/pay。登录恢复到 result 只读历史，不重跑评估。
- 普通 user→student 绑定后仍是同四个标签；刷新 binding、stage、teacher relation 与相关缓存/内容，而不是增加或隐藏 Tab。teacher/admin 变化则清空旧账号/角色内容和非 Tab 栈，重建正确 shell，再尝试仍有权限的 intent。
- 当前 profile-edit claim 更新本地身份；当前 login 固定回 profile，尚无上述协调器。退出/401/账号切换/删号必须一并测试，缓存要按用户隔离。
- 外部旧 path/query 先验证权限，再转换成业务 intent。role-aware 的 news/classroom 对异角色旧链接不能静默解释成另一个业务；安全引导到适用页或明确不适用。直接进入 admin/form 冷启动无上一页时，不能只依赖 navigateBack。
- teacher 工作台/学员/辅导归 Teacher Experience owner；admin 工作台/用户/业务归 Admin Experience owner；共用 shell/auth/route 表归 Navigation owner，业务授权仍归后端原 owner。不得在 frontend 使用 studentId 绕过师生关系校验。
- 后端还有 `staff`；旧 classroom 将 staff/admin 并入 teacher 模式，但 Blueprint 未批准 staff 导航。主控必须明确 staff 落在哪套 shell；决定前保留现有能力边界，不能自行提升为 admin。

## 5. Lifecycle State / Data availability matrix

标签含义：AVAILABLE NOW = 基线有可复用读契约（不代表生产验收）；AVAILABLE BUT EXPENSIVE/FRAGMENTED = 需多次读取、payload 过大或语义不完整；MISSING CONTRACT = 缺稳定字段/查询语义；MISSING DATA HISTORY = 无法从当前值可靠恢复变化；DEFER = 本轮及首批不承诺。

| 数据 | 判定 | 真实来源与限制 |
| --- | --- | --- |
| 登录/role | AVAILABLE NOW | 登录会话、`/auth/me`；本地缓存可能过期，需权威刷新与未知态 |
| 基础 profile | AVAILABLE NOW | `/me/profile` → user_profiles；当前学校/专业/年级/GPA-or-average/排名，不含历史趋势 |
| 评估结果/草稿 | AVAILABLE BUT EXPENSIVE/FRAGMENTED | `/me/assessments` 最新 50 条及详情，含较重输入/结果；不能用这 50 条中没有 succeeded 推断从未成功评估 |
| 首评完成/最新成功摘要 | MISSING CONTRACT | 应直接查存在性与 latest-success，并返回 id/time，不下载全部 evidence/output，更不运行模型 |
| student binding | AVAILABLE NOW | `/me/internal-id` / `/auth/me` businessIdentity；身份绑定不等于已分配老师 |
| teacher assignment | AVAILABLE BUT EXPENSIVE/FRAGMENTED | teacher_student_assignments 经 classroom 读取；高年级 showGuidance 可隐藏 mentors，不能以 mentors=[] 判定未分配 |
| 当前阶段 | AVAILABLE BUT EXPENSIVE/FRAGMENTED | students.currentStage 与 classroom 默认阶段；profile 年级不等于当前学期；空/非法值不能用前端 freshman-fall 当真实阶段 |
| plan/current tasks | AVAILABLE NOW（分片） | `/me/classroom?stage=` → plans/items/pending revisions；完成数可算任务状态比例，不是保研成功率/整体成长进度 |
| canonical growth/projections | AVAILABLE NOW（schema gated） | `/me/growth-profile/bootstrap` 一次读返回 profile、三种简历、application、导入候选、revision/readiness；Home 不应为一个计数拉全套 |
| news/articles | AVAILABLE NOW | `/news` + news_posts / articleUrl；公开内容，可进入 P4；不是个性化机会 |
| opportunity deadline/推荐 | MISSING CONTRACT / DEFER | 没有结构化 opportunity、deadline、推荐关系；不能从标题推断硬截止日或“老师推荐” |
| rank history | MISSING DATA HISTORY | user_profiles 当前排名会被覆盖；updatedAt 不是变化序列 |
| course grade history/GPA delta | MISSING DATA HISTORY + MISSING CONTRACT | plan target/status 和 schedule parsedJson 不等于已确认课程成绩；无完整课程学分/评分规则/历史链 |
| teacher update | AVAILABLE BUT EXPENSIVE/FRAGMENTED | coaching_records 有 occurredAt、教师、内容；plan_revisions 有审核/编辑者信息，但只保留最近 3 版，无统一“我未读/已处理”游标 |
| ongoing milestones/targets变化 | MISSING CONTRACT / MISSING DATA HISTORY | growth_records 可存经历当前事实，但不是通用事件账本；目标常在 assessment 历史快照，非批准的 canonical shortlist |

### 5.1 State 0–4 的实际落地边界

| State | 可据实判定 / 展示 | 不可推断与下一步 |
| --- | --- | --- |
| 0 未登录 | 无有效会话；价值说明、登录/建立档案入口、公开文章 | 无私人画像/排名/任务，不调用个人 API 或模型 |
| 1 已登录、尚无首次成功评估 | 权威 role + profile 缺项；可继续真实草稿 | 需 latest-success exists 语义，不以空列表/请求失败判无历史；不制造免费次数 |
| 2 已有成功评估 | 最近成功 id/time、持久化判断/行动入口 | 判断不自动变事实或 teacher task；无新事实事件就不显示“评估已失效” |
| 3 绑定且分配老师 | 独立 binding/assignment + 当前 stage/plan/真实辅导记录 | 不用 mentors 展示开关替代关系；绑定用户可能未评估，不应强迫 AI 首评才能看正在进行的服务 |
| 4 持续使用、较成熟 | 可展示真实当前任务和已确认事实 | 无统一成熟度、变更/已读历史契约，不能按注册天数、记录条数或任意阈值自动声称“成熟”；先退回真实 State 3/2 能力 |

State 不是机械线性漏斗。建议由 snapshot 输出判定依据/缺失原因，优先保留已生效服务能力；State 4 的正式判定待产品批准。teacher/admin 进入独立角色 shell，不强套学生 State 0–4。

Home 排序维持 Blueprint 的确定性 P0 阻塞/截止 → P1 人工高影响 → P2 当前阶段 → P3 判断 → P4 发现。无 deadline 或变化证据时不生成对应项；加载失败 ≠ 无任务。首屏通常只放 1–3 个有证据的可行动项，不能以营销补满。

## 6. Backend contract gaps（仅设计，不实现）

### 6.1 HomeExperienceSnapshot

否则 Home 会串联 auth → identity/profile → classroom → assessment list/detail → growth bootstrap → news，造成瀑布、重复载荷和跨请求状态不一致。建议后端在原 API/原 MySQL 内实现受鉴权的只读、有界聚合；不是新服务/队列/数据库，也不是 AI 编排。

| 建议字段组 | 来源 | 必要语义 |
| --- | --- | --- |
| role/capabilities/generatedAt/revision | session、users、模块 readiness | 权威角色、读取版本、每模块 available/unavailable/error；未知不是 0 |
| identity/binding/teacherRelation | business identity、students、assignments | 分离“已绑定”“已分配”“当前阶段是否展示辅导” |
| profileSummary/missingFields | user_profiles | 仅必要字段及来源；缺项规则有版本，不回传完整隐私材料 |
| assessment.latestSuccess / resumableDraft | assessments 按用户、状态查询 | id/time/status、hasSucceeded；明确当前 50 条列表之外也有效；无需完整输入/evidence，更不触发 run |
| stage / planSummary | students.currentStage、plans/items/revisions | stage 未配置原因；正式版/待审核区别；有限任务及合法目的地 |
| teacherUpdates | coaching_records/审核元数据 | 真实来源 id、作者、发生时间；没有 read cursor 时称“最近记录”，不称“未读” |
| factChanges / deadlines（可缺省） | 后续批准的 canonical history / opportunity | 能力未建即 unavailable，不从 updatedAt 或文案编造 delta/deadline |
| lifecycleEvidence / actionIntents | 上述真实字段、确定性规则 | 可解释判定，枚举目的地＋验证参数；不接受服务端任意跳转 URL |

owner：API read-model owner；Lifecycle UX owner 给出最小字段及排序验收；Identity/Classroom/Growth 原 owner 审核来源。Assessment owner 只审核只读隔离，不修改冻结 runtime。普通读取不得 grant credit、创建订单、保存草稿、调用模型。权限在服务端按本人/师生关系校验；分页/限量，避免逐任务 N+1；identity/profile/plan/assessment 写后做作用域失效，退出时清空用户缓存。后台刷新失败可显示带时间的旧值，不能跨账号回填。

### 6.2 Plan / Opportunity / Mine / 工作台

| 合同建议 | 当前可复用 | 缺口与负责方 |
| --- | --- | --- |
| PlanNowSummary（优先扩展现有 classroom，而非另建规划模型） | stage catalog、/me/classroom、versions、teacher pending revisions | 返回默认阶段来源、正式/待审核版本、lastEdited/review 信息、近期辅导记录；无 deadline 不返回 deadline；Classroom owner 负责，规则冲突先裁决 |
| OpportunityArticleList（先明确文章语义） | `/news`、source、articleUrl、publishedAt | truthful source、服务端可维护分类/分页；结构化机会另列批准 contract，包括来源链接、类型、有效期/时区、截止日是否未知；Content owner，不实现推荐算法 |
| Mine summary | `/auth/me`、profile、现有 growth bootstrap、assessment history | 不为 Mine 首屏生成所有投影；Growth page 保留按需 bootstrap。商业可用性只读现有 `/commercial/meta`、`/me/credits`，不能在 onShow 自动 free-grant/pay；Identity/Growth/Commercial 原 owner 各自负责 |
| Teacher / Admin summary | `/me/teacher/students`、pending revisions、mobile-admin lists | 现有 admin 一次加载六类列表，不适合作首页异常指标；后续只读计数/列表分页/权限范围契约。无真实告警状态就不显示“待处理异常”；对应角色业务 owner |

目前 `/me/growth-profile/bootstrap` 已解决成长页请求扇出，不应再造第二个 growth 聚合。它在最新 20 条 assessment 输入中寻找首组未导入候选，且不是“成功评估存在性”接口；不能拿 pendingImport=null 判定无历史评估。

## 7. Canonical Profile reuse map

坚持：`Canonical Facts → Resume Projection → Application Projection → Human Gate`。简历/申请是确定性输出，不是平行事实库。

| 场景/字段 | 真实 source of truth | 可复用、确认及缺口 |
| --- | --- | --- |
| 身份、学校、专业、年级、GPA/均分、排名 | users/students 身份；user_profiles 基础学业字段，canonical loader 统一投影 | profile-edit 与 assessment 基础输入存在编辑重叠；position 是展示/入口，不另存档。学校/专业重复字段由 canonical 优先级解决，不由每页自行挑值 |
| Assessment 输入 | assessments.inputJson 的时点快照 | 新建可预填当前 profile，恢复草稿以草稿为准；历史成功结果不得用当前事实覆盖。当前表单基础字段失焦会同步 profile，后续 UX 必须明确写入范围 |
| 语言/科研/竞赛等经历 | growth_records（无已有规范表的经历事实） | 已有 assessment-preview/import-assessment，用户选择确认，source key 去重。导入候选不是模型 judgment。当前新评估表单未完整反向复用 growth 记录，需字段映射与冲突确认，不能静默覆盖 |
| 计划名称、目标、状态 | student_plans / plan_items / plan_revisions | “计划考到 600”不是“已考到 600”；老师审批不自动成为用户成绩。只将已完成且确认的实际事实映射 canonical，需独立语义契约 |
| 课表与课程 | schedule_imports.parsedJson | 有解析结果不代表创建了 canonical course/grade；Blueprint 的“如果已创建课程”在本基线尚不能当作既成事实。后续先定义课程身份、学分、成绩来源与确认，再复用选择项 |
| 简历 / Application | canonical profile projections | bootstrap 一次产生三种 resume 与 generic-recruitment-v1；DOCX 复用 projection；不重复收履历，输出适配不直接读原始 DB |
| 排名/成绩/目标变化 | 当前缺完整 canonical history | growth_records createdAt/updatedAt/确认字段不是不可变变更史；评估快照也不是权威连续变化日志。另行批准同一 canonical 模型的事件/版本扩展，不建第二套 biography |

Growth 读取与投影零 AI；自然语言抽取只能给待确认候选。高频更新优先复用现有经过验证的基础资料/经历写入；复杂成绩与 GPA 推导等待学校规则和契约，不能统一猜公式。已有缓存以用户/身份隔离，canonical 写后失效；资料修改不能污染别人的缓存或已生成的历史评估快照。

## 8. Plan mapping

| 组件 | 当前能力 | 迁移方式与限制 |
| --- | --- | --- |
| classroom | 学生阶段读取，当前阶段 plans、mentors、records；教师模式入口 | Plan 默认“现在”，由后端 students.currentStage 决定；未配置给真实提示，不静默降成大一上 |
| student_plans / plan_items | 分 stage/type；name、target、pending/in_progress/done | 保留结构；完成率只说明这些任务；没有真实 dueAt/grade/credits 字段 |
| plan_revisions | 学生提交 pending、老师批准/拒绝、老师直接正式保存；版本读取 | 明确 pending 与 approved，不把页面叠加显示的 pending 当作已批准事实；只保留最近 3 版，不能展示“完整大学成长轨迹” |
| plan-editor | 按 stage/type 编辑，studentId 进入 teacher mode；学生再读取 versions | 保留接口/保存语义；版本读取目前在 classroom 之后，可独立优化但不是 Phase 0 工作 |
| schedule_imports | 文件源/解析状态/parsedJson；latest 查询、临时 CloudBase 文件清理 | latest 是最近导入，不保证最近成功；解析结果未自动关联计划或 canonical 成绩，不能承诺一键成绩填报已可用 |
| teacher guidance / coaching_records | 师生关系、阶段记录、occurredAt | “最近老师记录”可以真实显示；“新/未读/已处理”需游标契约；生产 schema 单独 gate |

历史阶段降到 Plan 内二级选择，按需请求一个阶段，不在首屏循环拉全大学阶段。大三暑假当前 planTypes=[]；大四 internship 隐藏 guidance 的既有行为不得被 UX 改名顺带改变。学生无绑定/无阶段/无老师/无计划/服务不可用是不同状态，不能共用“暂无内容”掩盖原因。

老师更新通过既有审核状态与真实辅导记录进入 Plan/Home；如需“老师改了哪一项”，必须有明确版本 diff 和编辑者来源。`applyApprovedPlan` 会删除重建 plan_items，item id 不适合作为未经设计的永久成绩外键。

**规则 blocker：** CONSTITUTION.md:79 要求大三暑假前的假期包含英语、竞赛；`domain/classroom.ts` 的 HOLIDAY_PLANS 与当前前端 fallback/选项只含英语。Phase 0 不改两者、不调整测试来掩盖冲突；主控/Business owner 必须先明确规则修复批次。Shell 可保留现行为兼容桥，但 Plan 正式验收不能宣称已符合宪法。

其他独立 gates：老师/学生真机审核往返、coaching_records 生产 readiness、图片课表 Provider 配置、真实 `.xls` 文件回归。出现外部配置阻塞则记录，不在 Blueprint 中重建解析器/存储设施。

## 9. Opportunity migration

| 能力 | 真实现状 | 首批可展示 / 后续门槛 |
| --- | --- | --- |
| 服务号文章 | official account freepublish/batchget 同步到 news_posts，`/news` 读取，articleUrl 打开，必要时复制链接 | 显示真实标题/摘要/封面/发布时间/来源与文章入口；保留平台外跳 |
| 分类 | 前端依标题 inferTag，当前 tabs 为推荐/推免/科研/九辰；无服务端 tags 契约 | 不把“推荐”称为个性化匹配，不把标题推断当官方类型；未来服务端受控标签/人工运营 |
| 产品 | products/product-detail、bundled handbook 或 DB source | 服务说明，与机会/截止日分离；来源及 readiness 要真实；无购买授权不添加支付 |
| library | 混合 products＋news、本地搜索 | 可拆回两个真实来源；不是学校实体库，不衍生学校排名/项目资格 |
| 学校/项目/夏令营/预推免/政策 | 可能有相关主题文章，但无这些实体的统一结构化契约 | 只能称文章；未来需真实实体、来源、有效期、状态、人工维护责任 |
| deadline | 未有规范字段/更新时间/时区 | 不解析标题伪造截止日，不做倒计时。缺失显式未知 |
| teacher recommendation | 无推荐关系/理由/发出者/对象契约 | 不使用“老师为你推荐”“匹配度 95%”；后续授权关系与追溯后再做 |

Phase 1 只做 shell/入口兼容，学生机会槽继续承载真实文章及清晰的内容边界；不重写 News。Opportunity 专项批次可调整命名/分层，但有标签契约前不承诺筛选准确度。发现但不修：news 当前统一服务号来源显示需要核对实际 source；空响应可能保留旧列表，需专项测试旧值/空值/错误状态，不把过期内容当最新。

## 10. Hot file / ownership conflict map

下表 owner 为建议施工责任，不是已有并行授权。每个 owner 开工前重新 pull/status，其他 lane 不交叉改共享文件。页面 `/*` 包含 TS/WXML/WXSS/JSON；不能因为扩展名是 WXML 就认定业务无关。

符号：B=Business-sensitive，A=AI-sensitive（含评估输入/触发/结果契约），C=Commercial-sensitive，S=仅在限定范围可 UI-only，G=dependency 未解决前禁止改对应能力。

| 文件 / 文件组 | Blueprint owner | B | A | C | S / G 与交接限制 |
| --- | --- | --- | --- | --- | --- |
| app.json | Navigation | 是 | 间接 | 间接 | 非 UI-only；四槽与所有 switchTab 原子提交；G staff/角色/兼容验收 |
| app.wxss | Visual foundation | 间接 | 否 | 间接 | S 纯视觉但全局波及；G 各业务回归，禁止早期 sweep |
| app.ts | Navigation + Identity | 是 | 间接 | 间接 | 仅角色启动协调另批；保留 storage init/transport |
| index/* | Lifecycle Home | 是 | 是 | 是 | G snapshot；不能把占位改成假事实或自动评估/营销扣费 |
| position/* | Assessment UX + Navigation | 是 | 是 | 是 | 只降级入口；G AI 真机闭环，禁止更改 run/credit 语义 |
| classroom/* | Plan + Business | 是 | 否 | 否 | G 阶段规则裁决；shell 分支与学生业务不可相互覆盖 |
| plan-editor/* | Business / Plan | 是 | 否 | 否 | 审核/版本/teacherMode 非 UI-only；S 不影响提交的排版 |
| schedule-import/* | Business / Upload | 是 | 间接 | 否 | G parser/文件真机测试；不改 provider 或 CloudBase adapter |
| news/* | Opportunity + Navigation | 是 | 否 | 间接 | S 真实文章布局；G tags/deadline，保留 OA 打开 |
| profile/* | Mine + Identity | 是 | 是 | 是 | 角色菜单、退出/删号高风险；G 商业 readiness，禁止伪造余额 |
| profile-edit/* | Canonical + Identity | 是 | 间接 | 否 | binding/role/cache 写入敏感；不是单纯表单美化 |
| growth-profile/* | Canonical / Projection | 是 | 是 | 否 | G growth schema/DOCX 真机；导入确认、投影不另收事实 |
| assessment-form/* | Assessment UX（冻结核心） | 是 | 是 | 是 | 禁动 schema/run/草稿/收费；S 有界视觉且完整回归 |
| assessment-history/* | Assessment UX | 是 | 是 | 是 | draft/status/id 规则保持；重看零模型、零再扣费 |
| assessment-result/* | Assessment UX | 是 | 是 | 是 | evidence/免责声明不可裁掉；G 真机历史复看 |
| teacher-students/* | Teacher Experience + Business | 是 | 否 | 否 | 关系权限、审核与阶段选项不在 shell 批次重写 |
| admin/* | Admin Experience + Business | 是 | 否 | 间接 | 六类列表/编号/绑定/分配/资讯同步有写副作用；按 section 拆批 |
| products/*、product-detail/*、library/*、brand/* | Content / Mine | 是 | 否 | 是 | 产品介绍≠支付合同；S 排版/入口降级，保留 documentKey/客服 |
| login/* | Identity + Navigation | 是 | 间接 | 间接 | intent restore 与角色切换集中维护，禁止开放重定向 |
| utils/request* | API contract owner | 是 | 是 | 是 | 最高风险共享类型/鉴权/transport；只追加获批准合同，不顺手重构 |
| utils/auth*、session* | Identity owner | 是 | 是 | 是 | G 角色变更/401/账号切换测试；不得把本地 role 当授权 |
| utils/*profile*cache* | Canonical owner | 是 | 间接 | 否 | 用户隔离、过期/失效、stale 标注；不能复制新缓存真相源 |
| services/api/src/routes/classroom-workspace.ts、domain/classroom.ts | Business owner | 是 | 否 | 否 | 本轮禁止改；后续聚合与规则修复分开审批 |
| services/api/src/routes/growth-profile.ts、DB schema | Canonical / Data owner | 是 | 是 | 间接 | 本轮禁止改；新增历史需要独立 schema gate |
| Assessment runtime/provider/prompt、commercial routes/ledger/payment、ops/* | 原冻结 owner | 是 | 是 | 是 | G 冻结，本 Blueprint 不取得写权限，不部署/改生产配置 |

最危险的十个具体文件（按耦合风险，不是施工顺序）：

1. `apps/miniprogram/miniprogram/utils/request.ts`
2. `apps/miniprogram/miniprogram/utils/auth.ts`
3. `apps/miniprogram/miniprogram/app.json`
4. `apps/miniprogram/miniprogram/app.wxss`
5. `apps/miniprogram/miniprogram/pages/index/index.ts`
6. `apps/miniprogram/miniprogram/pages/classroom/classroom.ts`
7. `apps/miniprogram/miniprogram/pages/news/news.ts`
8. `apps/miniprogram/miniprogram/pages/profile/profile.ts`
9. `apps/miniprogram/miniprogram/pages/profile-edit/profile-edit.ts`
10. `apps/miniprogram/miniprogram/pages/assessment-form/assessment-form.ts`

## 11. Phase 1–6 migration batches

这里用 Batch 编号对应用户建议的六个施工主题；与已批准 Blueprint 的 Phase 编号不完全一一对应：其 Phase 3 为 Plan、Phase 4 为 Teacher/Admin、Phase 5 为 Visual、Phase 6 为真机总验收。不要因为下面 Batch 6 是视觉而跳过 Blueprint Phase 6 验收。每批授权后独立 commit，不捆绑 schema/生产上线；拆分子批也是独立测试和回滚单位。

| 批次 / 对应 Blueprint | 独立范围与依赖 | 测试 / 完成条件 | 回滚 |
| --- | --- | --- | --- |
| Batch 1 Navigation/Shell / Phase 1a | 固定四槽、角色标签/轻量角色入口、position 降级、旧 route/query 保留、登录恢复与角色协调。先明确 staff；不做 lifecycle 聚合/视觉 sweep | 小程序 typecheck；所有 19 页入口、五种导航、guest/user/student/teacher/admin 冷热启动；绑定、注销、401、角色切换、外部 id 链接、无返回栈；老师/admin 不看到学生私人页面 | 同一提交回退 app.json + 调用点 + shell，避免只恢复五 Tab 却留下新调用；不涉及数据库 |
| Batch 2 Lifecycle Home / Phase 1b | 先单独批准只读 snapshot 后端子批，再接 Home State 0–3 和明确的 State 4 降级；1–3 个真实行动 | 后端 typecheck/test/build；snapshot 权限/空值/失败/最新成功超过 50 条/高年级隐藏 mentors；前端请求数与重复加载、零 AI/零商业写入；无假 trend | UI 与 read-only endpoint 各可独立回退；不改变原业务写路由 |
| Batch 3 High-frequency profile / Phase 2 | 先复用既有 canonical 写入与确认导入、低频资料/高频经历入口分层；排名/成绩历史与课程映射另列 schema gate 后再做 | 资料→canonical→resume/application/DOCX 一致；重复导入幂等、用户确认、草稿优先、缓存隔离；未知 GPA 规则不算 delta | 回退交互不丢 canonical 数据；若以后新增历史只能 additive，禁止为回滚删用户事实 |
| Batch 4a Plan / Phase 3 | 默认现在/历史二级入口/真实审核与老师记录；依赖阶段规则裁决及 read-model | 全 stage/type、学生提交/老师批准拒绝/正式版、3 版边界、junior-summer、大四 guidance、导入失败/最新记录、无绑定/无阶段 | 只回退阅读/展示；规则修复独立业务提交，不混入 UX 回滚 |
| Batch 4b Opportunity / Phase 3 配套 | 单独提交，真实文章重分层、来源和空态、产品降级；无结构化机会就不做 deadline/recommendation | OA 打开/复制兜底、source、空响应/错误/旧缓存、product documentKey、library 兼容 | 保留 news_posts 与原同步；回退 UI，不删除内容数据 |
| Batch 5 Teacher/Admin / Phase 4 | 分 teacher、admin 两个独立子批，将旧二级能力进入稳定 shell；必要时批准只读计数/分页 | assignment 权限、越权 id、审核幂等、管理员 section、低权限拒绝、无虚假告警；不把 staff 默认为 admin | 回到 Batch 1 链接型 shell，原工作页仍可用 |
| Batch 6 Visual consolidation / Phase 5 | 业务稳定后按 design system 收敛 square-first、层级/排版/密度；限定组件/页面组分 commit | 页面截图、长中文/空错态/加载态、iOS/Android/字体放大、按钮与表单可达；所有高风险业务回归 | 纯视觉提交独立 revert，不夹带数据/路由/规则变更 |
| 最终真机 Gate / Phase 6 | 用户本人及指定老师/admin 按角色走完整链；与每批真机测试并行积累证据 | 评估草稿保存→离开→历史恢复→显式运行→结果→历史复看且无第二次模型/收费；规划审核、身份切换、OA、DOCX；商业仅在其独立 gate 通过后验收 | 不通过不发布相应能力；不以 mock 或代码检查代替真人验收 |

首个施工批次严格限 Batch 1：导航兼容与角色 shell。若 staff 定义或微信实机约束未确认，先做获得授权的验证，不直接提交半套新 tabBar。Home 聚合、Plan 规则修复、Growth history、支付、视觉均不挤入首批。

代码批次统一执行仓库可用的小程序检查：当前 `apps/miniprogram/package.json` 提供 `npm run typecheck`，没有独立 npm build/test 脚本，编译与导航交互另在微信开发者工具/真机验证，不声称存在未配置脚本。涉及 API 时必须 `npm run typecheck`、`npm test`、`npm run build` 加专项测试。docs-only 的本轮没有以代码测试代替 diff 范围证明，也没有声称跑过新真机验收。

## 12. Known blockers、待核实观察与 non-goals

### 开工依赖

1. Phase 1 尚未授权；本文件只交接施工地图。
2. `staff` 的角色导航归属需主控确认；不能凭现有 teacher-mode 合并推断产品批准。
3. 微信官方网页本轮不可访问；固定槽方案有本地官方类型依据，但 Phase 1 仍需官方配置约束复核与真实开发者工具/真机路由验证；外部二维码/运营 deep link 清单需运营提供。
4. Home 首评/assignment/current-stage 聚合缺契约；不能在前端用不完整列表/隐藏 mentors/默认年级猜生命周期。
5. 宪法与当前假期 planTypes 冲突阻塞 Plan 规则正式验收，需要独立 Business 决策；不阻塞纯文档交付。

### 分能力 gates，不扩大成全局阻塞

6. Assessment 生产 runtime 已闭环到 gate，剩用户本人真机最终流程验收；禁止以此为由再换模型/调 Prompt。
7. Growth production schema、DOCX 部署与真机验收独立；最新 handoff 还标出 docx 依赖锁文件同步风险，改 npm ci/锁定发布前由原 owner 核验。PDF deferred。
8. Commercial production schema、商户配置、批准 SKU/free grant 数量、回调与真机付款 gate 未完成；这不否认现有 server foundation，也不授权本轮启用收费或写 schema。
9. Coaching schema readiness、老师审核真机、图片课表 provider、真实 `.xls` 回归，以及产品 DB gate 按各 owner 单独处理。CloudBase Storage 保留。
10. rank/grade/change history、结构化 opportunity/deadline/recommendation 缺数据契约；首批用真实可用内容和明确不可用态，不伪造完整度。

静态观察、留待专项复现：login 无 intent restore；本地 role 缓存不能确保权威新鲜度；admin/form 无栈 navigateBack 兜底待验证；teacher-students 的阶段 fallback 不应成为 canonical 事实；news 空响应/来源文案可能误导；plan versions 读取失败被转成空列表时不能宣称“无历史”。本轮全部只记录，未修代码。

明确 non-goals：不改 app.json、tabBar、任何页面 TS/WXML/WXSS、backend/runtime/schema；不改 Assessment Provider/Prompt/model/evidence；不改 Credit Ledger/Payment/商业规则；不做客服 AI；不改微信客服/CloudBase Storage；不部署 ECS、不处理 NPM/HTTPS/生产 env、不执行 production schema write；不做推荐算法、假任务/假 deadline/假排名；不建第二套 Profile；不重写 News/Classroom；不开始 custom tabBar 或视觉 sweep；不提交私有案例或任何已有 untracked 文件。

## 13. 本轮验证与 Git 交接边界

起始 pull 已 fast-forward 到本文件开头的 baseline，仍在 `p1/foundation`。工作前已有未跟踪项：两个 assessment 部署 tar.gz、`services/api/cloudbaserc.json`、根目录私有案例投放包；均保持原样，不是本轮新增产物，不执行 cleanup。

唯一拟提交文件：`docs/handoff/experience-blueprint-phase0-map-2026-10-04.md`。提交前/后检查 `git status --short`、`git diff --stat`、staged diff，以及相对 baseline 的 `git diff -- apps/ services/ ops/`，要求受跟踪代码零变化；使用显式单文件 add，不用 `git add .`。文档提交后 commit SHA 由最终交接报告提供，不为回填自身 SHA 再造提交。

提交消息：`docs: map Experience Blueprint Phase 0`；仅 push `p1/foundation`，不建分支、不改 main、不 force push。不运行部署、迁移、支付或 AI 调用。此次 docs-only 验证不声称通过 runtime/test/build/真机验收。

本轮没有修改 Runtime / UI / Route / Backend / Schema；Experience Blueprint Phase 1 尚未开始。
