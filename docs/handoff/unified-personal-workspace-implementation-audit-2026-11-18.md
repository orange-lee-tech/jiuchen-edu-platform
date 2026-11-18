# 个人工作区实施前审计与无损迁移决策

状态：**设计门槛，未实施代码或数据库迁移**。施工分支 `codex/ux-consolidation-20261116`，审计起点 `460cc802d53b74dce3df38fb3059fcf479a3b994`。本页不表示生产状态。

## 已核对的归属与写入路径

| 数据 | 当前归属 | 现有行为与阻断 |
| --- | --- | --- |
| `users`、`user_profiles` | `users.id` / `user_profiles.user_id` | 账号资料可跨设备读取；尚无账号级当前阶段字段。 |
| `students` | 可空且唯一的 `students.user_id` | 当前阶段及自动/手动模式在 student 行；解绑清空关联后，账号无法再读取该阶段。 |
| `student_plans`、`plan_items` | 非空 `student_id`、`plan_id` | `PUT /me/classroom/plans/:stage/:type` 先按 student 找一份计划；更新时删除原任务并重建。无 student 的普通账号不能保存。表中没有阶段/类型唯一索引，也没有账号所有者字段。 |
| `plan_revisions` | 非空 `student_id` | 教师/学员历史必须保留，不能拿来充当普通账号的新规划主表。 |
| `schedule_imports` | 非空 `user_id`、可空 `student_id` | 读取和编辑使用会话 `userId`；创建入口额外要求 student。文件所有权、格式、解析和临时文件清理已有校验。 |
| `credit_ledger_entries` | `user_id` | 免费发放按账号锁和幂等键防重复；运行评估时按有效商业配置发放。当前 `freeGrant.amount` 可配置，不能仅凭现有代码证明 Unbound 固定为一次。 |

普通账号认领正式身份由 `POST /me/internal-id/claim` 在事务中更新 `users`、`internal_ids`、`students`；管理员追加身份另走 `bindAdditionalIdentity`。解绑由 `unbindMyIdentity` 清空 `students.user_id` 并更新身份状态。教师访问通过 assignment 检查；这些路径均需参与后续事务及权限测试。

## 最小迁移方向（尚未批准执行）

1. 在**现有** `student_plans` 增加可空账号所有者 `owner_user_id`，允许 `student_id` 为空；新 Unbound 计划只写会话账号 ID，不创建占位 student。对当前已关联 student 的历史计划可回填 owner，未认领 student 的计划继续只属于 student，不暴露给普通账号。原 `plan_items` 和 `plan_revisions` 保留；迁移需逐项检查外键、索引、字符集与重复执行。
2. 在现有 `user_profiles` 增加账号级 `current_stage`、`current_stage_mode`。已绑定账号从 student 字段回填；之后账号字段作为个人工作区真相源，正式 student 字段只作教师/旧接口兼容投影，并在同一事务同步。若两处现值冲突，迁移必须记录并停止该账号的自动选择，不静默覆盖。
3. `schedule_imports` 继续按 `user_id` 归属，新普通账号记录的 `student_id` 为 `NULL`。文件所有权和记录编辑校验保持现有服务端约束。
4. 绑定事务必须锁定账号、目标 student 和两侧同阶段/类型规划。冲突时不可调用现有“删除任务再插入”的保存函数。必须在保证两份标题、任务、目标、截止日期、状态、修订历史均可追溯的前提下，决定单卡显示与后续编辑规则；失败时整体回滚。解绑不能清除账号 owner，也不能重新发放免费额度。
5. 免费额度沿用账号账本锁与幂等键，但 Unbound 发放量须在服务端固定为一次，且核对历史已发放与历史评估，避免配置版本、身份切换、重新登录再次发放。正式学员现有额度逻辑保持独立。

## 暂停原因与待定规则

当账号计划和待绑定 student 计划在同一阶段/类型都存在时，两边可能有不同标题及任务。当前页面只显示一个标题和一组任务；当前保存函数会删除所选计划全部原任务。选择任一标题作为唯一可见标题、直接拼接任务或把一份计划隐藏，都会改变两侧原有内容的可见/编辑语义。需求要求“不丢字段、不覆盖教师维护数据、不出现重复可见卡片”，但尚未定义冲突时单卡如何展示两份标题、任务，以及后续编辑/删除影响哪份来源。账号阶段与预置 student 阶段不一致时也需要明确首次绑定的显示优先级。未明确前不写 migration、绑定合并或前端伪工作台。

建议产品确认：冲突时单卡内分组展示“个人计划”和“正式学员计划”，各自保留标题、任务和来源；编辑分别保存，教师权限继续仅作用于正式学员来源。阶段冲突时明确当前显示优先级，另一值保留可恢复。若要求合成一份可编辑计划，则需指定标题选择、任务去重/来源、删除语义及原始记录归档规则后再施工。

## 后续验证门槛

规则确定后，先在隔离 MySQL 中演练 migration 的旧行保留、重复执行、冲突事务回滚、绑定/解绑和跨账号隔离；再完成 API、Guest 回跳与统一 UI。Guest 的现有 `loginFor(..., retained)` 仅在旧 owner 等于登录后账号时 `navigateBack`，Guest 的 owner 为 `null`，当前流程会 `reLaunch` 并丢失页面实例；需改为仅内存保留当前页面、登录后返回且不自动提交。全部 API / 小程序检查及真机验证按需求交接执行。
