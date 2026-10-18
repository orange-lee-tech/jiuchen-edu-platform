# P1 完整收费版：固定候选、Profile 与商业 Schema 审查包（2026-10-17）

**2026-10-18 发布候选更正：** 前端固定 SHA 为 `283aaf15fc0047f100028eee547a5581c3f8c047`，隔离 API 固定 SHA 为 `1b8ae8b3c5a1285b84ab6b5f573ca9db5d93d0a7`。API 是现役 `8cc4bb85` 的后代、在 e590 上仅修复商业 schema 检查器；集成提交 `283aaf15fc0047f100028eee547a5581c3f8c047` 的 API 测试通过，但归档器因不满足生产祖先约束拒绝它，不能把它作为 API 发布包。新 API 的固定验证：[39083488661](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39083488661)（verify/News/Profile/商业四项成功）。下文凡称“283a 整包 API 候选”仅为 10 月 17 日代码测试历史，不是当前可归档 API。生产部署、DDL、商户和真机仍待实际验收。 固定隔离 API 的四项门禁 [39083488661](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39083488661) PASS（Node22 typecheck、215/215、build，News/Profile/商业临时 MySQL）；[归档 39083622604](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39083622604) PASS，内层 tar.gz SHA-256 `98279923d783889caa87deb815d3828d53266a84a7be081714188a71f1fc1fb8`，仅供审查。详情：[配对候选回执](p1-paired-release-candidates-2026-10-18.md)。

更新（2026-10-17）：旧 e590 商业 Gate [39029785435](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39029785435) 失败：四表建立后，检查器未给 information_schema 字段显式别名，误读元数据。整包修复候选 283aaf15fc0047f100028eee547a5581c3f8c047 的 [39031514966](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39031514966) 已通过 verify/News/Profile/商业合成 Gate；原文中的“Gate 待取回”和 e590 作为收费发布候选的判断已过时，按 [整包施工图](p1-integrated-release-package-2026-10-17.md)执行。

状态：**审查就绪；生产 DDL / 收费启用 / API 切流 / 微信正式发布均未授权、未执行**。本页仅用源码与既有回执缩小下一步，不把单元测试当成商户验收。接手先读 [CURRENT](CURRENT.md) 和 [正式发布缺口](p1-release-open-items-2026-10-17.md)。真实数据库结构、商户控制台和新真机结果仍须现场核对。

## 一、固定对象与实际差异

- 现役 API 最后观察：`8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`。后继 API：`e5908185b3b460a04a8102b7e2a30b663623ac30`；固定前端：`449d7472adff884401e375703364384bf0c65034`。`p1/foundation` 的移动 HEAD 不替代任何一个。
- 比较 `8cc4...e590...`：38 个文件差异，主要是 Profile 单列检查/迁移、News V2 七表及路由、管理员/身份、AI quality v3 与测试。**商业路由、虚拟支付适配器、四表迁移与价格/赠送策略在该比较中没有差异**；它们属于 8cc4 源码既有的关闭/未验收能力。此处只证明 Git 差异，不推断生产环境开关值。
- e590 的本地 Runner run 38893179855：API typecheck、215/215、build 与临时 MySQL News/Profile Gate PASS；ECS Node22 staging typecheck/build PASS，256MiB/50%/64 tasks 无 DB 冒烟 PASS。未完成真实 DB/AI/支付并发资源验收。449 前端 run 38891917207：类型检查及 95/95 PASS；没有本轮真机支付结果。
- e590 包含 AI quality v3 且无独立开关；若完整收费版包含它，须审查该质量行为、成本与真实样本。News V2 默认关闭；是否同批承诺最新内容/收藏仍须明确。若排除 AI quality v3，必须生成新 API SHA 并复验，不从 e590 拆文件手工上线。

## 二、收费闭环的精确状态

| 环节 | 源码中可核对 | 生产/外部缺口 |
| --- | --- | --- |
| 额度与价格 | `commercial-config.ts` 只允许游客 1 次、学员总计 5 次（1+4）、一次 ¥1.90、十次 ¥16.90；评估成功持久化后扣 1 次。启用时要求稳定赠送版本且 `CREDIT_FREE_GRANT_AMOUNT=1` | `CREDIT_ENFORCEMENT_ENABLED` 默认 false；现役开关真实值、现有用户是否已获赠及版本未核；不得改变赠送版本导致重复发放 |
| 下单 | `POST /me/virtual-payment-orders` 用登录用户、同一 openID 的新 `wx.login` code、服务端 SKU 创建订单和签名；旧 `POST /me/payment-orders` 恒返回 503 | 虚拟支付商户/产品/小程序资格、生产参数及适配器与官方控制台实际格式/状态码尚未验；不能用旧 JSAPI 兜底 |
| 交付 | `POST /me/virtual-payment-orders/:id/reconcile` 查询微信订单，订单金额与状态证据通过后事务性入账；重复查询应幂等；另尝试通知发货 | 未有真实沙箱/小额真机实测、订单查询延迟/退单/发货失败/财务对账回执；退款自动扣回尚未实现 |
| 前端 | 449 的评估表单显示额度、SKU、`wx.requestVirtualPayment`、保存待核订单并提供重查 | 未在开发者工具及 iOS/Android 真实商户环境走通取消、支付成功、延迟到账、重复核实、退款 |
| 统计 | 管理员成功评估次数与已付订单金额/频次有代码 | 生产缺表不能把金额显示为 0；时区、历史订单、退款口径及角色权限尚须实测 |

虚拟支付的适用政策和接口参数以甲方小程序/商户官方控制台当期准入与开发文档核实；仓库注释或第三方报道不能代替核准。**先核对官方产品 ID/offer ID、商户资质和回调/查询/发货要求，再决定是否可在该账号启用。**不要向 Git/聊天回传 appKey、session_key、私钥或订单个人信息。

## 三、独立 Profile 单列包（只读准备，不执行）

- 目标：`user_profiles.enrollment_year INT NULL AFTER current_grade`；唯一 DDL 为 `ALTER TABLE user_profiles ADD COLUMN enrollment_year INT NULL AFTER current_grade`，见固定 e590 的 `services/api/src/db/profile-schema-contract.ts` 与 `upgrade-enrollment-year.ts`。现役资料 GET 曾因缺列 500。
- 脚本只在 `user_profiles` 的合同列与类型/空值兼容、且唯一缺口是该列时执行；已兼容则不操作；意外结构则失败关闭。与 News 七表、商业四表分开审批。
- 尚须在生产**只读**取该表列/索引、行数区间、字符集/排序规则与 MySQL 版本，不含个人值；以相同结构的隔离库做双次迁移、旧行读写及备份恢复，评估 DDL 锁表/时间。执行前需证明业务库可恢复点可用。升级脚本目前只读取 `DATABASE_URL`，现役可能使用 `DB_*` 分离配置，运维须先核对实际注入机制，禁止把口令贴在命令行、日志或仓库。
- 若单列已经存在，运行只读 `db:check:profile` 并做认证后的资料读/改/重开；若 DDL 后业务失败，回退 API 版本，保留可空列和已写入数据，不自动 DROP/覆盖库。

## 四、独立商业四表包（只读准备，不执行）

固定 e590 的 `services/api/src/db/upgrade-credit-payment-foundation.ts` 依次 `CREATE TABLE IF NOT EXISTS`：

| 表 | 核心职责 | 关键约束 |
| --- | --- | --- |
| `payment_orders` | 用户订单/金额/次数/状态 | `out_trade_no`、提供方交易号唯一；`user_id → users.id` |
| `credit_ledger_entries` | 赠送、付款入账、成功评估扣减 | `idempotency_key` 唯一；`user_id`、`assessment_id`、`payment_order_id` 外键 |
| `credit_reservations` | 评估执行中的额度占用 | `assessment_id` 唯一；用户与评估外键 |
| `payment_notifications` | 已验证通知/查询入账去重 | `notification_id` 唯一；不存原始敏感载荷 |

2026-10-17 19:38（北京时间）用户在现役 ECS 执行只读元数据查询：四张商业表全部缺失，`users`、`assessments`、`user_profiles` 均为 InnoDB / `utf8mb3_general_ci`，父表 `id` 均为 `varchar(36)`、`utf8mb3_general_ci`。`user_profiles` 其余合同列存在且类型/可空性符合当前脚本预期，唯一缺 `enrollment_year`。仅看元数据，未导出行。19:41 第二次只读回执确认数据库默认 `utf8mb3_general_ci`，`users.id` 与 `assessments.id` 均为 PRIMARY 唯一主键，现役使用 `DATABASE_URL`。因此现有商业迁移脚本在**该字符集/外键前提上**无需改动固定候选 SHA；仍需真实 MySQL 隔离执行和 schema checker。迁移依赖 `users` 和 `assessments` 的主键类型/索引及 InnoDB 外键兼容。既有生产 utf8mb3/utf8mb4 混合；脚本未指定显式字符集；若数据库默认值不是父表的 `utf8mb3_general_ci`，新表外键列可能继承不兼容的字符集/排序规则。MySQL 对字符型外键要求父子列的字符集及排序规则相同。本次只读核对已确认数据库默认值与两个父表 id 排序规则、主键索引一致；字符集疑点解除。现有固定候选未变，已在既有 `p1-isolated-mixed-local.yml` 增加仅该文件 push 时运行的 `commercial-gate`，固定 checkout e590，使用一次性 MySQL8 和生产相同的 `utf8mb3_general_ci` 默认值，核双次建表、六外键/负例、四表合同及合成数据转储恢复。该 Gate 的初始工作流提交 `6e0d01db1c37792b8db710901b06b83948cbdf2f` 在 [39029785435](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39029785435) 因检查器字段映射失败；整包候选 `283aaf15` 修复后在 [39031514966](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39031514966) 完成四表双次迁移、合同、六外键、负例及合成备份恢复 PASS。它仍不是完整生产结构复刻或生产备份。此脚本也只读取 `DATABASE_URL`。

本包批准前：只读检查四表状态（已确认全缺）、数据库默认字符集和父表主键索引/外键条件（本轮只读已确认）、既有评估数据量；在隔离库双次执行四表脚本与 `db:check:credit-payment`、模拟发放/充值/扣减和备份恢复；确认最小可恢复点。**四表审批不含 Profile 或 News DDL，也不自动启用 CREDIT/虚拟支付开关。** 已存在同名但结构不兼容的表会被 `IF NOT EXISTS` 跳过，须以 checker 失败停止，不得强行覆盖。

## 五、待现场完成的顺序与回执

1. 固定首发承诺：完整收费版包含用户赠送/充值/扣次/真实金额统计；确认 AI quality v3 是否同批，以及 News V2/最新文章是否同批。给出 e590、449 的精确匹配范围。
2. 只读取得 Profile 与商业父/子表结构和**脱敏**开关存在性；从官方控制台核实虚拟支付准入与具体 API 合同。若官方要求与当前签名/状态码/退款不一致，先修候选并重新测/重打包。
3. 使用生产结构复刻的隔离库完成 Profile、商业各自迁移与恢复演练。最小业务库可恢复点需在任何生产 DDL 之前通过；备份工具的增量优化留在业务事项最后。
4. 分别审批 Profile 单列、商业四表；各自执行后只读 checker + 认证链路验收。再单独审批 API 固定 SHA 切流、赠送版本/收费及虚拟支付开关；各项实际回执分开记录。
5. 真实 DB/AI 负载在既有 256MiB、50%CPU、64 tasks 限额下观察；试付、取消、延迟核实、重复入账、退款/发货、统计与角色真机通过后才提交微信审核。任何未验项写 PENDING，不把体验版/临时库当正式商业验收。

恢复策略：部署失败由现有发布器回切上一 API；关收费/虚拟支付开关阻止新交易，但已发生订单与账本不得删除；已经执行的新增可空列/新表默认保留。退款、已付未到账与争议订单须人工财务核对并补偿，不自动回滚真实交易。生产恢复/覆盖数据库另案审批。
