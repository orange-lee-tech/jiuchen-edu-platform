# 九辰教育小程序后端工程地图与部署架构

**文档日期：2026-10-29**  
**仓库：orange-lee-tech/jiuchen-edu-platform**  
**用途：新共同开发者接手、后端维护、跨云依赖理解和生产变更前核查。**

> 本文描述九辰后端的真实职责边界、已知架构和运维规则。日期化的 SHA、资源容量和现场状态均为快照。执行部署、迁移或恢复前，必须重新读取 GitHub 当前分支、ECS 现场和数据库结构；不得把历史记录当成实时状态。

## 1. 一页理解：系统由什么组成

九辰教育不是一个只有小程序代码的项目，而是一套跨云协同的业务系统。

~~~text
学生 / 教师 / 管理员
          |
          v
微信原生小程序
          |
          | HTTPS API 请求
          v
https://api.jiuchenedu.com
          |
          v
阿里云 ECS：Nginx Proxy Manager / 现有入口
          |
          v
内网 API 监听：172.25.80.203:3100
          |
          v
jiuchen-api.service
Node.js 22 + TypeScript + Fastify
          |
          +-------------------- 腾讯云 CloudBase MySQL
          |                       线上业务数据真相源
          |
          +-------------------- CloudBase Storage / 微信生态能力
          |                       按实际资源和功能使用
          |
          +-------------------- AI Provider 适配层
          |                       阿里云百炼或其他可替换模型服务商
          |
          +-------------------- 微信官方接口
          |                       登录、服务号、虚拟支付等
          |
          +-------------------- 腾讯 OCR 等外部能力
                                  按接口及资源包计费

同一 ECS 上的独立业务：
jiuchenedu.com / www.jiuchenedu.com
          |
          v
现有网站入口 -> 宿主机 Nginx -> /www/wwwroot/jiuchen-current

同机基础设施（严格保护）：
/clouddream -> Harbor / Nginx Proxy Manager / Portainer
~~~

### 核心职责

- **微信小程序**：页面、用户交互、资料录入、课表与规划展示、AI 评估入口、购买入口。
- **ECS API**：服务端身份校验、权限、业务规则、数据库读写、AI 调用编排、订单与额度账本、管理接口和后台任务。
- **CloudBase MySQL**：在线业务数据的持久化来源。
- **模型服务商**：提供模型推理，不负责九辰内部的额度、订单、权限、报告入库或业务判定。
- **微信平台**：提供登录、服务号和虚拟支付等平台能力；客户端的成功回调不能替代服务端验证。
- **GitHub**：保存源码、变更历史、工程合同和 CI；不保存完整线上业务数据，也不等于当前生产运行版本。
- **管理员 WSL**：运行本地工程、维护工具和自主手动备份。备份规则详见 [自主手动备份与选择性恢复规范](manual-backup-and-selective-restore.md)。

---

## 2. 为什么采用跨云架构

项目早期有 CloudBase 相关后端运行路径，随后将核心 API 运行职责迁移到阿里云 ECS。CloudBase 仍保留在线业务数据库以及既有微信生态相关资源；不能把这次迁移理解为“腾讯云所有服务全部退出”。

| 能力 | 当前架构职责 | 边界 |
|---|---|---|
| API 运行与业务编排 | 阿里云 ECS | Fastify API 通过独立 systemd 服务运行 |
| 业务数据库 | 腾讯云 CloudBase MySQL | 不是 ECS 上 Harbor 的 PostgreSQL |
| 业务文件与既有对象 | 依现有资源使用 CloudBase Storage 或 ECS 文件目录 | 每类文件必须确认实际来源和备份范围 |
| AI 推理 | 可替换的外部 Provider API | 不要求绑定 CloudBase AI |
| 微信身份、服务号和虚拟支付 | 微信官方能力 | 由服务端验证身份、通知和订单状态 |
| OCR | 腾讯 OCR 等外部接口 | 每种接口的资源包、计量单位和后付费规则独立核对 |
| 企业官网 | 同一 ECS 上的独立网站路径 | 不随小程序 API 部署一起重建或切换 |

跨云架构的价值是将 API 运行、业务数据和 AI 推理解耦，并保留供应商替换空间。代价是必须维护网络连通性、数据库访问安全、跨云凭据、账单与备份边界。

### 图片和文件的特别说明

项目中既有 CloudBase Storage 的保留资源，也有通过 ECS API 提供的学校 WebP 文件。后端源码中的学校媒体路由使用固定学校 ID 访问：

- URL 模式：/school-media/v1/:schoolId.webp
- 文件目录：/opt/jiuchen-media/schools/v1/
- 文件格式：WebP
- 学校 ID 范围受正则规则约束，不允许通过请求传入任意文件路径。

不要把“学校图片存在 ECS”推断为“所有上传文件都已从 CloudBase Storage 迁走”。备份和恢复前必须按实际业务路径分别确认。

---

## 3. GitHub 源码地图

仓库地址：

https://github.com/orange-lee-tech/jiuchen-edu-platform

主要目录：

| 路径 | 作用 |
|---|---|
| apps/miniprogram | 微信原生小程序 |
| apps/admin | Vue 管理后台 |
| services/api | Fastify API、业务服务、数据库访问和迁移脚本 |
| services/api/src/server.ts | API 进程启动入口 |
| services/api/src/app.ts | 创建 Fastify app、注册路由和启动后台任务 |
| services/api/src/config/env.ts | 环境变量定义与校验 |
| services/api/src/db/client.ts | MySQL 连接池与 Drizzle ORM |
| services/api/src/db/schema.ts | 数据库表结构映射 |
| services/api/src/routes | API 路由层 |
| services/api/src/services | 业务逻辑、AI Provider、评估运行时、支付、密钥与账本 |
| tools/maintenance | 管理员自主备份、恢复演练和维护工具 |
| tools/release | 固定 SHA 的发布、预检和回滚工具 |
| ops/ecs/AGENTS.md | ECS 运维边界与生产保护规则 |
| docs/ops/ecs-resource-map.md | ECS 资源与基础设施地图 |
| docs/ops/manual-backup-and-selective-restore.md | 自主备份与选择性恢复规范 |
| docs/handoff/CURRENT.md | 当前工程工作状态的优先入口 |
| docs/handoff/README.md | 交接文档导航 |

### 版本原则

- main 是整合源码权威；当前功能分支、PR 和 ECS 生产 release 是不同概念。
- GitHub 合并不会自动将 API 部署到 ECS。
- 自托管 Runner 只运行被触发的工程检查，不等于生产部署机。
- 生产环境变量、数据库真实数据、微信密钥和 AI API Key 不应进入仓库。
- 不要用旧分支的 SHA 或旧体验版代码推断当前生产状态。
- 本文创建于 2026-10-29；当日交接中的 UI/规划 PR #10 仍为待审查的功能分支候选，不代表其代码已经合入 main 或部署到 ECS。

---

## 4. ECS 生产拓扑

### 4.1 已知主机与入口

| 项目 | 已记录值 | 注意事项 |
|---|---|---|
| 云厂商与 OS | 阿里云 ECS / Alibaba Cloud Linux 3 | 共享主机承载多类生产资产 |
| 公网入口 IP | 121.40.168.181 | 操作前重新核对 ECS 实例与安全组 |
| API 域名 | https://api.jiuchenedu.com | 公网 HTTPS 入口 |
| API 内网监听 | 172.25.80.203:3100 | API 不直接绑定官网的 80、443 或 8088 |
| API systemd unit | jiuchen-api.service | 只管理该服务，不顺带重启其他系统服务 |
| API 工作目录 | /opt/jiuchen-api/current/services/api | current 指向某个 release |
| 环境文件 | /etc/jiuchen-api/production.env | 高敏感文件；历史权限要求 0600 |
| 官网根目录 | /www/wwwroot/jiuchen-current | 核心保护资产 |
| 基础设施目录 | /clouddream | Harbor、Nginx Proxy Manager、Portainer 等 |

### 4.2 请求路由关系

~~~text
公网用户
   |
   +-- jiuchenedu.com / www.jiuchenedu.com
   |        |
   |        v
   |   Nginx Proxy Manager 的现有 Proxy Host
   |        |
   |        v
   |   宿主机 Nginx :8088
   |        |
   |        v
   |   /www/wwwroot/jiuchen-current
   |
   +-- api.jiuchenedu.com
            |
            v
       Nginx Proxy Manager
            |
            v
       172.25.80.203:3100
            |
            v
       jiuchen-api.service
~~~

Nginx Proxy Manager 在同机承担 80/443 入口。宿主机 Nginx 的 8088 入口与 API 3100 监听职责不同。实际域名路由以 NPM 当前 Proxy Host、证书和现场配置为准。

### 4.3 同机基础设施的保护边界

以下资产不属于普通 API 发布范围：

- Nginx Proxy Manager 容器及其 data、letsencrypt、自定义 app/index.js；
- Harbor 及其 registry、数据库、Redis、jobservice 等容器与持久化卷；
- Portainer；
- Docker daemon、Docker 网络和容器卷；
- 官网目录 /www/wwwroot/jiuchen-current；
- 宿主机 Nginx 配置、80/443/8088 入口；
- 与以上服务相关的证书、代理账号和系统服务。

禁止用 docker system prune、宽泛 rm -rf、重建 Docker 网络、全机重启或无关服务重启来处理 API 的局部故障。任何涉及 DNS、NPM、TLS、宿主机 Nginx 或安全组的变更必须单独说明影响范围并获授权。

### 4.4 容量与服务资源限制

历史 ECS 盘点为 2 vCPU、约 1.8 GiB RAM、2 GiB Swap、40 GiB 根磁盘。它是共享主机，不可把全部资源都分配给 API。

API 的既有资源约束记录：

- systemd 服务用户：jiuchen-api；
- MemoryMax：256 MiB；
- CPUQuota：50%；
- TasksMax：64；
- Node heap 约 160–192 MiB；
- API 私有监听端口：3100。

这些值是历史运维约束。执行任何资源修改前，必须重新读取 systemd 实际值和内存峰值，不可为了掩盖故障随意放宽上限。

---

## 5. API 服务实际运行方式

### 5.1 关键运行文件

- 进程入口：services/api/src/server.ts
- 应用装配：services/api/src/app.ts
- 环境配置：services/api/src/config/env.ts
- 数据库客户端：services/api/src/db/client.ts
- 生产环境文件：/etc/jiuchen-api/production.env
- 服务 unit：jiuchen-api.service
- 当前版本指针：/opt/jiuchen-api/current
- 不可变版本目录：/opt/jiuchen-api/releases/<commit-sha>
- 私有业务案例：/opt/jiuchen-api/shared/cases
- 学校图片：/opt/jiuchen-media/schools/v1

实际环境变量文件不得使用 cat、printenv 或无过滤 grep 输出。只核对变量名、布尔存在状态和脱敏诊断结果。

### 5.2 2026-10-29 最近一次记录的运行快照

当日只读交接记录给出的信息：

- systemd 服务为 active；
- 主进程 PID 曾记录为 180486；
- systemd 的 ExecStart 使用 /opt/jiuchen-api/runtime/node/bin/node dist/server.js；
- WorkingDirectory 为 /opt/jiuchen-api/current/services/api；
- EnvironmentFiles 为 /etc/jiuchen-api/production.env；
- HOST 为 172.25.80.203，PORT 为 3100；
- 当时读取到的 current release 为 /opt/jiuchen-api/releases/0b339a4f86f248f1de3df8ee957f5bdda2254fda。

以上是最近已知现场快照，不保证此刻仍然相同。重新接手时应先执行只读核对。

### 5.3 健康检查

源码注册了以下端点：

- /health/live：应用进程是否能响应；
- /health：检查数据库连接，并验证一组核心表是否可查询；
- /health/config：返回配置是否存在等状态，不应暴露密钥值。

只读检查示例：

~~~bash
systemctl is-active jiuchen-api.service
readlink -f /opt/jiuchen-api/current
systemctl show jiuchen-api.service \
  -p ExecStart -p WorkingDirectory -p EnvironmentFiles \
  -p MemoryMax -p CPUQuotaPerSecUSec -p TasksMax --no-pager

curl -fsS https://api.jiuchenedu.com/health/live
curl -fsS https://api.jiuchenedu.com/health
curl -fsS https://api.jiuchenedu.com/health/config
~~~

健康检查 PASS 只证明相应的进程或依赖检查通过，不等于支付、AI 评估、资讯完整性或真机交互全部验收。

### 5.4 生产发布模型与最新差异

设计上的发布链：

~~~text
GitHub 固定 commit SHA
       |
       v
本地类型检查 / 测试 / 构建
       |
       v
固定归档、SHA-256 与 manifest
       |
       v
ECS staging 独立目录构建与 smoke
       |
       v
不可变 release 目录
       |
       v
授权 promotion / current 切换
       |
       v
仅重启 jiuchen-api.service
       |
       v
健康门禁与失败回滚
~~~

既有发布约定包括 staging、不可变 releases、current 指针、上一稳定版本和健康检查。部分历史工具还使用 approved-release 或 READY 标记作为授权门禁。

**重要：2026-10-29 的最近只读审计指出，预期中的 /etc/jiuchen-api/approved-release 和此前交接所提到的某些旧备份/发布脚本路径未在现场找到。** 因此不能假定历史 promotion 工具仍原样存在，也不能自行重建批准文件、手动切 current 或绕过发布门禁。

下一次部署前先确认当前 systemd unit 与真实 current、实际存在的 promotion 工具及其版本、候选 SHA 与归档 SHA-256、上一稳定 release 与回滚方式、环境文件权限与运行用户读取权限、健康检查和资源限制，以及官网是否未变化。

若发布工具与文档不一致，先更新交接证据，再执行发布。不得直接修改现役 release 中的代码来修复线上故障。

---

## 6. CloudBase 与 MySQL 数据层

### 6.1 线上业务数据库边界

线上业务数据库位于腾讯云 CloudBase 的 MySQL 环境。历史环境标识为 cloud1-d3geim00r03edb212，区域记录为上海；环境 ID、套餐、网络和账单都应在腾讯云控制台重新核对。

ECS 上的 /data/database/pg14 是 Harbor 组件的 PostgreSQL 数据，不是九辰小程序业务数据库。不要将其当作用户、评估、订单或额度账本的数据库。

### 6.2 API 数据库连接

源码支持两种配置形式：

- DATABASE_URL；
- DB_HOST、DB_PORT、DB_USER、DB_PASSWORD、DB_NAME。

API 使用 mysql2/promise 连接池，并由 Drizzle ORM 映射数据库 schema。连接池上限和超时参数以当前源码为准。

### 6.3 已知数据库传输风险

2026-10-18 的只读诊断曾记录 MySQL 服务端 TLS 不可用、require_secure_transport 为 OFF、现役 API 会话未启用 MySQL TLS，且数据库主机名解析结果未被证实为 ECS 本机接口地址。

这意味着历史证据**不能证明 ECS 到 CloudBase MySQL 的链路端到端启用了 TLS**。当时的备份工具为了取得最小恢复点加入了显式复用现役连接路径的选项，并会输出相应传输状态。

后续应独立评估 MySQL TLS 或受控专网方案。不要为通过备份而擅自更改数据库安全设置、DNS、路由或现役 API 的连接配置。

### 6.4 数据表按业务分组

实际表清单以 services/api/src/db/schema.ts 和迁移脚本为准。以下是理解业务的分组：

**账户与身份**

- users
- user_sessions
- user_agreements
- user_profiles
- internal_ids
- students
- teachers
- student_teacher_assignments

**规划与课表**

- student_plans
- plan_items
- plan_revisions
- schedule_imports

**资讯**

- news_posts
- news_display_states
- news_favorites
- news_retirement_batches
- news_retirement_tasks
- news_retirement_reads
- news_task_audit
- news_sync_runs

**AI 评估与成本观测**

- 评估报告和评估任务相关表；
- 案例、产品知识和院校资料相关数据；
- assessment_ai_calls；
- assessment_ai_price_versions。

**额度、支付与通知**

- payment_orders
- credit_ledger_entries
- credit_reservations
- payment_notifications

**管理员控制与 AI Key 版本**

- admin_control_boxes
- admin_control_audit
- admin_control_drafts
- assessment_key_objects
- assessment_key_head
- assessment_key_events
- credit_plan_objects
- credit_plan_head
- credit_plan_events

**支付可靠性候选**

- virtual_payment_cases
- virtual_payment_case_actions

最后两张表来自 PR #9 的支付可靠性能力。2026-10-27 交接记录指出该迁移当时尚未在生产执行；部署依赖这些表的新 API 前，必须重新核对当前生产结构与迁移状态。

### 6.5 数据库迁移规则

API 目录中存在多条独立迁移命令。生产迁移必须按候选 SHA、迁移名称和真实表结构逐项确认。

- 先只读核对生产表、列、索引、外键和已有迁移记录；
- 获取新鲜自主加密备份；
- 在隔离 MySQL 8 恢复副本演练确切候选迁移；
- 核对关键业务行、订单快照、额度账本和身份绑定；
- 单独取得生产 DDL 授权；
- 执行后检查表结构、健康状态和业务一致性。

不要盲目重复 DDL，不要用 db:push 代替生产迁移审核，不要因为 CI 的 disposable MySQL 测试通过就认为生产表已存在。

---

## 7. API 业务模块与核心调用链

### 7.1 路由模块

services/api/src/app.ts 装配的主要模块包括：

| 模块 | 职责 |
|---|---|
| Auth | 微信登录、用户会话与认证 |
| Student / Profile | 学员档案、个人资料 |
| Identity | 九辰内部身份绑定 |
| Teacher | 教师与师生关系 |
| Mobile Admin / Admin | 小程序管理入口和后台管理 |
| News / News V2 | 资讯查询与新版资讯能力 |
| Assessments | AI 评估创建、运行、报告与历史 |
| Products / Brand | 产品资料与品牌信息 |
| Classroom Workspace | 学期、课表与规划工作区 |
| Growth Profile | 成长档案 |
| Read-only Workspace | 受限只读工作区 |
| Commercial | 订单、支付回调、额度和售后核对 |
| Admin Controls | 管理配置、控制版本和审计 |
| Assessment Key Objects | AI 服务密钥对象和版本切换 |
| Credit Plans | 评估次数方案与版本 |

### 7.2 登录和权限

登录链路概念：

1. 小程序调用微信登录能力取得临时 code；
2. 将 code 交给服务端；
3. 服务端与微信官方接口交换身份；
4. 服务端维护九辰用户和会话；
5. 服务端读取九辰内部身份绑定；
6. 每个业务 API 独立验证用户、角色和资源归属。

微信身份、九辰账户、学员/教师/管理员内部身份是不同概念。隐藏前端按钮不是权限控制；服务端必须检查每次读写。教师和管理员的只读权限也必须由后端保证。

### 7.3 AI 评估链路

~~~text
学员提交资料
    |
    v
API 认证、身份与额度检查
    |
    v
结构化输入校验
    |
    v
检索案例 / 产品知识 / 院校资料
    |
    v
加载当前生效的 AI Provider 配置
    |
    v
调用外部模型 API
    |
    v
校验 JSON / Schema / 证据引用
    |
    v
保存评估报告与调用观测
    |
    v
按成功完成规则结算 1 次额度
    |
    v
小程序查看报告和历史记录
~~~

核心代码集中在 assessment runtime、AI provider、知识检索、成本观测和 vault runtime 等服务中。模型负责生成内容，九辰服务端负责权限、证据整理、结构校验、报告入库和额度结算。

### 7.4 AI 服务商和密钥管理

评估模型相关环境变量名称包括：

- ASSESSMENT_AI_PROVIDER
- ASSESSMENT_AI_BASE_URL
- ASSESSMENT_AI_API_KEY
- ASSESSMENT_AI_MODEL
- ASSESSMENT_AI_TEMPERATURE
- ASSESSMENT_AI_JSON_MODE
- ASSESSMENT_AI_RESPONSE_FORMAT
- ASSESSMENT_AI_EXTRA_BODY_JSON

课表 AI 与其他客户服务 AI 使用独立配置组。当前模型名不能仅靠历史文档推断，必须从受控运行诊断或管理员界面核实。

管理员配置能力采用版本化对象和服务器加密存储。ADMIN_AI_KEY_ENCRYPTION_KEY 是解密现有 AI Key 所需的主密钥配置，必须保存在受控生产环境中；不能写进 Git、日志或普通交接文件。密钥读取接口不应返回明文。

### 7.5 额度与支付链路

~~~text
可信免费额度发放 / 官方确认的微信付款
                  |
                  v
           写入额度账本（幂等）
                  |
                  v
              可用次数
                  |
                  v
             评估预留额度
                  |
                  v
         AI 运行并成功保存报告
                  |
                  v
              结算扣 1 次
~~~

核心表：

- payment_orders：订单和购买时快照；
- credit_ledger_entries：可信额度增加/扣减事件；
- credit_reservations：运行期间额度预留；
- payment_notifications：通知幂等和支付通知记录。

微信虚拟支付必须以可信发货推送或官方查单核实付款，不能只相信客户端 success 回调。订单金额、商品、次数和方案版本应在创建时固定，重复通知不得重复发放额度。失败评估不应无故扣用户次数，但上游模型请求仍可能产生实际费用。

2026-10-27 交接记录有两笔安卓真实支付测试，合计 ¥2.00、增加 3 次额度。这是当日已有的真机验收记录；不代表所有 SKU、退款、iOS 和正式账单三方对账都已完成。

### 7.6 服务号资讯与后台任务

后端存在旧版资讯路由与可选 News V2。源码按 NEWS_V2_ENABLED 决定是否注册 News V2 路由。启用开关前必须确认生产数据库结构和当前 API 兼容。

历史 ECS 回执记录 jiuchen-news-sync.timer 每约 30 分钟运行，调用 jiuchen-news-sync.service 同步官方服务号内容。当前 timer 是否仍是同一配置，应重新检查 systemd 状态和最近日志。

任务执行成功不代表官方来源的文章全部抓全。历史排查曾发现来源端返回范围与资讯展示覆盖不一致，必须分别验证来源、入库、过滤和前端显示。

---

## 8. 环境变量与凭据边界

生产环境文件：

/etc/jiuchen-api/production.env

环境变量按职责包括：

| 类别 | 变量名示例（仅名称） |
|---|---|
| 运行时 | NODE_ENV、HOST、PORT |
| 数据库 | DATABASE_URL、DB_HOST、DB_PORT、DB_USER、DB_PASSWORD、DB_NAME |
| 微信登录 | WECHAT_APP_ID、WECHAT_APP_SECRET |
| 服务号 | WECHAT_OA_APP_ID、WECHAT_OA_APP_SECRET |
| CloudBase / 腾讯云 | CLOUDBASE_ENV_ID、CLOUDBASE_APIKEY、TENCENTCLOUD_SECRETID、TENCENTCLOUD_SECRETKEY |
| 虚拟支付 | WECHAT_VIRTUAL_PAY_*、WECHAT_VIRTUAL_PUSH_TOKEN、WECHAT_VIRTUAL_PUSH_AES_KEY |
| 标准支付能力 | WECHAT_PAY_* |
| AI 评估 | ASSESSMENT_AI_* |
| 课表 AI | SCHEDULE_AI_* |
| 客服 AI | CUSTOMER_AI_* |
| AI Key 加密 | ADMIN_AI_KEY_ENCRYPTION_KEY |
| 额度策略 | CREDIT_ENFORCEMENT_ENABLED、CREDIT_FREE_GRANT_VERSION、CREDIT_FREE_GRANT_AMOUNT、CREDIT_PAYMENT_SKUS_JSON |
| 成本观测 | AI_SUPPLIER_BALANCE_FEN、AI_SUPPLIER_BALANCE_OBSERVED_AT、AI_COST_ESTIMATE_FEN_PER_RUN、AI_SUPPLIER_ALERT_DAYS |
| 资讯开关 | NEWS_V2_ENABLED |

上述是源码支持的变量名称，不表示它们都已设置或都在当前生产环境生效。

严禁把环境文件原文、数据库连接串、微信密钥、腾讯 CAM SecretKey、AI Key、支付 AES Key、SSH 私钥或真实学员数据复制到 GitHub、聊天或普通文档。

---

## 9. 备份与恢复和部署的关系

自主备份与发布回滚是两套机制，解决的问题不同：

| 机制 | 保护对象 | 不能替代什么 |
|---|---|---|
| GitHub commit / branch | 源码与变更历史 | 不保存完整生产数据库与环境密钥 |
| ECS immutable releases | API 程序版本 | 不恢复数据库数据、支付账本或外部文件 |
| API current 回滚 | 快速切回上一 API 版本 | 不会自动回滚数据库 DDL 或外部服务配置 |
| 管理员 WSL 加密备份 | 已纳入的程序、数据库、文件和配置组件 | 不自动证明全资产覆盖，也不自动覆盖生产 |
| MySQL 隔离恢复演练 | 数据库备份可导入性 | 不证明生产数据逐行等价或业务全部正确 |
| 云厂商控制台快照/备份 | 云平台自身所覆盖的资源 | 不替代本项目的跨组件、选择性恢复合同 |

详细组件、命令、加密、保留和恢复审批规则见 [自主手动备份与选择性恢复规范](manual-backup-and-selective-restore.md)。

---

## 10. 当前已知风险与需要重新核验的项目

### P0：生产变更前必须核实

1. **实际 current release**：2026-10-29 最近只读快照曾记录为 0b339a4f86f248f1de3df8ee957f5bdda2254fda；操作前重新读取 current。
2. **发布授权机制存在漂移**：预期的 approved-release 与部分历史脚本路径在最新审计中未找到。先确认当前真实发布工具，不自行重建门禁。
3. **数据库迁移状态**：逐项核对生产表结构和迁移历史，尤其是新功能所依赖的表。
4. **自主备份恢复点**：核对管理员 WSL 本地备份目录、加密文件、密码、回执和隔离恢复结果。ECS 上旧网站归档不是业务数据库恢复证明。
5. **AI 加密主密钥**：确认当前密钥对象能解密；不能把密钥值输出到日志或交接文档。
6. **数据库传输安全**：历史诊断没有证明 ECS 到 CloudBase MySQL 使用 TLS，需独立治理。

### P1：业务验收和运维

- 微信虚拟支付各 SKU、退款和售后状态；
- 微信账单、订单与额度账本的完整三方日对账；
- AI Provider/Model 的实际生效版本、Token 观测和服务商真实账单；
- 服务号资讯源、同步、入库、过滤和前端展示；
- CloudBase Storage、学校媒体、私有案例等对象的完整备份范围；
- 运行时实际路径与 runtime.jcb 的一致性；
- News timer 资源上限、超时和日志增长；
- 生产 API 当前 SHA、上一稳定版本、健康结果和资源峰值。

---

## 11. 新开发者接手顺序

### 第一步：读权威资料

1. [CONSTITUTION.md](../../CONSTITUTION.md)
2. [AGENTS.md](../../AGENTS.md)
3. [CURRENT.md](../handoff/CURRENT.md)
4. [ECS 资源地图](ecs-resource-map.md)
5. [ECS 保护规则](../../ops/ecs/AGENTS.md)
6. [自主手动备份与选择性恢复规范](manual-backup-and-selective-restore.md)
7. [交接文档导航](../handoff/README.md)

### 第二步：只读核对生产状态

- systemd 状态、ExecStart、WorkingDirectory、EnvironmentFiles；
- current 实际指向的 SHA；
- API 内网监听与公网健康接口；
- 官网域名、现有 Proxy Host 和网站目录是否未变化；
- CloudBase MySQL 连接、关键表和迁移状态；
- AI Key 对象版本、支付开关与 SKU 映射；
- 本地 WSL 备份代、组件清单、校验回执与隔离恢复结果。

只记录 SHA、路径、表名、布尔状态和脱敏统计，不输出密钥或个人数据。

### 第三步：按风险分开操作

- UI 与前端工作在代码分支完成并验收。
- API 变更运行相关测试、typecheck 和 build。
- 数据库变更先隔离恢复、再演练迁移、最后单独批准生产 DDL。
- API 部署只使用固定 SHA、既有发布门禁和健康回滚机制。
- 共享入口、官网、AI 密钥、支付配置、数据库迁移和微信正式发布分别授权。

### 第四步：交接时必须报告

- Git 分支、PR、固定候选 SHA 与 CI 结果；
- ECS current、previous、服务状态、健康结果和资源使用；
- 数据库迁移状态与备份恢复证据；
- 实际生效的 AI Provider/Model 和密钥对象版本（不含 Key）；
- 支付链路与账本核对结果；
- 未解决问题、影响范围、回滚目标和需要的下一次授权。

---

## 12. 关联资料

- [自主手动备份与选择性恢复规范](manual-backup-and-selective-restore.md)
- [ECS 资源地图](ecs-resource-map.md)
- [ECS 资源治理交接（2026-10-13）](../handoff/ecs-resource-governance-2026-10-13.md)
- [虚拟支付可靠性与对账边界（2026-10-27）](../handoff/virtual-payment-reliability-2026-10-27.md)
- [当前工程交接](../handoff/CURRENT.md)
- [交接文档导航](../handoff/README.md)

**最终原则：小程序前端只是入口。完整的后端资产包括 API 源码和运行版本、CloudBase 业务数据库、AI 配置与加密主密钥、微信支付与额度账本、ECS 发布回滚机制、备份恢复证据及云端权限。每一项都要有明确边界、当前证据和独立验收。**
