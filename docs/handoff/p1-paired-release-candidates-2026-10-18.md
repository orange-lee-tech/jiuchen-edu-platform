# P1 配对发布候选与门禁回执（2026-10-18）

本页记录**固定前端与隔离 API 两条源码线**。生产部署、生产 DDL、付费开关、微信公众号来源自动覆盖和微信正式发布尚未发生；旧运行与新候选不能相互代替。现役 API 最后有证据的 SHA 为 `8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`。

| 对象 | 固定 SHA / 制品 | 证据与界限 |
| --- | --- | --- |
| 小程序前端 | `283aaf15fc0047f100028eee547a5581c3f8c047` | [39031514964](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39031514964)：typecheck、96/96 回归 PASS；本轮尚无微信上传及真机回执 |
| API 发布源码 | `1b8ae8b3c5a1285b84ab6b5f573ca9db5d93d0a7` | 现役 `8cc4` 的后代；较旧隔离候选 e590 仅修复商业 schema checker。固定 Gate [39083488661](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39083488661)：verify、mysql-gate、profile-gate、commercial-gate 全部 PASS：Node22 typecheck、215/215 测试、build，News 七表混合字符集、Profile 单列、商业四表双次迁移/约束/合成恢复 |
| API 审查归档 | [39083622604 Artifact 12120032514](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39083622604/artifacts/12120032514) | 归档器校验生产祖先、固定 SHA、Git blob、路径和文件清单；内层 `jiuchen-api-1b8ae8b3c5a1285b84ab6b5f573ca9db5d93d0a7-readonly.tar.gz` 的 SHA-256 为 `98279923d783889caa87deb815d3828d53266a84a7be081714188a71f1fc1fb8`；外层 GitHub ZIP digest 为 `5a74ed7f6f2e86cfa06ec33e3048c1bf311a90a58e438dc5e0c118a0508ae5f8`，用途不同。制品状态 `REVIEW_ARTIFACT_ONLY_NOT_PRODUCTION_APPROVED`；GitHub 7 天保留至 2026-10-25 00:45 UTC |
| 10-17 集成 API 测试 | `283aaf15fc0047f100028eee547a5581c3f8c047` | [39031514966](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39031514966) 代码测试通过，但 [39032218889](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39032218889) 归档失败：集成提交不满足生产祖先约束。绝不以它作 API 发布包 |

2026-10-18 逐文件比较两候选的 `services/api` Git blob：**运行文件完全一致**，隔离 API 额外保有 `services/api/src/routes/mobile-admin.release-a.test.ts` 测试文件。此事实说明配对源码关系，不代替在生产配置下的兼容与真机验收。

## ECS 上传回执

2026-10-18 09:13 前后（北京时间），管理员 Windows PowerShell 将 [Artifact 12120032514](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39083622604/artifacts/12120032514) 解出后上传至 `/opt/jiuchen-api/staging/incoming/1b8ae8b3c5a1285b84ab6b5f573ca9db5d93d0a7/`。本地归档校验及 ECS `sha256sum -c` 返回 `STAGING_UPLOAD_AND_CHECK_PASS`；归档 SHA-256 为 `98279923d783889caa87deb815d3828d53266a84a7be081714188a71f1fc1fb8`。这是传输完整性回执。随后在 ECS staging 完成归档 Git blob 校验、隔离构建与无 DB 限额冒烟；仍未连接生产数据库或切流。

## 兼容性优先的收束路径（2026-10-18）

| 顺序 | 完成定义 | 当前阻断 |
| --- | --- | --- |
| 1. ECS 候选兼容性 | 对固定 1b8 归档做 manifest/blob 校验、独立目录构建、Node 22 限额无 DB 冒烟与真实依赖/AI 负载；现役 API 和官网不变 | 归档校验、独立构建及无 DB 限额冒烟 PASS；真实生产 DB/AI 负载仍 PENDING |
| 2. 公众号、咨询、四角色体验 | 用固定 283a 前端做一次集中真机回归，记录真实文章原链接、人工客服实际接收、四栏及权限负例、资料/课表/评估；人工核实补录只标受控来源 | News V2 七表/开关缺失，最新文章自动来源仍未覆盖；Profile 单列缺失；部分真实角色样本缺 |
| 3. 充值次数与真实统计 | 完成生产结构隔离验证、最小可恢复点、分别审批所需 DDL，核实商户准入/真实试付/幂等入账/退款及统计口径 | 商业四表缺失，商户链路无真实回执；缺表不能显示为零 |
| 4. 正式发布 | 按最终批准的前后端 SHA 与开关完成受控切流、健康和回退验证，再以同一版本提交微信审核与发布 | 以上生产和真机门槛未通过 |

业务讨论将长期备份优化排在最后；任何生产 DDL 仍先取得最小可恢复点和隔离恢复证据。手机兼容与现役功能可先验，受缺列/缺表影响的功能写 BLOCKED，不用模拟结果替代真实业务。

## ECS 只读 staging 验证入口

[固定 SHA 脚本](../../ops/ecs/verify-isolated-staging-readonly.sh)仅接受已上传的 `1b8ae8b3c5a1285b84ab6b5f573ca9db5d93d0a7` 归档；脚本自身 SHA-256 `d4d0638ad4d5e2b032ee6f0dce1c60c34d5b93be4090ba72cf3040558be97905`。管理员先将脚本下载到 Windows 并校验，再上传至同一 `incoming/<SHA>/`；ECS 使用 `bash <script>` 执行。它在唯一 staging 目录校验每个 Git blob，由专用 jiuchen-deploy 用户在 Node 22 下以单独 transient unit 限额构建、执行无 DB 30 次健康冒烟并由内核 cgroup 核验 256 MiB／50% CPU／64 tasks。运行前要求当前服务 active、可用内存至少 850 MiB；运行后核对 `current` 未改变。不会读取生产 env、执行 DDL 或切流。该脚本已本地通过 Bash/Node 语法、合成归档合法与篡改拒绝检查；**ECS 本 SHA 实际运行 PASS**（见下节）；真实 DB/AI 负载仍未验收。

## ECS 第 1 关实测回执（管理员 PowerShell，2026-10-18）

固定脚本 SHA-256 `d4d0638ad4d5e2b032ee6f0dce1c60c34d5b93be4090ba72cf3040558be97905` 由 ECS `sha256sum -c` 返回 OK；固定归档同时返回 OK。唯一工作目录 `/opt/jiuchen-api/staging/verify-1b8ae8b3c5a1285b84ab6b5f573ca9db5d93d0a7-20261018-013849-4193193`。`ARCHIVE_MANIFEST_AND_BLOBS_PASS`；Node 22 限额构建 `ECS_TYPECHECK_AND_BUILD_PASS`，systemd success/status 0，用时 1 分 43.752 秒；256 MiB／50% CPU／64 tasks 无 DB 冒烟单元 success/status 0，用时 4.993 秒。完整日志的 JSON 行在用户粘贴中以省略号代替，但脚本须检测 `ECS_KERNEL_256M_NO_DB_SMOKE_PASS` 才输出最终成功标记。`PRODUCTION_CURRENT_UNCHANGED=/opt/jiuchen-api/releases/8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`，`ECS_CANDIDATE_STAGING_PASS`，PowerShell `ECS_GATE_1_COMMAND_PASS`。此回执仅覆盖固定归档、构建和无 DB 基础启动；没有真实 DB/AI 负载、生产恢复点、DDL、切流或真机。省略号不含内核峰值等数字，不能回填旧 e590 的数值。

**商户更新（用户 2026-10-18 回执）：** 虚拟支付和微信支付均已开通。所附截图展示虚拟支付基本配置页及一个 AppID 关联页；截图没有呈现 OfferID、两档道具 ID/价格、现网/沙箱 AppKey、生产配置状态、订单查询/发货/退款或真实交易。因此删除“尚未开通”的待办，保留“配置接线与实付验收”门槛。AI 评估次数购买走源码中的虚拟支付 `mode=goods` 和 `wx.requestVirtualPayment`；旧 JSAPI 下单端点仍返回 503，普通微信支付开通不自动使这条充值链可用。密钥只在受限生产环境配置，仓库/聊天/日志只记录存在性与脱敏标识。

**资讯停在 9 月的定位边界：** 10 月 12 日《中南大学保研看什么？成绩、综测与学院细则》已在同账号后台发表，但固定账号的 `freepublish/batchget` 完整两页仅返回 40 组 41 篇且无此目标；因此该篇缺失发生在自动同步的官方来源视图之前，不是分页、入库、标签或日期排序造成的。页面其他可能的新稿还受到现役 `GET /news` 的“状态 active 且标签非空”过滤；尚无所有 9 月以后稿件的逐篇源端→库→列表对照，不能把整个截止现象武断归为单一原因。数据分析 `getarticlesummary` 返回 47009，永久图文素材 0；自动来源适配**未解决**。管理员核实原链接的受控补录入口已有前端/API 代码，但生产 V2 七表缺失、开关未启用，尚不能用它交付最新文章，更不能称自动同步通过。

**备份与演练新回执（2026-10-18）：** `KNOWN_COMPONENTS_DOWNLOAD_VERIFIED`、`DATABASE_DOWNLOAD_VERIFIED`、`ISOLATED_SQL_IMPORT_AND_CHECK_PASS`，隔离恢复 `tables=17`、`productionWrites=false`、`businessAcceptance=false`。此前本页“缺最小恢复点”指旧状态；现可推进真实结构迁移验证和各自范围审批。生产 API、表、商户及真机仍未发生相应变更。

## 发布前仍需完成

1. 根据确定的首发业务边界，明确 AI quality v3、News V2、跨身份只读、充值与次数/统计是否在同批范围；按已开通能力完成 OfferID、道具/价格与环境配置接线，并验证官方订单查询、发货、退款和对账。代码存在不等于商户可用。
2. 最小业务库恢复点已取得：2026-10-18 管理员 WSL 加密下载和隔离 MySQL8 SQL 导入通过，恢复 17 表，无生产写入。下一步用该真实结构副本复验 Profile、News、商业迁移；增量封存与三代轮换仍为发布后维护事项。
3. 按现役真实表结构复刻并分别审查 Profile 单列、News 七表、商业四表；生产只读证据确认这些对象缺失。分别取得范围审批后才执行各自 DDL、核对 schema/数据。
4. ECS 固定 `1b8` 归档与无 DB 限额冒烟已通过；仍须在现有 Node 22、256 MiB、50% CPU、64 tasks 下完成真实 DB/AI 负载与业务兼容验证。
5. 单次体验版会话按[统一真机清单](p1-unified-device-acceptance-2026-10-14.md)验证四角色、公众号原文/客服、Profile、课表/评估/导出、充值次数与真实统计（后两项须商户和表可用）。固定前后端 SHA、微信版本和脱敏结果；缺真实角色样本写 DATA PENDING。
6. 仅在各独立审批与回执齐备时按既有发布器切流、观察健康/回退，提交微信审核并正式发布。官网/共享入口不属于小程序发布包。

两条自托管运行均在首次执行完成且结果 success；临时测试库恢复不能回填为生产备份恢复、生产 DDL 或商户实付通过。交接主索引：[CURRENT](CURRENT.md)；业务施工图：[整包发布](p1-integrated-release-package-2026-10-17.md)。
