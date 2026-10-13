# 2026-10-13 | Release B / C 生产变更前人工关口

本文件仅准备审批材料；**不授权 ECS 操作、生产 DDL、数据备份读取、数据库快照或新的 API 发布**。执行前重新确认 `docs/handoff/CURRENT.md` 和真实 ECS 状态。

## 已完成的无需重复事项

- Release A `8cc4bb85ffdf3e86e7a13a89d119f1b110491e48` 已获批准并 `PROMOTE_OK`；回滚为 `b150d2c5c8720aac8d48fbd0395d8db9c408bc63`，不得将 `p1/foundation` 直接发布生产。
- Release B 一次性 GitHub Actions MySQL 8 环境：单列迁移运行两次、完整列契约、旧记录不丢失及新增年份往返通过（[38337530468](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38337530468)）。
- Release C 一次性 GitHub Actions MySQL 8 环境：七表迁移运行两次、结构/索引/FK、收藏/退役批次/任务/已读/审计/同步表数据与外键负例通过（[38337158353](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38337158353)）。
- 两者只是隔离最小数据集，不等于生产库备份/恢复或生产 DDL 演练。

## 先执行的人工前置调查：只读，不动 ECS 服务

1. 确认线上 MySQL 当前由谁管理、存放位置/云服务提供商、现有自动备份/快照及 PITR 能力，尤其是否腾讯云 CloudBase MySQL；不要把数据库和 ECS 同机作为先验。
2. 查看真实生产库中 `user_profiles` 与 `users` / `news_posts` 的结构、引擎、索引及字符序，只汇报脱敏的结构结论，不导出学生记录；若存在偏差，阻止直接 DDL。
3. 明确受限一致性备份如何导出到**独立存储**，如何在**隔离且完全不能连接生产库**的临时 MySQL 8 中真实恢复，并记录恢复校验。不要将生产明文学生信息传到 GitHub Actions。
4. 只在上面三项确认后形成各自精确审批文本和变更窗口，不混用 B / C。

## Release B 独立申请（必须单独批准）

先在备份恢复后的隔离库运行 `npm run db:check:profile` 或等价只读核对；**仅当唯一缺少 enrollment_year 且其余字段合同兼容时**才允许申请以下精确 DDL：

```sql
ALTER TABLE user_profiles ADD COLUMN enrollment_year INT NULL AFTER current_grade;
```

完成后再次检查合同和认证态 GET/PUT/GET；旧值不得改变。原代码回滚不会删除该列，若需删除列必须另案审批；一旦证据不符立即 STOP。由于未获授权，当前状态为 `TEST PASS / PROD APPROVAL PENDING`。

## Release C 独立申请（必须单独批准）

待验证真实备份恢复后才审阅并单独批准 `services/api/src/db/upgrade-news-v2.ts` 中的七条 `CREATE TABLE IF NOT EXISTS`：`news_display_states`、`news_favorites`、`news_retirement_batches`、`news_retirement_tasks`、`news_retirement_reads`、`news_task_audit`、`news_sync_runs`。真实生产的 `users.id` 和 `news_posts.id` 必须是 InnoDB / utf8mb4 / VARCHAR(36)，并且字符序一致。

生产 DDL 授权、隔离 API 发布且 `NEWS_V2_ENABLED=OFF`、功能开关开启、timer 调整和微信体验版均为**不同审批动作**。不得在 DDL 时顺便更改现役 30 分钟 timer。回滚以停用新功能开关和回退代码为主，保留新增数据表，不自动 DROP。

## 施工继续原则

- 未获得备份/恢复证据时，可继续前端 UI、权限负例、源扫描/72小时业务测试、文档和独立分支构建。
- 最终真机验收统一安排；不以自动 CI 代替真机，也不把 B/C 数据库测试写为已经生产部署。
- 任何脱敏检查结果必须记录操作时间、数据库实例指纹/平台、操作者、实际版本和核对结果，不输出凭据。
