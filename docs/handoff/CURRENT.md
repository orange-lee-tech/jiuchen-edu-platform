# CURRENT — 九辰教育唯一活跃交接（2026-10-18）

本页只记当前可执行状态。完整收费版为正式交付目标，生产收费尚未验收；[固定候选与独立 DDL 审查包](p1-paid-release-scope-and-schema-review-2026-10-17.md)用于下一轮现场核对。历史事实保留在 Git 历史和下列专项文档中，旧日期的计划、候选 SHA、绿灯和“下一步”不自动成为今天的授权。接手先读 CONSTITUTION.md → AGENTS.md → 本页 → 对应专项文档；涉及 ECS 再读 ops/ecs/AGENTS.md。

**2026-10-18 15:45 后台形态核对：** 用户确认实际服务号 AppID 后四位为 `80db`，与只读探针的生产配置一致；账号错配已排除。六张运营后台截图显示同一服务号「发表记录」累计 64 次，分为「文章」46 次、「贴图」18 篇；「贴图」列表明确含 10 月 12 日《10月竞赛清单来啦～》及 10 月 10 日其他近期内容。此稿亦在四条运营短链中、前次官方接口与生产库均未命中。现有同步器只调用 `freepublish/batchget`，并只解析 `content.news_item` 图文文章；未实现贴图类型来源或图片组正文。后台近期普通文章和其自动生成的贴图草稿同时存在，不可将两者合并或把 46 次文章与接口 46 篇视为精确一一对应（接口为 45 组 46 子文章，后台为 46 次）。其余三篇短链和「中南大学」稿的后台分类，现有截图未逐篇显示，仍待受控数据来源核对。结构性修复方向：文章与贴图分别取得受支持的已发表来源、统一去重/入库/展示，贴图在小程序内提供图片序列阅读，收藏留原链接；无法取得受支持的贴图 API 时用经运营核实的原始图片/正文导入，不把链接卡当站内阅读。没有新代码、生产切流或真机验收。详见[资讯拓扑审查](p1-news-topology-first-principles-2026-10-18.md)。

**2026-10-18 15:07 上游只读对照实测：** [固定脚本](../../ops/ecs/news-source-diff-readonly-20261018.mjs) SHA-256 `43a010637b8ff6f528398943dd05964874d4c7286475c3f8b91544d7476cfff8` 已在 ECS staging 以独立 systemd unit 成功运行，`READ_ONLY_SOURCE_AND_DATABASE_DIFF`、exit 0，`candidateSha=1b8ae8b3...`、`productionWrites=false`。生产配置公众号 AppID 后四位 `80db`；官方 `freepublish/batchget` 完整返回 45/45 组、46 条，9 月旧稿对照存在；运营提供的四篇短链及 10 月 12 日“中南大学”文章均在源端和生产 `news_posts` 标题/URL 对照中零命中。短链和官方长链可能不同，但标题近似对照也未命中；未读取文章网页。五篇缺失定位在当前自动来源视图及入库之前，不能归罪于此次的标签、日期或分页。

**2026-10-18 资讯拓扑纠偏：** [第一性原理与源码拓扑审查](p1-news-topology-first-principles-2026-10-18.md)确认用户首发目标是“服务号图文在小程序内读完整正文；收藏保存原文链接，收藏访问允许跳服务号；视频可链接”。现有自动 `freepublish/batchget` 返回的正文可进入 `rich-text`；但四篇短链缺源时，固定 1b8 的管理员补录仅写 `html:null`，详情页会提示无正文并跳原文，**URL 补录不满足站内阅读**。先前将“补四条 URL 并验原文”当作资讯首发闭环是不完整判定。不能只修强制时间；需对指定真稿核来源／正文、取得可核的本方正文并走同一入库合同，防止自动更新覆盖已存正文，再以真实手机验站内图文与收藏原文。新代码需新 SHA 和相关 Gate；当前生产未切流。

**2026-10-18 14:37 发表时间口径纠偏：** 旧资讯曾将官方 `update_time` 落在 `published_at`，不能据此称作真实发表时间。固定候选扫描优先取显式 `publish_time`，并将来源更新时间单独标注；四篇运营提供的短链接目前不在已取得的来源返回内，故无法沿用该接口取时间。用户无需再次提供分钟级时间；数据库 `news_posts.published_at` 可空，缺失时应显示“发表时间待核实”。但当前 1b8 管理员核实补录路由／283a 前端表单仍强制填写时间；须先做受控可空时间入口或等价的经过验证的维护工具，按新的固定范围复验，不能填猜测时间或把既有候选宣称支持该路径。详见[集中切换执行单](p1-production-cutover-plan-2026-10-18.md)。

**2026-10-18 14:15 运营提供四篇原文候选：** 《2028届推免前移：现在该怎样准备？》《保研完整时间轴，大一到大四全覆盖（速收藏》《10月竞赛清单来啦～》《2027秋招启动：本科生最该补齐的4项准备》及对应四条 `mp.weixin.qq.com/s/` 短链接已列入[集中切换执行单](p1-production-cutover-plan-2026-10-18.md)。状态仅为运营提供，原文页面在当前工作环境不可读取；公众号归属、准确完整标题、北京时间发表时间、真机打开仍待后台核实。这四篇没有写生产库，且不能代替此前缺失的 10 月 12 日中南大学文章。待逐篇核实后在固定候选 V2 管理员入口补录并一次性验收，自动来源缺口仍单列。

**2026-10-18 集中切换执行单：** [生产切换与一次性真机验收](p1-production-cutover-plan-2026-10-18.md) 已按固定 API／前端、已通过的三组 DDL 和标题级资讯证据写成五道门。现役旧 timer 虽可成功同步，但固定代码仅在 `NEWS_V2_ENABLED=true` 且完整扫描时调和展示状态；因此 V2 切换前须经单独审定的隔离维护命令预热，再核公开窗口非空。这个命令会写资讯数据，仍未执行；API 切流、付费开关、体验版与真机也未执行。八条产品资料不得被批量打标充当十月新稿。

**2026-10-18 13:56 资讯标题级核对：** 只读 `OCTOBER_SOURCE_CATALOG` 9 行中，4 篇九辰产品手册／介绍的旧链接与另 4 篇同主题新链接，加一篇《不入党、不进学生会，会影响保研吗？》；这些记录仅有 `sourceUpdatedAt=2026-10-17`，不是可核实的 10 月发表时间。`TARGET_TITLE_IN_DATABASE=[]`，10 月 12 日《中南大学保研看什么？成绩、综测与学院细则》仍缺源。故上一段“9 篇被标签过滤”只解释这 9 条已入库记录不能展示，**不能解释用户观察到的 10 月新稿系统性缺失**；不得把产品资料批量打标推到资讯首页。首发需针对已发表但接口缺失的真实新稿取得后台标题／原链接／北京时间，走固定候选的管理员核实补录；独立追踪自动来源接口缺口，不记自动同步 PASS。

**2026-10-18 生产 DDL 实测：** 用户在 ECS root 运行固定 `1b8ae8b3` staging 代码，`PRODUCTION_DDL_PRECHECK_PASS`，随后 `PROFILE_UPGRADE`／`PROFILE_CHECK`、`NEWS_UPGRADE`、`COMMERCIAL_UPGRADE`／`COMMERCIAL_CHECK` 逐项 PASS；Profile `ready=true`、商业四表 `ok=true, issues=[]`，News 返回 `NEWS_V2_SCHEMA_READY`，最终 `THREE_PRODUCTION_DDL_SCOPES_PASS`、`API_CURRENT_UNCHANGED`。这三组结构现已存在；生产 API 仍为 `8cc4bb85`，News V2、收费开关与商户仍未启用。**资讯分层证据：** 现役 timer 11:27 CST active，近期同步成功；固定候选只读源端完整扫描 45/45 组、3 页，其中按 `publish_time` 或来源 `update_time` 归月有 10 月 9 篇、9 月 9 篇、8 月 8 篇、7 月 20 篇，最新来源更新时间 `2026-10-17T08:20:03Z`，所有来源真实发表时间仍未给出。生产 `news_posts` 的 10 月来源月份 9 篇均 active、**标签 0/9**；现役 `/news` 排除无标签内容，因此这 9 条无法公开展示；标题级核对表明多数是产品资料，见上一段。不能把来源更新时间当发表时间。10 月 12 日目标明确未入库；需核实真实新稿原链接、受控补录，并另行解决源端自动覆盖。News V2 空状态需先由固定候选同步/调和再启用公开窗口。

**2026-10-18 发布候选更正：** 前端固定 SHA 为 `283aaf15fc0047f100028eee547a5581c3f8c047`，隔离 API 固定 SHA 为 `1b8ae8b3c5a1285b84ab6b5f573ca9db5d93d0a7`。API 是现役 `8cc4bb85` 的后代、在 e590 上仅修复商业 schema 检查器；集成提交 `283aaf15fc0047f100028eee547a5581c3f8c047` 的 API 测试通过，但归档器因不满足生产祖先约束拒绝它，不能把它作为 API 发布包。新 API 的固定验证：[39083488661](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39083488661)（verify/News/Profile/商业四项成功）。下文凡称“283a 整包 API 候选”仅为 10 月 17 日代码测试历史，不是当前可归档 API。生产 DDL 已执行并核查；API 部署、商户和真机仍待实际验收。固定隔离 API 的四项门禁 [39083488661](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39083488661) PASS（Node22 typecheck、215/215、build，News/Profile/商业临时 MySQL）；[归档 39083622604](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39083622604) PASS，内层 tar.gz SHA-256 `98279923d783889caa87deb815d3828d53266a84a7be081714188a71f1fc1fb8`，仅供审查。详情：[配对候选回执](p1-paired-release-candidates-2026-10-18.md)。

本轮整包施工和一次性验收入口：[P1 整包发布施工图与一次性验收](p1-integrated-release-package-2026-10-17.md)。2026-10-17 已对公众号资讯/咨询、学员/老师/管理员四栏、充值账本与统计做跨模块审计；前端固定 `283aaf15` [39031514964](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39031514964) typecheck/96回归 PASS；生产后代隔离 API `1b8ae8b3` [39083488661](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39083488661) typecheck/215测试/build、News/Profile/商业临时 MySQL Gate PASS。旧 e590 商业 Gate 因元数据字段名未别名失败已如实保留；隔离 1b8 的合成库恢复通过。生产 DDL 已通过；API 切流、商户与真机仍待验。公众号自动同步差异未解决，备份长期优化列业务最后；生产 DDL 前的最小恢复证据仍必需。

**ECS 固定候选第 1 关（2026-10-18）：** [完整归档回执](p1-paired-release-candidates-2026-10-18.md)记录 `STAGING_UPLOAD_AND_CHECK_PASS`，随后本 SHA `1b8ae8b3` 在唯一 staging 目录取得 `ARCHIVE_MANIFEST_AND_BLOBS_PASS`、`ECS_TYPECHECK_AND_BUILD_PASS`、`ECS_CANDIDATE_STAGING_PASS`；构建与 256 MiB／50% CPU／64 tasks 无 DB 冒烟 systemd 均 success/status 0，现役 `current` 仍为 `8cc4`。真实 DB/AI 负载、业务级恢复、切流及新体验版真机仍待验；生产 DDL 已另行通过。长期备份优化列末位。

**商户更新（用户 2026-10-18 回执）：** 虚拟支付和微信支付均已开通。ECS root 只读生产环境探针返回 `WECHAT_VIRTUAL_PAY_APP_KEY/OFFER_ID/PRODUCT_ONE/PRODUCT_TEN` 与 `CREDIT_FREE_GRANT_VERSION/AMOUNT` 均未配置，`WECHAT_VIRTUAL_PAY_ENABLED/PRODUCTION_APPROVED`、`CREDIT_ENFORCEMENT_ENABLED`、`NEWS_V2_ENABLED` 均未设为明确布尔值。因此当前生产充值与 News V2 仍不能用。所附截图展示虚拟支付基本配置页及一个 AppID 关联页；截图没有呈现 OfferID、两档道具 ID/价格、现网/沙箱 AppKey、生产配置状态、订单查询/发货/退款或真实交易。因此删除“尚未开通”的待办，保留“配置接线与实付验收”门槛。AI 评估次数购买走源码中的虚拟支付 `mode=goods` 和 `wx.requestVirtualPayment`；旧 JSAPI 下单端点仍返回 503，普通微信支付开通不自动使这条充值链可用。密钥只在受限生产环境配置，仓库/聊天/日志只记录存在性与脱敏标识。

**资讯停在 9 月的定位边界：** 10 月 12 日《中南大学保研看什么？成绩、综测与学院细则》已在同账号后台发表，但固定账号的 `freepublish/batchget` 完整两页仅返回 40 组 41 篇且无此目标；因此该篇缺失发生在自动同步的官方来源视图之前，不是分页、入库、标签或日期排序造成的。页面其他可能的新稿还受到现役 `GET /news` 的“状态 active 且标签非空”过滤；尚无所有 9 月以后稿件的逐篇源端→库→列表对照，不能把整个截止现象武断归为单一原因。数据分析 `getarticlesummary` 返回 47009，永久图文素材 0；自动来源适配**未解决**。管理员核实原链接的受控补录入口已有前端/API 代码，但生产 V2 七表已建立、开关未启用，尚不能用它交付最新文章，更不能称自动同步通过。

## 2026-10-18 生产只读探针及客服入口审计

管理员在 ECS root 对现役环境执行只读探针：`readOnlyProbe=PASS`、`dbEndpointLoopback=false`、`dbServerTls=disabled`、`dbRequireSecureTransport=OFF`、`dbSessionTlsActive=false`。因此 WSL 备份工具 `ssl-mode=REQUIRED` 与当前服务端能力冲突，解释 `MYSQL_ERROR_2026`；非 loopback 尚不足以判断数据库位于另一台机器。已提交 WSL 维护工具条件通道：先核 MySQL 握手 TLS 位；仅服务端不支持 TLS 且目标是 ECS 本机网卡数字 IP，才通过既有 SSH 隧道临时使用无 TLS MySQL 客户端；异机地址默认停止；现另有明确 `--accept-existing-db-route` 一次性选项，见下文。**10:00 左右现场 db-check 输出 `DB_STEP=REMOTE_CONFIG_READ`、`DB_STEP=SSH_TUNNEL_CREATE`，随后 `FAILED: DB_TLS_UNAVAILABLE_REMOTE_ENDPOINT`**，证明当前目标不满足同机规则；没有继续连接、导出、恢复或 DDL。下一步只读分类数据库目的地址与 ECS 路由，确定受保护的数据通道；当时的六组件 PARTIAL 不是全库备份；后续下载状态见下文。[工具说明](../../tools/maintenance/README.md)。

固定前端 `283aaf15` 源码审计：主页“联系顾问”、我的“联系顾问/联系运营”经 `/auth/me` 刷新身份后打开 `wx.openCustomerServiceChat`；游客明确以未登录身份进入。院校详情先验证会话、取可用资料，复制学校咨询摘要后打开客服；评估结果先核对账号及报告，复制评估摘要后打开客服。产品列表及产品详情（含底部按钮）直接打开同一客服，不复制身份摘要。共同配置为 `runtime.ts` 中企业微信 `corpId` 与 `kfid` URL；客户端只打开会话，不会自动发送，须人工粘贴或主动发送卡片。代码与合成导航测试覆盖部分分支；当前没有固定体验版逐入口打开和客服端实际接收回执。产品入口绕过身份摘要是现有行为，真机记录接收方能否识别咨询来源；若首发要求所有入口都带身份/产品上下文，应另做小范围修复并生成新前端 SHA。

**2026-10-18 用户补充的资讯故障范围：** 不是只有 10 月 12 日单篇缺失；用户观察到整个 10 月的文章系统性缺席，页面似乎停在 9 月。原 40 组 41 篇扫描只定位了一个已核实样本在当时官方来源视图前缺席。现已取得 45/45 组源端和生产库月份计数：10 月来源更新时间 9 条，入库 9 条且标签全空；现役 `/news` 过滤全部 9 条。标题级核对为八条产品资料及一条保研问答，目标单篇不在库；不能将这些更新时间记录当作 10 月真实新稿。不要把单篇证据推演为全月根因，也不要因 News V2 建表就宣称恢复自动同步。用户已批准 Profile 单列、News 七表、商业四表生产 DDL；三组生产 DDL 已逐项 PASS，API 切流和开关仍分别待验。

**四栏与客服／资讯当前边界（2026-10-18）：** 固定前端管理员选择学员或老师后，经只读凭证直接切到现有 `index/classroom/news/profile` 四个原生 Tab；不是另做镜像页。只读状态隐藏资料编辑、课表导入和计划保存入口，计划编辑页输入禁用；通用请求阻止非 GET，固定 API 也按只读凭证限制写入及可读路径。学员计划列表仍有“点击即可编辑／编辑”文字，需在体验版确认不会误导并可作为小范围后续文案修正。客服共用 `wx.openCustomerServiceChat`，代码接线不代表真机能打开或客服端已接收。10 月缺文可由管理员核实原文后受控补录，但自动同步缺口未修复，必须分别记录。生产三组结构已建立并检查；开关、体验版尚未启用／验收。

**2026-10-18 生产 DDL 首次现场尝试：未执行。** root 预检完成固定归档 `sha256sum: OK`，随后未出现 `PRODUCTION_DDL_PRECHECK_PASS` 或任何迁移步骤；原因是我方预检误使用 `jiuchen-api` 用户读取 staging，固定隔离构建脚本实际以 `0700` 建目录并 `chown -R jiuchen-deploy`，仅部署用户可进入。用户随后只读资讯诊断在同一不可达目录以 `jiuchen-api` 启动，报 `MODULE_NOT_FOUND`，未连数据库。现役 News timer `ActiveState=active`、11:27 CST 触发，近期服务日志有 `Succeeded`、同步 `total=46, created=0, updated=0`；仅证明任务运行，尚不证明 10 月文章覆盖。后续以 `jiuchen-deploy` 修正预检并成功执行了三组 DDL；实测见页首。

## 2026-10-18 最小恢复点快速通道

管理员路由探针 `readOnlyRouteProbe=PASS`：数据库主机名解析 1 地址，目的地址分类 `other`，ECS 来源 RFC1918，网络设备经网关。原严格工具 `db-check` 返回 `DB_TLS_UNAVAILABLE_REMOTE_ENDPOINT`；这是安全停止，不是数据库不可用。用户明确要求停止在备份治理细节上反复消耗时间，先获得最小可恢复点，再推进发布。

维护工具已新增显式 `--accept-existing-db-route` 选项：WSL→ECS 采用 SSH；ECS→DB 暂时复用现役 API 的无 MySQL TLS 路由，回执如实标记，不称端到端加密。无此选项维持拒绝；有 TLS 的服务端仍使用 TLS。本轮只需复用六组件 PARTIAL、补一份全量业务 SQL 到管理员 WSL 加密目录并在隔离 MySQL8 演练；ECS 40 GB 属共享磁盘空间，不作为长期备份仓。现场 `db-check` 已返回 `DB_READONLY_CONNECTION_CHECK_PASS`，使用 `DB_TRANSPORT=EXISTING_PRODUCTION_DB_ROUTE_NO_TLS_EXPLICIT`；六组件已在原 PARTIAL 中逐项解密复验。数据库 `MYSQL_CONNECT_AND_ENGINE_CHECK` 成功，但首次完整导出在 `MYSQLDUMP_FULL_EXPORT:CLIENT_OPTION_UNSUPPORTED` 停止，原因是工具误把 `mysql` 的 `--connect-timeout=15` 传给 `mysqldump`。修正版 `60f8b331` 已移除此参数，本地 16 项测试通过。该次续传问题已由后续修正版解除；最新下载与演练状态见下一段，生产 DDL 门槛不变。[工具步骤](../../tools/maintenance/README.md)。长期区间化与缓存优化发布后再做；不能对个人历史数据做有损特征提取冒充可恢复备份。

**2026-10-18 最小恢复点实测：** 原 PARTIAL 的 website、api、runtime、user-files、secrets、entry 六项已复验并复用；数据库全量 SQL 导出完成，加密包通过下载校验（`KNOWN_COMPONENTS_DOWNLOAD_VERIFIED`、`DATABASE_DOWNLOAD_VERIFIED`）。管理员 WSL 使用既有 `mysql:8.0` 镜像在隔离容器中解密、导入、检查表数，回执 `ISOLATED_SQL_IMPORT_AND_CHECK_PASS`、`tables=17`、`productionWrites=false`、`businessAcceptance=false`。备份目录 `/home/orangelee-tech/jiuchen-backups/20261016-134131-cf772f`；不向 GitHub 上传资料。此证据解除“尚无可导入业务库备份”的阻断；仍未证明生产备份已在生产环境恢复、逐行等价、官网/CloudBase 全资产覆盖或候选迁移兼容。恢复演练工具 `a43c497b` 本地 17 项合成测试 PASS。后续已在真实结构副本完成迁移演练，并完成三组生产 DDL；长期备份优化仍列发布后。

**真实结构迁移一次性演练准备（2026-10-18）：** [固定脚本](../../tools/maintenance/p1-real-schema-rehearsal-20261018.sh) SHA-256 `52388984af56c13b4ce48dd760e1caa7df430ebcfa913b68ac250ee94c31dddc`，只在管理员 WSL 创建临时 MySQL8，解密已验证的业务备份、恢复 17 表，固定取 ECS staging 的 API `1b8ae8b3` 归档并验证 SHA-256 `98279923...`。按 Profile 单列、News 七表、商业四表顺序执行两次迁移和合同检查，目标 28 表；退出清理临时容器和明文。管理员已在 WSL 实跑：固定 API 归档校验、依赖安装、本地备份解密、隔离 MySQL8 恢复 `RESTORED_SOURCE_TABLES=17`，Profile、News、商业迁移各自升级及重复执行均 PASS，Profile/商业合同检查 PASS，`REAL_17_TABLE_SCHEMA_REHEARSAL_PASS; final_tables=28; production_writes=false`。这是该备份真实结构与候选迁移兼容的证据；演练当时未在生产执行 DDL；后续独立执行的生产 DDL 见页首。这些步骤仍不等于逐行数据或真机业务验收。官方资讯来源缺文、商户配置、四角色真机仍分别待验。

## 当前版本与已经证实的事实

| 对象 | 最后可靠证据 | 当前判定 |
| --- | --- | --- |
| 集成分支 | p1/foundation 为移动工程分支；前端 283aaf15 与 API 1b8ae8b3 是不同固定候选；验证工作流提交 d6bf7ed4、归档工作流提交 76583544。读者仍需重新读取实际 HEAD | HEAD 是工程状态，不是生产 SHA |
| 现役 API | 10-16 用户 ECS 回执 active 8cc4bb85ffdf3e86e7a13a89d119f1b110491e48，previous b150d2c5c8720aac8d48fbd0395d8db9c408bc63；172.25.80.203:3100 的 live/health 200、database=ok | 最后观察时健康；无 10-17 新部署证据 |
| 前端候选 | 283aaf15fc0047f100028eee547a5581c3f8c047；本地 Runner run 39031514964 类型检查及 96/96 回归 PASS | TEST PASS，微信上传/本轮真机未证实 |
| 后继隔离 API | 1b8ae8b3c5a1285b84ab6b5f573ca9db5d93d0a7；run 39083488661 API typecheck/215测试/build 及 News/Profile/商业临时 MySQL Gate PASS；run 39083622604 生成只读归档；2026-10-18 ECS 独立构建与无 DB 限额冒烟 PASS | CODE/TEST/ECS基础启动 PASS；真实 DB/AI、部署仍待验 |
| 配对发布候选 | 前端 283aaf15：run 39031514964 typecheck/96 回归 PASS；API 1b8ae8b3：run 39083488661 四项 PASS 且本 SHA ECS staging 无 DB 冒烟 PASS。集成 283a 的 API 归档失败 39032218889（生产祖先约束） | 前端 TEST PASS；新 API TEST/ECS基础启动 PASS；PROD/DEVICE PENDING |
| ECS 资源证据 | 旧 e590 的无 DB 冒烟峰值 72585216 bytes、failcnt 0；新 1b8 独立 staging 构建与无 DB 256MiB/50%CPU/64tasks 冒烟已通过，用户粘贴省略了新峰值数字 | 新 1b8 基础启动 PASS；真实数据库/AI/并发负载 PENDING |
| 已通过真机的现役链路 | 课表导入/第一周/本周、AI评估草稿→运行→保存→历史、172张院校图、已有人工客服 | 现役基线 PASS；不能代替新候选真机验收 |
| GitHub Actions | 云端托管分钟数 2000 用尽、额外预算 0；自托管 WSL Runner 曾完成固定候选 Gates。旧云端作业在执行步骤前失败 | 不把旧红灯当代码失败，不无效重跑 |

完整证据：[后继候选及 ECS 回执](p1-release-closeout-2026-10-16.md)、[本地 Runner](p1-local-runner-recovery-2026-10-16.md)。旧隔离候选 eda525c1 的小程序 TS2783 失败是历史记录；前端 449d7472 的通过不能回填旧 SHA。

## 正式发布业务缺口与依赖

| 顺序 | 模块 | CODE / TEST | 生产与真实使用 | 下一决定或动作 |
| --- | --- | --- | --- | --- |
| 1 | 首发功能边界与固定候选 | 整包 API 含 AI quality v3 且没有独立开关；集成分支还有 News V2、商业路径等未获同批授权 | 1b8ae8b3 未部署 | 冻结首发含哪些功能；仅核心则制作 core-only 新候选并按新 SHA 重新验证，不能借既有绿灯扩大范围 |
| 2 | Profile 入学年份 | 单列迁移在临时 MySQL 两次执行及旧行往返 PASS | 2026-10-17 只读列清单再次确认 user_profiles.enrollment_year 缺失，GET /me/profile 曾 500 | 真实备份隔离迁移 PASS；该单列 DDL 已通过生产 checker；认证后的资料读写待验 |
| 3 | 收费、次数和商业后台 | 固定 1b8 与现役 8cc4 的商业交易源码无差异（schema checker 单独修复）；检查器已修正；虚拟支付、赠送 1+4、¥1.90/¥16.90 与 283a 前端充值界面有代码/单元测试；两项支付能力据用户回执已开通，配置接线和真实商户链路未验收 | 2026-10-17 两轮只读元数据确认四张商业表全部缺失；业务库默认及 users/assessments/user_profiles 同为 utf8mb3_general_ci，两父表 id 为 PRIMARY；真实充值/扣减/金额不可用 | 旧 e590 商业隔离 Gate 因元数据字段映射错误失败；283a 集成代码 Gate PASS；隔离 1b8 同类合成迁移/约束/恢复复验 PASS；真实备份结构隔离迁移 PASS；生产四表及 checker 已 PASS；商户交易仍 PENDING；随后核对官方虚拟支付准入、赠送版本与开关、退款/发货/对账及真机支付；旧 JSAPI 下单端点恒 503 |
| 4 | 资讯与官方来源 | 旧 /news 兼容；News V2 七表混合字符集临时迁移/关系回归 PASS，合同为正常30条＋旧文72小时 | 生产七表已建、开关未启用；10月12目标已在公众号后台发表但不在官方 freepublish 列表；自动来源未通过 | 先决定首发是旧资讯有限范围、可核实原文的受控补录，还是必须完成 V2/自动同步；后两项不得冒充同一个验收 |
| 5 | 管理员、老师与体验 | 只读统计/身份、客服复制、报告导出等有代码及模拟回归；只读跨身份复用原生页面并有授权边界 | 周/月/年统计、角色样本、首页/课表刷新、客服粘贴、图片/MD/DOCX/PDF 导出在新体验版尚无真机全项回执；部分教师/已分配学员样本缺 | 一次性上传固定前端体验版，按 [真机清单](p1-unified-device-acceptance-2026-10-14.md) 逐项记录 PASS/FAIL/BLOCKED；缺样本记 DATA PENDING，不造数据 |
| 6 | 受控发布与资源 | 1b8 代码门禁通过；本 SHA ECS 独立构建与无 DB 限额冒烟 PASS | 生产 API 仍是 8cc4；新候选真实 DB/AI 负载、业务健康、回滚、微信提审/正式版均未执行 | 三组 DDL 已通过；依据最终范围与精确 SHA 分别处理 API promote、开关和微信版本；ECS 同 256MiB/50%/64 限额下验证真实依赖后切流、真机回归、提交审核 |
| 7 | 管理员备份与救火 | 加密下载、诊断、隔离上传及恢复演练接口；工具本地 17 项合成测试 PASS | 2026-10-18 已知六组件复验复用、数据库全量导出与加密下载 PASS；WSL 独立 MySQL8 导入 17 表 PASS。全资产覆盖、逐行等价与业务级恢复仍待验 | 最小库恢复点成立；该真实结构副本的候选迁移已 PASS；三组生产 DDL 已获批并检查通过。长期版本治理与自动清理后置 |

顺序是业务价值与决策顺序，不是允许跳过安全依赖。当前不能宣称“完整收费上线”“最新资讯自动同步通过”或“全功能正式版通过”。[发布问题逐项分析](p1-release-open-items-2026-10-17.md)解释并行关系、推荐路径和每项验收。News V2 的七表、Profile 单列、商业表与各功能开关是不同审批范围。

## 当前执行边界

- 本次三组生产 DDL 已获批准并执行；API 切流、News V2/支付/AI 参数开关、公司官网/共享代理变更、微信正式发布仍需具体版本、范围、恢复与结果对应的独立确认。不可手工编辑 current；API 使用现有 approved-release、READY、jiuchen-promote 的健康与回滚机制。
- 现役旧 /news 与已验收 AI/课表可用于有限体验版；不将体验版路径可打开写成生产完整功能通过。
- 公众号自动来源首缺口在官方视图前，2026-10-14 同 AppID 后六位 4880db 的目标已发表、freepublish 两页40组41篇无目标；getarticlesummary 返回 47009，永久图文素材数 0。不要重复扫描后把缺文归因于标签/窗口。来源 update_time 只能写“来源更新时间”，真实发表时间仍待核。
- 生产商业四表已建并通过 checker；coaching_records/growth_records 缺失；不把统计缺表显示成 0。跨身份只读功能不能未经批准扩大角色查看权。
- 维护工具故障原始密钥、数据库地址、个人数据和明文备份不进 Git、Actions、聊天或普通日志。README 与 [备份合同](../ops/business-backup-restore-contract-2026-10-16.md)为详细范围；productionBackupRestored=false，fullBusinessCoverage=false。

## 接手与回报

重新读取分支 HEAD、生产实际 SHA、对应 Actions run、微信版本与生产配置开关（只记录脱敏状态）。按模块分别报告 CODE / TEST / APPROVAL / DEPLOY / DEVICE；缺证据写 PENDING。此前的生产只读健康、固定候选测试和无数据库资源冒烟已有记录，无变化不重复要求同套人工日志。

旧时间线、原候选及测试详见 [2026-10-16 收尾](p1-release-closeout-2026-10-16.md)、[统一真机清单](p1-unified-device-acceptance-2026-10-14.md)、[公众号来源证据](p1-final-ci-and-source-evidence-2026-10-14.md)、[生产真实数据审计](real-data-closeout-2026-10-12.md)及本文件 Git 历史；旧文的“下一步”不覆盖本页。
