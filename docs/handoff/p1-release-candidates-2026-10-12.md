# P1 独立发布候选（2026-10-12）

本页只定义候选边界，不授权生产 promote、DDL、timer 启用或微信正式发布。集成验证源码为 `efb6ac97cd593a118107f00a18dc49b67c3fad1c`，GitHub Actions [38265829840](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38265829840) PASS；**不得把该集成提交或整个 `p1/foundation` 无差别发布生产**。生产构建前必须重新读取 ECS active/rollback SHA，并从现役基线制作只含所列文件/提交的隔离候选。

## Release A：无新增 Schema 的 API 修复

- 精确源码：资讯基础 `fbf7fda`，统计 `9bda1b5`，身份只读投影 `47bc3bc`，本轮资讯确定性修复 `ab6843ba87867c5f9e5fe08d0ef4122f03770582`；集成验证点 `efb6ac97cd593a118107f00a18dc49b67c3fad1c`。
- API 文件：`services/api/src/services/{official-account,news,commercial-analytics,admin-identity-directory}.ts` 及对应测试，`services/api/src/routes/{news,mobile-admin}.ts`。小程序配套只取管理员资讯/统计/身份展示、请求合同和日期展示文件，不带 News V2 页面能力。
- Schema：只读现有 `news_posts`、`assessments`、`internal_ids`、`users`、`students`、`teachers`、`student_teacher_assignments`、`user_profiles`。支付三表允许不存在；不存在时来源状态为 error/unavailable，不能显示为 0。无 DDL。
- 开关：隔离候选必须保持 `NEWS_V2_ENABLED` 未设置/关闭；不得因本候选开启支付、额度或改变 Assessment Runtime/Provider。
- 运行环境：沿用 Node/MySQL/服务号凭据；无新增 npm runtime 依赖。服务号网络/权限错误返回失败或 partial，不删除已有文章。
- 自动化验证：API typecheck/build，196/196；小程序 typecheck，82/82；分页、短页截断、错误、去重、标签保持、未分类服务端隔离、北京时间统计、支付缺表、身份状态/授权负例均覆盖。
- 发布前回归：在隔离环境验证匿名/学员看不到未分类文章，老师/管理员可审核；成功评估仍计数而支付不可用；未认领/已认领未分配/待完善/暂停状态；既有课表与 AI 评估路径不变。
- ECS 步骤：只读记录当前 active/rollback → 从已确认生产基线构造隔离候选 → `npm install`/typecheck/test/build → 校验 service user 可读与 256 MiB 限制 → 用户批准后走 `approved-release`/`READY`/`jiuchen-promote`，禁止手改 `current`。
- 健康检查：`/health/live`、`/health`、`/health/config`，随后只读 `/news`、管理员统计/身份授权正负例；手动同步 POST 需独立业务确认。
- 回滚：切回发布前 immutable release，只重启 `jiuchen-api.service`；本候选无数据库回滚。
- 待批准：隔离候选 SHA、生产 promote、管理员手动同步与微信体验版。

## Release B：Profile 单列迁移

- 精确源码：`943f07f36d4acc2d1e5a4ded6ffc4683927cf169`。
- 文件：`services/api/src/db/{profile-schema-contract,check-profile-foundation,upgrade-enrollment-year}.ts` 及测试、`services/api/src/routes/profile.test.ts`、`services/api/package.json` 脚本。
- Schema：仅在 `user_profiles` 其余合同完全兼容且唯一缺列时允许 `ALTER TABLE user_profiles ADD COLUMN enrollment_year INT NULL AFTER current_grade`。
- 开关：无功能开关；不得运行全量 `db:push`/`db:migrate`。
- 运行环境：授权的数据库连接、受限一致性备份、隔离恢复目标和可用 MySQL 客户端；凭据不得出现在命令行或日志。
- 自动化验证：Profile 合同、GET/PUT/GET、鉴权/旧 null 档案测试已包含在 API 196/196。
- 发布前回归：只读 `db:check:profile`；备份并在隔离实例恢复验证；迁移脚本跑一次后再跑一次确认幂等；登录用户保存/回读 enrollment year，越权请求拒绝。
- ECS 步骤：先单独批准备份与精确 DDL；迁移后只读检查，再以独立 API 候选发布。不得从当前集成分支直接 promote。
- 健康检查：API 三健康端点、Profile authenticated GET/PUT/GET、既有学业字段不变。
- 回滚：代码回退到前一 immutable release；新增 nullable 列通常保留。恢复/删除列属于另一个破坏性审批，不能作为自动回滚。
- 待批准：备份方案、恢复证据、精确 DDL、迁移窗口、API promote。

## Release C：News V2

- 精确源码：核心 `b2622e9`，UTC/不完整扫描保护 `a2f4a7f`，时间语义 `cb67374`，小程序 `14da4ca`，迁移合同/权限回归 `eb93671346a2ceb82a99bf491ba2d77100aabee7`；集成验证点 `efb6ac97cd593a118107f00a18dc49b67c3fad1c`。
- 文件：`services/api/src/{db/upgrade-news-v2,routes/news-v2,services/news-lifecycle,services/news-v2-store}.ts`、`services/api/src/db/news-v2-schema-contract.ts` 及测试、相关 app/env/news/mobile-admin 接线，小程序收藏/退役 UI，`ops/ecs/jiuchen-news-sync.{service,timer}`。
- Schema：七表 `news_display_states`、`news_favorites`、`news_retirement_batches`、`news_retirement_tasks`、`news_retirement_reads`、`news_task_audit`、`news_sync_runs`。迁移前后验证列类型/nullability、PK/唯一/普通索引、FK；基础 `users.id`/`news_posts.id` 必须同为 InnoDB utf8mb4 varchar(36) 且字符序一致。
- 开关：`NEWS_V2_ENABLED` 默认关闭；Schema 验证和 API 发布后仍保持关闭，另行批准才开启。timer 安装/enable 是第三个独立批准动作。
- 运行环境：先提供明确的非生产 MySQL；生产前须验证备份恢复。timer 为 hourly、`Persistent=true`、随机延迟 60 秒、oneshot 300 秒上限、256 MiB。
- 自动化验证：20 篇窗口、72 小时、重复同步、来源不完整不退役、收藏鉴权、学生/老师不能写任务、多管理员已读 user-scope、管理员备注 actor 审计、七表漂移阻断均已通过合成测试。
- 发布前回归：非生产迁移执行两次；模拟 40 篇及标签变化；检查退役后收藏保留、多管理员一次性已读、备注/审计、旧 `/news` 在 flag off 时不变。
- ECS 步骤：非生产验收 → 生产备份/恢复证据 → 单独 DDL 批准并迁移/只读验结构 → 发布 API 且 flag off → 批准后开 flag → 业务验收 → 最后单独安装/启用 timer。
- 健康检查：API 三健康端点、旧 `/news`、V2 列表/详情/收藏/任务正负例、一次完整源端扫描、两次 timer 结果及 `systemctl list-timers`。
- 回滚：先 disable/stop 独立 timer，再关闭 flag，再回退 API；保留七表和数据，不 `DROP TABLE`。数据库恢复只在另案批准后进行。
- 待批准：非生产数据库、生产备份/恢复、七表 DDL、API promote、flag、timer、微信体验版/真机。

## 当前外部证据边界

2026-10-12 本轮公开只读检查：`/health/live`、`/health`、`/health/config` 均成功，环境为 production、数据库为 ok、公开 release 字段为 `0.3.0-experience`；公开端点不返回 Git SHA，因此现役 commit 仍只能引用此前 ECS 只读回执 `b150d2c5c8720aac8d48fbd0395d8db9c408bc63`，不能声称本轮重新核实了 active SHA。当前没有可确认的非生产 MySQL，Release B/C 的迁移实跑均未执行。
