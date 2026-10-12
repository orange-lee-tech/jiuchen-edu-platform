# 资讯 V2：独立 Schema 与受控发布关口

状态：代码候选，本地测试；生产 DDL、timer、API 发布、微信体验版和真机验收均 **NOT RUN / BLOCKED**。本方案不授权执行生产操作。Profile 的单列迁移和支付账本建表须分别审批。

## 最小存储方案

现有 `news_posts` 保留正文、原文链接、审核标签和状态。新迁移 `services/api/src/db/upgrade-news-v2.ts` 创建七张小表，不回填或删除旧数据：

| 表 | 唯一键与用途 | 保留要求 |
| --- | --- | --- |
| `news_display_states` | `post_id` PK；正常/缓冲/退役/来源失效与缓冲、退役时间 | 历史窗口状态留存 |
| `news_favorites` | `(user_id,post_id)` PK；自己的收藏、标题和公众号原文快照 | 文章退役后仍保留；账号删除政策另行审议 |
| `news_retirement_batches` | 批次 UUID PK；新入与被挤出文章清单 | 事件审计留存 |
| `news_retirement_tasks` | `(batch_id,post_id)` 唯一；每篇独立状态/备注/操作者 | 已退役任务继续可见 |
| `news_retirement_reads` | `(batch_id,user_id)` PK；每位管理员一次性已读 | 跨登录保留 |
| `news_task_audit` | UUID PK；每次状态/备注变更 | 审计留存 |
| `news_sync_runs` | UUID PK、`checked_at` 索引；成功/部分/失败结果 | 不自动删除，待批准保留期限 |

外键均引用现有 `news_posts` / `users`；不执行物理退役删除，避免破坏收藏和任务。索引围绕用户收藏时间、窗口退役时间、任务状态和同步检查时间。最多 20 篇正常窗口；首次导入超过 20 篇的旧文章直接记为历史退役，不制造 72 小时缓冲或提醒。只有原先位于正常窗口、被新文章挤出者进入 72 小时缓冲，重复检查不刷新时间。来源抓取或存储不完整不推进窗口。若已审核标签更改，复核在同一个数据库事务和 advisory lock 下完成。手动文章保留现有展示路径，不占公众号20篇窗口。

旧 `published_at` 是源端 `update_time` 映射，不能当发表时间；V2 排序临时使用源端更新时间，并明确展示“发表时间待核实”。尚未找到服务号真发表字段；用户验收要求“真实发表日期”仍不能 PASS。撤回/来源失效尚无可验证的官方状态与回调；不得凭一次不完整列表将旧文章标成撤回。

## 生产前检查与备份（由已授权运维执行，记录脱敏结果）

1. 核对现役 immutable release、`/health`、MySQL 版本/会话时区、`news_posts` 和 `users` 的 PK 类型与约束；只读查询 `information_schema.tables/columns/key_column_usage` 检查七张表是否已存在、结构是否冲突。迁移脚本当前只验证表名；**若已有同名但结构不同的表，禁止运行，先修预检**。
2. 在非生产 MySQL 副本运行脚本两遍、核查结构及外键、模拟40篇导入/20篇窗口、72小时推进、收藏隔离和已读幂等。当前环境没有可用非生产数据库，该项未执行。
3. 以现行数据库备份机制生成受限访问的全库一致性备份和恢复点；用单独的隔离实例恢复并验证 `news_posts`、`users` 行数和新表（如已存在）。记录备份位置、校验值、恢复耗时、操作人；不得将备份或凭据上传 Git。
4. 审核 `services/api/src/db/upgrade-news-v2.ts` 七张表的精确 DDL 和备份证据，再单独批准 **News V2 DDL**。只在获批窗口运行 `npm run db:upgrade:news-v2`，重复执行前先核结构；运行后只读核对表、列、索引、外键及行数，无自动旧数据回填。
5. 经独立 API 发布批准，以现有 immutable release、`approved-release`、`READY`、`jiuchen-promote` 流程发布；先保持 `NEWS_V2_ENABLED` 关闭，检查旧 `/news` 和手动同步；确认迁移成功后经受控配置切换启用，核对一次完整源端扫描、窗口、审核标签、收藏、任务与权限负例。不能把整个集成分支无差别升至现役。
6. Timer 单元定义在 `ops/ecs/jiuchen-news-sync.{service,timer}`，每小时检查。安装/启用另需批准；检查 `systemctl list-timers`、一次 service 退出码、连续两次检查结果和业务 API；不能改官网、NPM 或端口。

回退先停用此独立 timer 和 V2 flag，再通过 approved release 流程回退 API；保留七张表和数据，避免丢失收藏与任务。**不执行 `DROP TABLE` 作为应用回滚。** 如需恢复数据库，只能在明确分析受影响写入、经另案授权后从验证过的备份恢复。

## 当前核对与验收

- 生产源端 `freepublish/batchget` 40/40 组，最新标题“月满中秋，清辉相伴｜九辰教育祝您中秋安康”；未证实 `update_time` 为发表时间，发布事件/回调未验证。
- 当前生产无七张 V2 表的只读逐表预检证据；不启用 flag。支付/账本三表也不存在，与本迁移无关。
- 代码本地 API typecheck/build + 190 测试 PASS；小程序 typecheck + 82 项回归 PASS（运行时应复核最新提交）。新路由权限和窗口规则有合成测试，非生产 MySQL、CI、生产请求、真机均须分别核对。
- 真机至少检验学生/老师/管理员收藏、原文官方跳转、20+缓冲、72小时、重复同步已读不再弹、任务历史；无真实可触发退役样本时如实标为未验收。
