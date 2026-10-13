# CURRENT — 九辰教育唯一活跃主控交接（2026-10-12 晚）

> **这是唯一当前施工入口。** 历史原文已无损归档至 [archive/CURRENT-pre-cleanup-2026-10-12.md](archive/CURRENT-pre-cleanup-2026-10-12.md)。旧交接里的 SHA、日期、未完成清单、阶段禁令与部署描述**不是当前事实或当前授权**；不要再往本文顶部堆积“覆盖说明”。每轮只修订相应表格和 Gate，保留 Git 历史即可。
>
> **证据边界**：生产现状为 2026-10-12 已收到的只读 ECS 回执及用户真机确认；不等于本文件写入时重新连接 ECS。GitHub 集成分支已提交的代码不等于 ECS 已部署。Work/Codex 须重新读取 HEAD、CI、生产 active release，禁止根据下列历史 SHA 强行切流。

> **成本审计入口（2026-10-13）**：[ECS + CloudBase + OCR + 百炼经济账与防超支审计](../finance/cloud-cost-audit-2026-10-13.md)。ECS 实际付费及续费金额仍待阿里云订单证据；本文不授权采购、计费开关或生产改动。

## 0. 决策权与固定红线

- 仓库：`orange-lee-tech/jiuchen-edu-platform`；唯一日常施工分支：`p1/foundation`；正式 `main`、分支删除/合并、force-push 均无自动授权。
- 开工阅读：`CONSTITUTION.md` → `AGENTS.md` → **本文** → 本轮模块契约、源码、相关最新交接。`ops/ecs/AGENTS.md` 在碰 ECS 前必读。避免拿 10 月 9 日 Phase 1a 或旧部署文件当唯一新任务。
- **工程默认先验证再切流**。严禁擅自更改公司官网、Nginx Proxy Manager、Harbor、Portainer、Docker、80/443/8088 端口、密钥和微信正式支付。
- 不擅改 AI Runtime、模型/Prompt/RAG、评估结果契约、已通过真机验收的课表链路；不扩大跨身份只读权限。
- 未经逐项明确批准，不执行生产数据库 DDL / 历史数据改写、生产 API promote、定时任务安装启用、正式微信发布。不可变 release 使用现有 approved-release / staging READY / jiuchen-promote 自动健康/回滚机制，禁止手动编辑 `current`。
- 不直接把集成分支全部打成生产 release：其中包含尚未获独立生产授权的 News V2/支付等代码。每次发布必须核对精确改动、依赖 Schema、开关默认值、授权负例、资源预算与回滚版本。
- 不把接口失败当成 0，不虚构实名、消费、余额、公众号发布时间、收费结果；不能把 CODE COMPLETE / CI PASS 写成 DEPLOYED / DEVICE PASS。
- 对某项阻塞最多做一轮证据驱动诊断和一轮受控修复尝试；仍需外部授权或证据时登记 **PARKED**，停止围着钉子户无限重试，继续其他独立任务。安全或生产核心功能回归时应立即 STOP/ROLLBACK，不适用“跳过继续上线”。

## 1. 已验证生产和真机事实（不要重复施工）

| 项目 | 最新可靠证据 | 状态 |
| --- | --- | --- |
| 生产 API | 10-13 用户 ECS 实测：Release A `8cc4bb85ffdf3e86e7a13a89d119f1b110491e48` 已 `PROMOTE_OK`，`current` / `approved-release` 均指向该版；`previous-release` 为 `b150d2c5c8720aac8d48fbd0395d8db9c408bc63`；`/health/live` HTTP 200、`/health` database=ok；API ActiveState=active、NRestarts=0，MemoryCurrent=68567040 / MemoryMax=268435456；仍待业务验收 | OBSERVED（不是最新 Git HEAD） |
| 课表 | 导入、第一周周一保存、`大四上 → 本周课表` 手机实测 | **DEVICE PASS** |
| AI 评估 | 用户明确确认草稿→真实运行→结果持久化→历史重开完整链路 | **DEVICE PASS** |
| 院校图片 | 172 所 WebP 在真机正确显示（用户确认） | **DEVICE PASS** |
| 客服基础链路 | 已有企业微信人工客服联通；新增上下文复制另验 | BASELINE PASS |
| 生产评估样本 | 只读 SQL：成功9、失败5、草稿1；9个成功均有 `completed_at` | OBSERVED |
| 生产账号 | `internal_ids` 32个；存在未认领、已认领未分配和管理员样本，其他角色样本不足 | OBSERVED |
| 资讯来源 | 微信 `freepublish/batchget` 只读取得40组，无截断；来源更新时间有值但不等于已证实的发表时间 | OBSERVED |
| 支付统计 | 生产 `payment_orders`、`credit_ledger_entries`、`credit_reservations` 均缺表 | SOURCE UNAVAILABLE（绝非0） |

依据：[真实数据审计](real-data-audit-2026-10-12.md)、[本轮 Closeout](real-data-closeout-2026-10-12.md)。更早的生产 SHA / bug 日志在历史归档，不再作为现役指令。

## 2. 当前模块 Gate（最新）

| 模块 | GitHub / 测试状态 | 生产与验收状态 | 下一动作 |
| --- | --- | --- | --- |
| Profile `enrollment_year` | 单列幂等升级脚本及契约检查已存在 | **BLOCKED**：生产列确实不存在，`GET /me/profile` 曾500 | 单独备份+恢复验证+精确DDL审批；不影响其他独立开发 |
| 资讯同步分页/真实回执/标签公开控制 | `fbf7fda` + `ab6843b`；短页 fail-closed、可信源时间排序；本地通过 | **API DEPLOYED 2026-10-13 / DEVICE & DATA PENDING** | 等新版首次 timer 同步日志与真实后台、学员资讯数据验收；不可因旧日志 total=21 冒称新版验收 |
| AI 评估后台统计解耦 | 已提交 `9bda1b5`；真实9条成功记录 | **API DEPLOYED / DATA ACCEPTANCE PENDING**；支付数据源缺表 | 核查管理员真实周/月/年评估统计，支付仍显示来源不可用 |
| 身份只读投影/筛选 | `47bc3bc`、`4a91cbc` 候选 | **API DEPLOYED / UI & ROLE SAMPLES PENDING**；实名/教师分配样本缺 | 按角色与前端页面核对，缺样本诚实标注 |
| 客服咨询复制 | GitHub 代码完成、模拟回归通过 | **NOT DEVICE VERIFIED** | 微信复制→客服手动粘贴的真机验收 |
| 评估普通图/长图/水印 | `9ca6a97` 候选，−25°、alpha 0.30，头尾用户ID日期 | **NOT DEVICE VERIFIED** | 真实手机相册核对无裁切及背景水印 |
| News V2 20篇窗口/72小时/收藏/退役事件/任务 | `b2622e9`、`14da4ca`、`eb93671`；七表结构合同和多管理员权限测试通过 | **BLOCKED**：生产缺七表；本机无可确认非生产 MySQL | 等非生产迁移两次/回归，再走独立 Schema 审批 |
| News 同步 timer | 已在 ECS 实际运行；`OnUnitActiveUSec=30min`，使用现役 `current` 同步脚本，日志多次显示 `total=21, created=0, updated=21` | **PRODUCTION ACTIVE**；尚无独立内存/CPU/超时上限 | 先按实际资源观测，再单独批准 timer 治理；Release A 不重装 timer |
| 微信真实发表时间 | 源端可证 `update_time`；无可靠 `publish_time` | **PARKED**（不得冒充发表日期） | 留“发表时间待核实/来源更新时间”，待官方能力或样本 |
| 支付、额度账本和真实充值额 | 代码/合同存在；生产三张表缺失 | **PARKED**（独立合规/Schema gate） | 不补造账本，不启用虚拟支付或假金额 |

**2026-10-13 管理后台只读候选**：`142eaa5`、`8911919`、`a74a1d8` 在 `p1/foundation` 接入现有管理员 `/auth/me`、评估统计、身份目录和资讯只读 API；会话仅留本地开发页面内存，旧本地编辑路由仍只供开发，正式 Web 登录尚未接入。统计缺表显示来源不可用，接口失败不作零；日期明示来源更新时间。GitHub Actions [38335494470](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38335494470) / [38335497980](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38335497980) PASS（小程序、管理端类型检查/2项只读测试/构建、API 测试/构建）。**CODE COMPLETE（只读本地候选） / CI PASS / PRODUCTION NOT DEPLOYED / DEVICE PENDING**。统一验收见 [体验版清单](experience-acceptance-2026-10-13.md)。

**验证证据**：集成验证点 `efb6ac97cd593a118107f00a18dc49b67c3fad1c` API typecheck/build + 196 tests；小程序 typecheck + 82 回归；GitHub Actions [38265829840](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38265829840) PASS（含干净环境后台 typecheck/build）。管理后台本机缺 `vue-tsc`，依赖安装超时后停止，未伪报本地 PASS。公开生产 `/health/live`、`/health`、`/health/config` 本轮成功但不返回 Git SHA。发布拆分见 [P1 独立发布候选](p1-release-candidates-2026-10-12.md)。非生产 MySQL、ECS promotion、systemd timer、微信开发者工具和新的真机验收不因代码/CI 自动通过。

**2026-10-13 Release A 生产事实（用户 ECS 回执）**：API-only 独立候选 `8cc4bb85ffdf3e86e7a13a89d119f1b110491e48` 已完成归档 SHA-256、ECS 受限构建（专项测试 14/14）、无数据库隔离冒烟、不可变 release 封装、审批和 `jiuchen-promote`；输出 `PROMOTE_OK`、`RELEASE_A_PROMOTE_PASS`。旧版 `b150d2c5c8720aac8d48fbd0395d8db9c408bc63` 保留作一键回滚。**本次仅代表部署与基础健康通过，真实业务及新版首次新闻同步待验收。** 先前的 [静态复核](release-a-staging-review-2026-10-13.md) 是发布前历史记录。ECS 完整资源与 timer 实存事实见 [资源地图](../ops/ecs-resource-map.md)。**微信体验版前端须单独核对是否依赖未部署 News V2 Schema/API，不得将全集成小程序未经筛选直接发布。**

**2026-10-13 News V2 非生产 MySQL 进展**：已在 GitHub Actions 一次性 MySQL 8.0.46 容器中真正执行 `db:upgrade:news-v2` 两次；发现并修复 `information_schema.tables.ENGINE` 字段名大小写读取 bug（`1b214d63`）；[CI 38336376860](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38336376860) `mysql-gate` PASS，七表列/索引/外键结构合同与基础旧行保留 PASS。**仅代表临时最小基础表的双次迁移**，不是生产结构复刻、完整业务数据回归，也不是备份/恢复演练；真实生产 DDL、开关、timer 和新版 API 仍待各自审批。

**2026-10-13 新闻数据库关系回归**：新增 GitHub Actions 实际 MySQL 8 七表关系测试，验证收藏、展示状态、退役批次/任务/已读/审计、同步运行记录写入、任务状态转换及外键拒绝非法引用；[CI 38337158353](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38337158353) **PASS**，提交 `75430b3e`。此结果不代表72小时生命周期业务接口端到端、真实生产库复刻、备份恢复或微信验收通过；生产 DDL/发布独立审批不变。

**2026-10-13 后续自动化进展**：News V2 隐藏/撤签/不完整源扫描/72小时退役时间边界纯逻辑回归已加入 (`c42a5bf1`)，完整 CI [38337440168](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38337440168) PASS。Profile Release B 在 GitHub Actions 临时 MySQL 8 中真实执行 `db:upgrade:enrollment-year` 两次，旧院校、年级、GPA 行保留，新增入学年份能写回，结构检查 PASS；[CI 38337530468](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38337530468)。两项均 **TEST PASS / PROD DDL NOT APPROVED / NOT DEPLOYED**；临时数据库测试不等于针对生产实例的备份及隔离恢复验收。

## 3. 唯一执行优先级：先保护生产，再跨模块推进

**10-13 执行更新**：Release A 已按独立审批完成生产切流，以下 P0/P1 旧的 Release A「尚未部署」步骤已过期，不应重新执行；先补充新版业务回归与下一轮新闻自动同步证据。用户要求继续其他未完成模块施工、最后统一真机验收；这不构成生产 DDL、支付、News V2 开关、跨身份扩权或新的 API promote 的自动批准。

### P0 — 保护与可观测性（立即）

1. 重新读取 `p1/foundation` HEAD、CI 和 ECS 实际 active release；确认生产 `/health/live`、`/health`、已验收课表/Assessment 无回归。
2. 盘点候选文件与生产实际差异、必需的 Schema/功能开关；将发布候选明确拆分，禁止一键把集成分支生产化。
3. Profile 字段缺失：完成备份/恢复与最小迁移审批包；**等待批准期间继续 P1/P2，不把全项目卡住**。
4. 若任何切片的用户认证/课表/AI或已有网站出现退化，立即停止并采用现成回滚，不带病扩大上线。

### P1 — 先交付独立、低风险、无新表工作（优先施工）

1. 完成资讯同步分页、同步真实回执、标签审核后端控制及“来源更新时间”语义，管理员默认按时间顺序；验证真实40组范围。
2. 评估统计与支付来源隔离，至少让成功9条进入正确周/月/年口径；支付缺表显示“不可用”，不许写成0。
3. 身份/学籍只读投影、认领/分配状态与“待完善实名”“学校待完善”；不批量修改历史用户。
4. 复核第一次 Work 已完成的客服复制、普通图/长图/斜向水印；不要重做，能独立验收的优先真机。
5. 准备每个小切片的 CI、鉴权/回归与受控发布说明；何时真正生产发布由用户单独批准。

### P2 — News V2 独立上线批（有依赖，不阻塞 P1）

1. 先在非生产 MySQL 验证 `services/api/src/db/upgrade-news-v2.ts` 七张表：重复迁移、字段/外键/索引、同名冲突、生命周期/收藏/提醒与数据保留；核实内存/磁盘开销。
2. 执行可恢复备份演练并形成精确审批清单；用户批准七表 DDL 后方可生产迁移。
3. 先关 `NEWS_V2_ENABLED` 部署受控 API，再在 Schema 已验证情况下单独开功能；20篇正常窗口 + 72小时缓冲 + 公众号原文收藏 + 多管理员一次性退役提醒及“待办/知晓/在办/反馈”任务。
4. 每小时 systemd timer 与可选微信事件按单一幂等服务实现。安装 timer 必须额外授权；手动刷新始终保留。
5. 分角色真机验证收藏、原文跳转、标签隔离、退役备注（老师可见管理员可编辑）、已读不重复、72小时模拟。

### P3 — 其他独立业务（不为 P2 等待）

- 真实客服咨询内容复制及确认；真实图片导出、长图保存水印；资料字段 UI，按有无生产接口依赖逐项验收。
- 只有在对应文档/实际授权具备后才推进跨身份只读镜像、更完整学校官方资料、课程/成长模块；**不借当前批扩权**。
- 虚拟支付、真实充值金额榜和来源成本自动核算维持独立商业合规 Gate，不得因图表开发推开支付。

## 4. 显式搁置 / PARKED 清单

| 项目 | 搁置原因 | 不影响什么 | 解锁条件 |
| --- | --- | --- | --- |
| 真实公众号“发表日期” | 官方样本未提供可验证发表时间，`update_time` 仅证明更新时间 | 分页同步、相对排序、手动刷新、标签 | 微信官方字段/后台发布时间逐条核对 |
| 自动发布事件秒级触发 | 微信事件权限与回调真实性未确认 | 每小时轮询、管理员手动刷新 | 事件类型、权限和真实回调验收 |
| 5分钟/分钟级轮询 | 配额/成本/限流尚未验证 | 1小时 timer | 资源测量和官方配额确认 |
| 真实充值、付费余额与准确消费归因 | 生产商业三表缺失；虚拟支付合规独立 Gate | 真实评估次数统计 | 商业 Schema、微信能力、支付回调等专项审批 |
| 已认领老师 / 已分配学员全角色验收 | 生产未找到样本 | 其他角色的只读投影和列表 | 用户提供真实样本并在真机验证 |
| Profile 生产DDL | 备份/恢复与精确审批尚未完成 | 资讯/统计/身份代码施工和不依赖该接口的测试 | 单列迁移单独审批 |
| News V2 生产启用 | 七表尚未经过非生产MySQL和备份关口 | P1 无表模块及已有资讯功能 | schema+发布+flag独立审批 |
| 真实手机客服与长图验收 | 代码测试不替代手机 | 后端只读审计/其他功能开发 | 上传体验版并完成手机复制、相册测试 |

**搁置不是删除需求**：登记负责人/触发条件/证据，解除阻塞时再进入 P1/P2；不得无限重复要求用户粘贴相同日志。

## 5. 安全施工与发布矩阵

| 操作 | Work/Codex 可直接做 | 需要批准 |
| --- | --- | --- |
| GitHub 审计、限定模块代码、测试、文档、CI、推送 `p1/foundation` | 是（保护用户已有修改） | 无关结构重构不得夹带 |
| 生产只读诊断、脱敏聚合 | 授权连接前提下可做；无连接则给人工命令 | 不输出密钥/个人数据 |
| 生产数据库 DDL / 历史写入 | **否** | 精确 DDL + 备份/恢复证据 |
| ECS API promote / rollback / 安装 timer | **否**（除非获得对应实际授权） | 版本 SHA + 回归/回滚清单 |
| 微信体验版/正式发布 | **否** | 具体版本/真实设备测试 |
| 支付、AI Runtime、官网、跨角色写权限调整 | **否** | 另立专项审批 |

**最小回归门槛**：认证与 session、Profile、导入/第一周/本周课表、AI 草稿→运行→历史、公众号旧页面、管理员身份、客服人工通道；新路由必须有角色负例和错误分支。保持 `CREDIT_ENFORCEMENT_ENABLED`、`NEWS_V2_ENABLED` 等生产已授权状态；不擅开新功能开关。不使用 `db:push`、无审计 `db:migrate`、手工覆盖 `current`。

## 6. 下一次交付须回报

- 当前 Git HEAD、实际生产 release、CI 状态，不混淆三者。
- 按模块：CODE / TEST / APPROVAL / DEPLOY / DEVICE 五列标记，不用笼统“全部完成”。
- 已完成的独立切片、仍阻塞的 `PARKED` 项，以及它们各自的解锁证据。
- 任何生产变更前单独给可人工审批的精确变更/恢复包；不可借本文件取得隐式授权。
- 改善本文状态表，而非在顶部再叠加声明；历史留在 archive/，另更新对应模块专档。
