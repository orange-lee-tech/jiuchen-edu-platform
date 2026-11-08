# 九辰教育当前交接｜2026-11-08｜Batch A/B/C 合并与 API 生产发布完成

> 本页是 2026-11-08 主分支与 API 生产发布的当前交接。生产发布成功的依据为管理员提供的 ECS 执行回执；仍不能推定微信真机、业务读写、AI 全链路或商户真实交易全部验收。

## GitHub（本轮实时核验）

- PR [#14](https://github.com/orange-lee-tech/jiuchen-edu-platform/pull/14) 已合并到 `main`，合并提交 **`cfb0f85c39b44b8a8a2726c26108e465da6f9a45`**，其第二父提交为功能分支最终 SHA `217934e00898c002f741b49511e46a41c209e4bc`。本轮**已经部署的 API 源码**固定使用合并提交 `cfb0f85...`；本页后续 docs-only commit 不自动替代此 API 候选。
- [CI run 42448515423](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/42448515423) **completed/success**；`verify` 成功。此前本地/CI 核对包括小程序回归 **167/167**、管理端 **2/2**、API **355/355**，及隔离 MySQL 验证。仅证明代码与门禁，不代表生产业务验收。
- Batch A/B 完成首页、规划、课表、机会与个人页 UI/交互重组；Batch C 完成课程事实录入、确认成绩/学分、成长档案与 AI 评估上下文集成。参见 [Batch A 验收](batch-a-acceptance-2026-11-07.md) 和 [Batch C 合同](batch-c-course-contract-2026-11-07.md)。
- PR #14 的修复包含：将支付回归改为调用真实 credit-wallet 组件、资讯标签和搜索输入防御、课表账号切换去重、与新 UI 对齐的行为测试、MySQL 临时表与 `internship + custom` 规划断言。**禁止因旧测试而恢复已批准淘汰的 UI。**

## 数据库与备份（依据用户现场回执）

- 生产 MySQL 为 CloudBase `cloud1-d3geim00r03edb212`，与 ECS API 的现役连接指向相同数据库。
- 用户明确授权**仅新增** `growth_records`。新增后回执：**56 张表**；`growth_records` 为 **25 列**、`source_key` 唯一索引、`user_id` 关联 `users.id`、表排序规则 `utf8mb3_general_ci`，初始 **0 行**。没有获批其他 DDL。**不得再次盲跑 `db:upgrade:growth-profile`**。
- 2026-11-08 用户 WSL 新一代七组件加密备份 `~/jiuchen-backups/20261108-055750-dac461` 已完成下载与认证校验 `KNOWN_COMPONENTS_DOWNLOAD_VERIFIED`，隔离 MySQL 8 演练返回 `ISOLATED_SQL_IMPORT_AND_CHECK_PASS`，**56 张表**、`productionWrites=false`。此验证是 SQL 导入和物理表存在性检查，**没有证明源库逐行一致或所有业务数据完整性**。旧 2026-11-07 的 55 表恢复点保留。备份文件和密码严禁进入 Git、日志或聊天。
- 历史检查发现 ECS→CloudBase MySQL 现役链路没有 MySQL TLS；不得宣称端到端加密，不在 API 发布中顺带改网络。见[手动备份规范](../ops/manual-backup-and-selective-restore.md)。

## ECS 发布候选与门禁

- 2026-11-08 13:34:46 +08 用户 ECS 只读预检回执：现役 API 精确 SHA `4250785eb709d198742453762fa52f5d0524b62e`（current/COMMIT_SHA 一致）、previous `03bc43b7ebe648b310a2499a1d77fba86e5e6623`（目录存在）；service active、MemoryMax=256MiB、CPUQuota=50%、TasksMax=64、环境文件 root:root 600；READY 缺席；目标 release 尚不存在；`jiuchen-promote` 工具位于 `/usr/local/sbin/jiuchen-promote`，sha256 `6894b6b85242a1fcff4d6e8ad548704215ce946dfe44b3f78ebae74ef3f3ee24`；内网及公网 API 200，官网 200，余量约 17.3GiB 磁盘、~1.0GiB 可用内存。**仅为只读预检，未切流。**
- 用户已批准且执行固定 API 发布：`cfb0f85c39b44b8a8a2726c26108e465da6f9a45`。下方“本轮生产切流回执”是最新事实；上述 13:34 的 ECS 只读预检描述的是切流前旧状态。
- 发布只可更改 `/opt/jiuchen-api` 内候选 release 和 `jiuchen-api.service`，保持 3100 内网端口、资源限制、现役密钥文件不变。**不得重建或绕过 approved-release / READY / promotion 门禁**；若现场工具与旧记录不符，停在只读预检并记录。禁止修改官网、NPM、Harbor、Portainer、Docker、系统代理、其他服务及 CloudBase 数据库。
- 任何脚本必须核实 root-owned 不可变 release、服务用户真实可读、`/health/live` 和 `/health`、生产 DB 已知结构、回滚 SHA 和官网不变。审查依据：[ECS 运维约束](../../ops/ecs/AGENTS.md)、[后端工程地图](../ops/miniprogram-backend-engineering-map.md)。
- 当前 **`CODE=MERGED`、`CI=PASS`、`DB STRUCTURE=PASS（用户现场回执）`、`56-TABLE BACKUP+ISOLATED IMPORT=PASS`、`ECS PROMOTE=PASS`、`API HEALTH=PASS`、`DEVICE=待验`、`BUSINESS WRITE/AI/PAYMENT=待验`**。

## 2026-11-08 本轮生产切流回执（管理员 ECS 实跑）

- **应用候选固定源码 SHA：** `cfb0f85c39b44b8a8a2726c26108e465da6f9a45`；独立 release：`/opt/jiuchen-api/releases/cfb0f85c39b44b8a8a2726c26108e465da6f9a45`。GitHub 后续 docs-only 提交不等于生产运行代码更换。
- **构建/隔离验收：** 源码归档 Git blob 完整性、归档清单、ECS 受限构建 Node 22 TypeScript、`RELEASE_LINK_BOUNDARY_PASS`、`RELEASE_TYPECHECK_AND_BUILD_PASS`、`CANDIDATE_BOUNDED_NO_DB_SMOKE_PASS`；候选安装完成后 `PRODUCTION_CURRENT_UNCHANGED`，直到正式发布动作。
- **生产数据库只读结构：** `growth_records` 检查 25 列、4 个必要索引、`user_id → users.id` 外键全部通过，`issueCount=0`，`PRODUCTION_GROWTH_SCHEMA_ALIAS_CHECK_PASS`。此次**没有执行 DDL**。
- **已定位的诊断器缺陷：** `services/api/src/db/growth-profile-schema-contract.ts` 对 `information_schema` 结果使用 `row.column_name` 等小写属性，但现场驱动实际字段名格式不同，导致原诊断虚报 25 个缺失列、4 个索引和 1 个外键缺失。采用 SQL 显式别名的只读复核通过；**源码检查器仍待独立代码修复与回归**，不对已运行的固定 release 原地打补丁。
- **配置权限收紧：** 切流前 `/etc/jiuchen-api/runtime.conf` 原权限 `root:root 644`，发布安全门禁拒绝；管理员获知后将权限收紧至 `600` 再次执行。不得从此推论配置内容或密钥曾泄漏。
- **正式执行回执：** `EXACT_SHA_AND_PROMOTER_PREFLIGHT_PASS`、`PREPROMOTION_GROWTH_SCHEMA_READONLY_PASS`、`APPROVED_SHA_AND_READY_WRITTEN=FIXED_CANDIDATE`，**`PROMOTE_OK active=cfb0f85c39b44b8a8a2726c26108e465da6f9a45 previous=4250785eb709d198742453762fa52f5d0524b62e`**。
- **切流后验证：** 内网 `/health/live`、`/health` 均 HTTP 200；公网 API HTTP 200；官网 HTTP 200、`WEBSITE_ROOT_UNCHANGED=PASS`；新课程事实接口未认证 HTTP 401、成长档案未认证 HTTP 401；`FINAL_API_SHA` 与目标 SHA 一致；总标志 **`PRODUCTION_API_PROMOTION_AND_HEALTH_PASS`**。
- **第一回滚 SHA：** `4250785eb709d198742453762fa52f5d0524b62e`（由 promotion 回执明确给出）。**没有执行回滚演练**；真实回滚需按受控发布契约操作。
- **验收边界：** 此回执证明九辰 API 切流和基础可用性通过；不等于新课程学业事实的认证读写成功、AI 模型完整评估、支付真实交易、微信真机、正式微信版本同步均通过。ECS 共享服务与生产数据库不应顺手调整。

## GitHub 分支整理

2026-11-08 清理前：远端三条分支、开放 PR 为 0。清理后：**远端仅 `main`**，归档标签已验证解引用至 `81d9de7827d5d96c6508acf1103ed8e7f720adaa`。前者已完整合入 main；checkpoint 的独有早期首页/规划提交 `81d9de7827d5d96c6508acf1103ed8e7f720adaa` 已由管理员建立归档标签 `archive/2026-11-08/codex/ux-batch-a-checkpoint-20261106`。2026-11-08 管理员 PowerShell 回执：两条远端功能分支均经固定 SHA lease 剪除，最终远端仅 `main`；本地 `project.config.json` 改动与四个 stash 保留。见[精确清理与回执](github-branch-prune-2026-11-08.md)。

## 下一轮验收

1. ECS 切流和基础健康已完成；保留并监控本轮新 API 的服务健康、资源消耗和错误率。如真实业务失败，优先依据已记录的 previous SHA 规划受控回滚，不得盲目重试数据库迁移。
2. 新 API 和 CloudBase 的课程事实、成长档案、评估上下文与学期规划接口，覆盖本人/他人和只读角色边界。
3. 微信开发者工具/真机四 Tab 及课程学分成绩、资讯、AI 评估完整链路。
4. 虚拟支付真实交易与账本、AI 服务商响应/计费分别核实；不以 CI 模拟交易作为商业验收。
