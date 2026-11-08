# 九辰教育当前交接｜2026-11-08｜Batch A/B/C 合并与 API 发布待核

> 此页为当前优先状态，替代 2026-11-01 状态页的“最新”定位。区分 GitHub 实时核验、用户生产回执与尚未执行的动作。源代码合并/CI 通过不能视为 ECS、微信真机或商户验收通过。

## GitHub（本轮实时核验）

- PR [#14](https://github.com/orange-lee-tech/jiuchen-edu-platform/pull/14) 已合并到 `main`，合并提交 **`cfb0f85c39b44b8a8a2726c26108e465da6f9a45`**，其第二父提交为功能分支最终 SHA `217934e00898c002f741b49511e46a41c209e4bc`。本轮拟发布的**应用源码**固定使用合并提交 `cfb0f85...`；本页后续 docs-only commit 不自动替代此 API 候选。
- [CI run 42448515423](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/42448515423) **completed/success**；`verify` 成功。此前本地/CI 核对包括小程序回归 **167/167**、管理端 **2/2**、API **355/355**，及隔离 MySQL 验证。仅证明代码与门禁，不代表生产业务验收。
- Batch A/B 完成首页、规划、课表、机会与个人页 UI/交互重组；Batch C 完成课程事实录入、确认成绩/学分、成长档案与 AI 评估上下文集成。参见 [Batch A 验收](batch-a-acceptance-2026-11-07.md) 和 [Batch C 合同](batch-c-course-contract-2026-11-07.md)。
- PR #14 的修复包含：将支付回归改为调用真实 credit-wallet 组件、资讯标签和搜索输入防御、课表账号切换去重、与新 UI 对齐的行为测试、MySQL 临时表与 `internship + custom` 规划断言。**禁止因旧测试而恢复已批准淘汰的 UI。**

## 数据库与备份（依据用户现场回执）

- 生产 MySQL 为 CloudBase `cloud1-d3geim00r03edb212`，与 ECS API 的现役连接指向相同数据库。
- 用户明确授权**仅新增** `growth_records`。新增后回执：**56 张表**；`growth_records` 为 **25 列**、`source_key` 唯一索引、`user_id` 关联 `users.id`、表排序规则 `utf8mb3_general_ci`，初始 **0 行**。没有获批其他 DDL。**不得再次盲跑 `db:upgrade:growth-profile`**。
- 2026-11-07 用户 WSL 全组件加密备份 `~/jiuchen-backups/20261107-152318-619f5d` 已完成校验，隔离恢复当时 55 张表通过。**此备份早于 `growth_records` 新增；需要更新恢复点时管理员应先作新备份并核验。**备份与密码不进 GitHub 或聊天。
- 历史检查发现 ECS→CloudBase MySQL 现役链路没有 MySQL TLS；不得宣称端到端加密，不在 API 发布中顺带改网络。见[手动备份规范](../ops/manual-backup-and-selective-restore.md)。

## ECS 发布候选与门禁

- 2026-11-01 的用户现场记录显示上一轮现役 API 是 `4250785eb709d198742453762fa52f5d0524b62e`；**本轮尚无 ECS 实时只读回执**。实际现役 SHA、previous、资源限制及启动状态必须重新核实。
- 用户已允许开始新版 API 发布流程；待确认发布范围是固定应用源码 `cfb0f85c39b44b8a8a2726c26108e465da6f9a45`。先读 ECS `current`、`jiuchen-api.service`、官网只读健康、现役 promotion 工具、恢复点、数据库结构和权限；再独立 staging 构建、校验归档、生产切流及失败回滚。
- 发布只可更改 `/opt/jiuchen-api` 内候选 release 和 `jiuchen-api.service`，保持 3100 内网端口、资源限制、现役密钥文件不变。**不得重建或绕过 approved-release / READY / promotion 门禁**；若现场工具与旧记录不符，停在只读预检并记录。禁止修改官网、NPM、Harbor、Portainer、Docker、系统代理、其他服务及 CloudBase 数据库。
- 任何脚本必须核实 root-owned 不可变 release、服务用户真实可读、`/health/live` 和 `/health`、生产 DB 已知结构、回滚 SHA 和官网不变。审查依据：[ECS 运维约束](../../ops/ecs/AGENTS.md)、[后端工程地图](../ops/miniprogram-backend-engineering-map.md)。
- 当前 **`CODE=MERGED`、`CI=PASS`、`DB STRUCTURE=PASS（用户回执）`、`ECS PRECHECK=PENDING`、`ECS PROMOTE=PENDING`、`DEVICE=PENDING`**。

## GitHub 分支整理

2026-11-08 核验：远端只有 `main`、`codex/ux-batch-a-20261106`、`codex/ux-batch-a-checkpoint-20261106`，开放 PR 为 0。前者零独有提交，可删；checkpoint 相对 main 有一条独有的早期首页/规划提交 `81d9de7827d5d96c6508acf1103ed8e7f720adaa`，必须**先打归档 tag 再删**，不可把旧 UI 合并回 main。见[精确清理操作](github-branch-prune-2026-11-08.md)。本页写入时**尚未完成远端删除**。

## 下一轮验收

1. 真实 ECS 只读预检，固定 SHA 构建、候选 smoke、受控 promotion 和回滚回执。
2. 新 API 和 CloudBase 的课程事实、成长档案、评估上下文与学期规划接口，覆盖本人/他人和只读角色边界。
3. 微信开发者工具/真机四 Tab 及课程学分成绩、资讯、AI 评估完整链路。
4. 虚拟支付真实交易与账本、AI 服务商响应/计费分别核实；不以 CI 模拟交易作为商业验收。
