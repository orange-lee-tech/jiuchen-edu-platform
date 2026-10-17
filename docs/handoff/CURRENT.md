# CURRENT — 九辰教育唯一活跃交接（2026-10-17）

本页只记当前可执行状态。完整收费版为正式交付目标，生产收费尚未验收；[固定候选与独立 DDL 审查包](p1-paid-release-scope-and-schema-review-2026-10-17.md)用于下一轮现场核对。历史事实保留在 Git 历史和下列专项文档中，旧日期的计划、候选 SHA、绿灯和“下一步”不自动成为今天的授权。接手先读 CONSTITUTION.md → AGENTS.md → 本页 → 对应专项文档；涉及 ECS 再读 ops/ecs/AGENTS.md。

本轮整包施工和一次性验收入口：[P1 整包发布施工图与一次性验收](p1-integrated-release-package-2026-10-17.md)。2026-10-17 已对公众号资讯/咨询、学员/老师/管理员四栏、充值账本与统计做跨模块审计；前端补录入口与人工来源标注候选 `1e3f22e57b7eeff817fddd389915a7c5da15dd0e` 已提交，尚未取得该候选的类型检查、微信或生产回执。公众号自动同步差异未解决，备份长期优化列业务最后；生产 DDL 前的最小恢复证据仍必需。\n\n## 当前版本与已经证实的事实

| 对象 | 最后可靠证据 | 当前判定 |
| --- | --- | --- |
| 集成分支 | p1/foundation 为移动工程分支；本次交接审核基于 24db375fe3383129ce78e162a1359d37bd44112f 的代码树并有后续文档提交。读者需重新读取实际 HEAD | HEAD 是工程状态，不是生产 SHA |
| 现役 API | 10-16 用户 ECS 回执 active 8cc4bb85ffdf3e86e7a13a89d119f1b110491e48，previous b150d2c5c8720aac8d48fbd0395d8db9c408bc63；172.25.80.203:3100 的 live/health 200、database=ok | 最后观察时健康；无 10-17 新部署证据 |
| 前端候选 | 449d7472adff884401e375703364384bf0c65034；本地 Runner run 38891917207 类型检查及 95/95 回归 PASS | TEST PASS，微信上传/本轮真机未证实 |
| 后继隔离 API | e5908185b3b460a04a8102b7e2a30b663623ac30；run 38893179855 API typecheck/215测试/build、News/Profile 临时 MySQL Gate 均 PASS；归档 SHA256 ae1db0fa1ee8af35881a0f1a09b4d7fd47134a2707e56d25ee2fcc1f2798ddc2 已在 ECS staging 验证 | CODE/TEST PASS；PROD NOT DEPLOYED |
| ECS 候选资源 | Node22 typecheck/build PASS；256MiB/50%CPU/64tasks 的无数据库启动与30次健康请求 PASS，内核峰值 72585216 bytes、failcnt 0 | 基础冒烟 PASS；带真实数据库/AI/并发负载 PENDING |
| 已通过真机的现役链路 | 课表导入/第一周/本周、AI评估草稿→运行→保存→历史、172张院校图、已有人工客服 | 现役基线 PASS；不能代替新候选真机验收 |
| GitHub Actions | 云端托管分钟数 2000 用尽、额外预算 0；自托管 WSL Runner 曾完成固定候选 Gates。旧云端作业在执行步骤前失败 | 不把旧红灯当代码失败，不无效重跑 |

完整证据：[后继候选及 ECS 回执](p1-release-closeout-2026-10-16.md)、[本地 Runner](p1-local-runner-recovery-2026-10-16.md)。旧隔离候选 eda525c1 的小程序 TS2783 失败是历史记录；前端 449d7472 的通过不能回填旧 SHA。

## 正式发布业务缺口与依赖

| 顺序 | 模块 | CODE / TEST | 生产与真实使用 | 下一决定或动作 |
| --- | --- | --- | --- | --- |
| 1 | 首发功能边界与固定候选 | 后继 API 含 AI quality v3 且没有独立开关；集成分支还有 News V2、商业路径等未获同批授权 | e5908185 未部署 | 冻结首发含哪些功能；仅核心则制作 core-only 新候选并按新 SHA 重新验证，不能借既有绿灯扩大范围 |
| 2 | Profile 入学年份 | 单列迁移在临时 MySQL 两次执行及旧行往返 PASS | 2026-10-17 只读列清单再次确认 user_profiles.enrollment_year 缺失，GET /me/profile 曾 500 | 精确单列审批包、生产相关结构复刻和备份隔离恢复后，批准才执行 DDL 并验证资料读写 |
| 3 | 收费、次数和商业后台 | 固定 e590 与现役 8cc4 的商业源码无差异；虚拟支付、赠送 1+4、¥1.90/¥16.90 与 449 前端充值界面有代码/单元测试；商户链路未验收 | 2026-10-17 两轮只读元数据确认四张商业表全部缺失；业务库默认及 users/assessments/user_profiles 同为 utf8mb3_general_ci，两父表 id 为 PRIMARY；真实充值/扣减/金额不可用 | 商业四表固定候选同字符集隔离 Gate 待取回运行回执；随后核对官方虚拟支付准入、赠送版本与开关、退款/发货/对账及真机支付；旧 JSAPI 下单端点恒 503 |
| 4 | 资讯与官方来源 | 旧 /news 兼容；News V2 七表混合字符集临时迁移/关系回归 PASS，合同为正常30条＋旧文72小时 | 生产七表缺失、开关未启用；10月12目标已在公众号后台发表但不在官方 freepublish 列表；自动来源未通过 | 先决定首发是旧资讯有限范围、可核实原文的受控补录，还是必须完成 V2/自动同步；后两项不得冒充同一个验收 |
| 5 | 管理员、老师与体验 | 只读统计/身份、客服复制、报告导出等有代码及模拟回归；只读跨身份镜像另有授权边界 | 周/月/年统计、角色样本、首页/课表刷新、客服粘贴、图片/MD/DOCX/PDF 导出在新体验版尚无真机全项回执；部分教师/已分配学员样本缺 | 一次性上传固定前端体验版，按 [真机清单](p1-unified-device-acceptance-2026-10-14.md) 逐项记录 PASS/FAIL/BLOCKED；缺样本记 DATA PENDING，不造数据 |
| 6 | 受控发布与资源 | 固定候选代码和无 DB 冒烟已过 | 生产 API 仍是 8cc4；新候选真实 DB/AI 负载、业务健康、回滚、微信提审/正式版均未执行 | 依据最终范围与精确 SHA 单独审批 DDL、API promote、开关和微信版本；ECS 同 256MiB/50%/64 限额下验证后切流、真机回归、提交审核 |
| 7 | 管理员备份与救火 | 组件化加密下载、诊断、计划、隔离上传及隔离 MySQL 演练接口；本地 12 项合成测试 PASS | 10-16 doctor 已知源站全 true；六组件已下载为 PARTIAL。10-17 db-check：本机 MySQL8、SSH 配置读取和隧道建立成功，MySQL_CONNECT_AND_ENGINE_CHECK 返回 ERROR 2026，数据库组件未完成。隔离恢复、全资产覆盖与生产覆盖工具未验收 | 业务排序置末；在任何生产 DDL 前必须解除最小可恢复点门槛。2026 表示客户端 SSL 连接错误，具体 TLS 原因未知，不重试完整备份或擅自降级 TLS |

顺序是业务价值与决策顺序，不是允许跳过安全依赖。当前不能宣称“完整收费上线”“最新资讯自动同步通过”或“全功能正式版通过”。[发布问题逐项分析](p1-release-open-items-2026-10-17.md)解释并行关系、推荐路径和每项验收。News V2 的七表、Profile 单列、商业表与各功能开关是不同审批范围。

## 当前执行边界

- 生产 DDL、API 切流、News V2/支付/AI 参数开关、公司官网/共享代理变更、微信正式发布需具体版本、范围、恢复与结果对应的独立确认。不可手工编辑 current；API 使用现有 approved-release、READY、jiuchen-promote 的健康与回滚机制。
- 现役旧 /news 与已验收 AI/课表可用于有限体验版；不将体验版路径可打开写成生产完整功能通过。
- 公众号自动来源首缺口在官方视图前，2026-10-14 同 AppID 后六位 4880db 的目标已发表、freepublish 两页40组41篇无目标；getarticlesummary 返回 47009，永久图文素材数 0。不要重复扫描后把缺文归因于标签/窗口。来源 update_time 只能写“来源更新时间”，真实发表时间仍待核。
- 生产商业四表缺失、coaching_records/growth_records 缺失；不把统计缺表显示成 0。跨身份只读功能不能未经批准扩大角色查看权。
- 维护工具故障原始密钥、数据库地址、个人数据和明文备份不进 Git、Actions、聊天或普通日志。README 与 [备份合同](../ops/business-backup-restore-contract-2026-10-16.md)为详细范围；productionBackupRestored=false，fullBusinessCoverage=false。

## 接手与回报

重新读取分支 HEAD、生产实际 SHA、对应 Actions run、微信版本与生产配置开关（只记录脱敏状态）。按模块分别报告 CODE / TEST / APPROVAL / DEPLOY / DEVICE；缺证据写 PENDING。此前的生产只读健康、固定候选测试和无数据库资源冒烟已有记录，无变化不重复要求同套人工日志。

旧时间线、原候选及测试详见 [2026-10-16 收尾](p1-release-closeout-2026-10-16.md)、[统一真机清单](p1-unified-device-acceptance-2026-10-14.md)、[公众号来源证据](p1-final-ci-and-source-evidence-2026-10-14.md)、[生产真实数据审计](real-data-closeout-2026-10-12.md)及本文件 Git 历史；旧文的“下一步”不覆盖本页。
