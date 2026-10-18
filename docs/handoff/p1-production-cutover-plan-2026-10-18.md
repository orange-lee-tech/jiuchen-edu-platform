# P1 生产切换与一次性真机验收执行单（2026-10-18）

本页是下一次现场工作的单一执行顺序。事实状态请先读 [CURRENT](CURRENT.md)。本页是审查和交接，不是已执行回执；需要将每关输出和时间补到 CURRENT，不把准备工作写成 PASS。

**最新固定配对（2026-10-18）：** 前端 `51ea8775de74581289617cf1428ba4165775c1e0`，隔离 API `50e7fe3d7f93a347dfdc4af0675992690eb01e6f`。旧 `283a`／`1b8` 的 ECS 工作区、旧归档和旧 Gate 均为历史证据，禁止直接用于本轮发布。新 API [归档 39111190239](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39111190239) PASS，内层 SHA-256 `64f58071e86fcdf292810a82314117148232a5fd64ccd38d4a730635c288fe6d`；[API Gate 39111190229](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39111190229) 四任务 PASS，[前端 Gate 39111190252](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39111190252) PASS。[固定 ECS staging 验收脚本](../../ops/ecs/verify-news-content-staging-20261018.sh) SHA-256 `cf88bdd43839b5f9a9aee05b0c0c3f6593c34c1c0db751c064b2df145dd21de4`，`bash -n` PASS。新归档和隔离构建/无数据库冒烟已在 ECS 通过；有 DB 负载与生产切流仍未执行。运营四条短链仍缺可核实的完整站内正文与图片；至少一条属于后台「贴图」，现有自动源不覆盖，不能用链接卡代替站内阅读。

**23:01 CST staging 回执更新：** 新归档已上传并复核双哈希、manifest 与 Git blobs。新 SHA 的 ECS typecheck/build、256 MiB／50% CPU／64 tasks 无数据库冒烟 PASS，内核内存峰值 `78,573,568 bytes`、failcnt 0；现役仍为 `8cc4bb85`。旧 `1b8` 制品和工作区继续只作历史证据。新候选真实数据库、AI 负载与生产切流仍待验。

**资讯门槛：** 用户要求服务号图文在小程序内读完整正文，收藏只保存原文 URL 且从收藏可跳原文。旧 `1b8` 的 URL 补录写入 `html:null`；新候选要求管理员核实正文/图片顺序块，发表时间允许未知。先按[资讯拓扑审查](p1-news-topology-first-principles-2026-10-18.md)取得真实正文来源，再在真稿上测试站内正文／图片／收藏。原文打开检查是收藏链的验收，不能代替正文验收。

## 固定对象与已通过门槛

| 对象 | 固定值／回执 |
| --- | --- |
| 当前 API | `8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`，切换前现场再核 |
| 待发布 API | `50e7fe3d7f93a347dfdc4af0675992690eb01e6f`，生产后代；隔离 Gate 四任务 PASS |
| API 内层归档 SHA-256 | `64f58071e86fcdf292810a82314117148232a5fd64ccd38d4a730635c288fe6d`，只读制品 |
| ECS 传输 | `/opt/jiuchen-api/staging/incoming/50e7fe3d7f93a347dfdc4af0675992690eb01e6f/`；归档/脚本双哈希、manifest、Git blobs 校验通过 |
| ECS 隔离工作区 | `/opt/jiuchen-api/staging/verify-50e7fe3d7f93a347dfdc4af0675992690eb01e6f-20261018-145737-266223`；含生成的冒烟文件，不得整体复制为正式 release |
| 小程序前端 | `51ea8775de74581289617cf1428ba4165775c1e0`，96/96、Node22 typecheck 与自托管 Gate PASS；尚未上传微信体验版 |
| 数据库 | 管理员 WSL 加密备份 `20261016-134131-cf772f`，17 表隔离导入；真实结构副本三组迁移和重复执行通过，生产 Profile／News／商业三组 DDL 与 checker 通过 |
| 资源 | 新 `50e7` ECS typecheck/build 与无 DB 256 MiB／50% CPU／64 tasks 冒烟 PASS，峰值 `78,573,568 bytes`、failcnt 0；真实 DB／AI 负载仍待验 |

## 2026-10-18 14:15 收到的四篇候选原文

下表的标题和链接由运营方提供。微信原文页面在本工作环境不可读取，**没有独立核实发表日期、公众号归属、页面内容或链接在真机的打开结果**；发表日期不是启动补录的前置人工输入。这四条均为 `OPERATOR_SUPPLIED_PENDING_VERIFICATION`，尚未写入生产库。先核标题、九辰账号归属和原文可开，取得后台对应的原始文字及图片顺序；若后台自然提供发表时间，照实记录。新候选允许发表时间为 NULL，在客户端显示“发表时间待核实”，不可填猜测时间。若标题或 URL 已在库，先核重复／冲突；标签由运营确认。正文/图片不得只用短链代替。

| 标题（按用户原文，第二条待核完整标点） | 原文 | 建议分类 | 北京时间发表记录 |
| --- | --- | --- | --- |
| 2028届推免前移：现在该怎样准备？ | https://mp.weixin.qq.com/s/ul2gk6Xo1TKi_PXvgRpqBA | 推免 | 待公众号后台核实 |
| 保研完整时间轴，大一到大四全覆盖（速收藏 | https://mp.weixin.qq.com/s/dG__zmMfO5UvVa7D4iMfgA | 推免 | 待公众号后台核实 |
| 10月竞赛清单来啦～ | https://mp.weixin.qq.com/s/nATlCGc9mXAl6WDYfs_H2Q | 竞赛 | 待公众号后台核实 |
| 2027秋招启动：本科生最该补齐的4项准备 | https://mp.weixin.qq.com/s/DJW3ka4lF8KZc4HPRG9VEQ | 就业 | 待公众号后台核实 |

这四个链接与此前提到的 10 月 12 日《中南大学保研看什么？成绩、综测与学院细则》是不同待核对象；不能用它们证明该目标稿已恢复。逐条查源端／库／公开列表；时间未知时保持 NULL 和“发表时间待核实”，不能把录入时间或来源更新时间冒充发表时间。补源完成须用学员真机读图文完整正文／图片；收藏后打开每篇对应的公众号原文。

## 一次现场的五道门

1. **只读现场基线。** 记录北京时间、现役 API SHA、`jiuchen-api.service` 状态、live／ready、网站源站、资讯当前可见条数和既有客服入口；核对加密备份可解、旧 release 保留、生产三组表 checker。只记脱敏状态。失败时保持现役，不再继续切换。
2. **准备纯净不可变 release。** 归档已到固定 ECS staging 且完整性/隔离构建通过。使用[固定 release 准备脚本](../../ops/ecs/prepare-news-content-release-20261018.sh)，本地 SHA-256 `b66f274f5f91a02149a82612b63e4575cc0e5230110ee932514aa6d289e5631a`，在 ECS root 单独执行；脚本重新校验固定归档/manifest/Git blobs，限额构建，并生成 `/opt/jiuchen-api/releases/50e7fe3d7f93a347dfdc4af0675992690eb01e6f`。要求 root:root、真实文件和目录不可被 group/world 写、`COMMIT_SHA` 精确匹配；以 `jiuchen-api` 身份验证可遍历、读取并 `node --check`，取得 `RELEASE_PREPARED` 与 `PRODUCTION_CURRENT_UNCHANGED` 回执。当前**尚未执行**；准备步骤不改 `current`、READY 或 approved-release。不得把生产配置载入 staging 的 `buildApp` 冒烟：它的 onReady 可能启动评估后台工作者。
3. **资讯数据窗口。** 从四条运营原文和 10 月 12 日目标稿入手，核链接、同账号归属、正文/图片及重复项；发表时间未知时保持 NULL。不得用 10 月 17 日 `sourceUpdatedAt` 推断发表日期，不给八条产品资料批量打标签。现役 timer 可运行，但旧版不会准备 V2 展示状态。待明确批准这次生产资讯数据写入后，以固定 API 的独立维护命令、仅在该命令的环境中设置 `NEWS_V2_ENABLED=true` 执行完整 `syncOfficialAccountPosts`；它会 upsert 官方来源记录、调用 `reconcileNewsWindow` 写入展示状态及必要的退场任务／批次和 sync run。需要完整扫描、`failed=0`、`truncated=false`、公开可见窗口非空且真稿站内正文可读，再推进。此命令只创建数据库上下文，不启动 HTTP app 或后台评估 worker。缺失官方接口的稿件需由管理员在新 API 的 `/me/admin/news/verified-official` 输入核实的全文或图片 URL 顺序块、原链接和分类；补录与自动来源恢复分别记账。
4. **受控 API 切换。** 对固定 SHA 单独审定上线范围：此 API 包含 AI quality v3／跨身份只读，不能靠默认关闭 News 或付费开关剔除这些代码。root 核对 `/etc/jiuchen-api/approved-release` 与 `/opt/jiuchen-api/staging/READY` 的确切 SHA，调用既有 `ops/ecs/jiuchen-promote`；仅此发布器切换 `current`、重启 `jiuchen-api.service` 并检查 live／ready，失败自动尝试回旧 release。配置文件 root 只读，禁止打印密钥。News V2 的生产开关单独确认；切换后立刻用公共身份核 `/news` 非空、原有文章及真稿，认证后核 Profile 读写／权限，网站健康不受影响。在既有 256 MiB、50% CPU、64 tasks 下记录真实 DB 和评估负载；OOM 或业务失败，先停后续验收并按旧 SHA 回退；增量表保留，不能倒灌旧备份覆盖新用户数据。
5. **一次微信体验版会话。** 固定前端 SHA 上传体验版并记微信版本号，先验公开资讯（至少两篇新图文可站内读正文与图片、收藏后的对应原文可开）、游客／学员／老师／管理员客服入口及客服端实际收信；再验新旧学员四栏／资料保存重开／课表／评估，老师已分配与未分配、管理员直接复用原生学员／老师 UI 的只读模式与写入负例。接着核真实赠送次数、充值取消／成功／重复通知、扣次与退款或补偿、后台周月年金额统计；只在商户 OfferID、AppKey、两个商品 ID／价格、赠送版本与回调／订单查询等生产接线核准后开启实付及额度强制，密钥不贴聊天或 Git。官网与 API 均健康、用户可用链路 PASS 后再进入微信提审／正式发布。截图只留脱敏证据位置。

## 关键现场判断

- **10 月资讯不是“9 条全部同步成功”。** 十月 `sourceUpdatedAt` 九条中八条为产品资料新旧链接、一条为保研问答，发表时间不可核；已确认的 10 月 12 日目标文章标题在库为空。公开列表还会过滤零标签；这解释已入库九条未显示，但不能解释全部真正新稿缺源。优先交付核实原文补录的真实内容；自动接口缺口另记未通过。
- **资讯预热是数据写入。** 代码中 `syncOfficialAccountPosts` 只在 V2 环境开关为 true 且扫描完整时运行 `reconcileNewsWindow`，所以只切环境变量会出现空窗口风险；同步有 upsert、展示状态和任务写入，不能当成只读探针。现役 timer 与预热命令不要并发；使用新闻锁，遇忙停止并核实。
- **客户咨询是端到端验收。** `wx.openCustomerServiceChat` 能打开仍不等于客户消息抵达；测试者须主动发送，客服端核接收人和身份上下文。产品入口现不复制身份摘要，按真实需求判断是否阻断首发。
- **费用不能以“已开通”代替实测。** 虚拟支付和微信支付能力据用户回执已开通，但生产缺关键配置与真实交易回执；旧 JSAPI 端点为 503。启用收费前核商品、服务端可信入账、重复回调和账本／统计一致性。
- **回滚界限。** 发布器只能回滚 API symlink／服务；已批准的加法 DDL 留在库里，手工核实的新稿与真实付款不能因 API 回退被批量删除。将 `NEWS_V2_ENABLED`／付费开关单独恢复到旧版兼容状态并检查健康。恢复数据库必须是另一个有明确目标时间点与影响面批准的事故操作。

## 尚需的单次现场输入

- 四条链接和标题已收到；不再要求运营再次提供发表时间。仍需现场核短链归属、标题标点和真机可开；如果官方页面／后台自然给出时间则采用，没有就保留未知。10 月 12 日中南大学目标稿的原文尚未提供，不能以其他文章替代。
- 虚拟支付 OfferID、两档商品 ID／价格、AppKey 及生产状态只在受限 ECS 配置，不通过聊天发送密钥；现场回传键是否存在、脱敏商品标识、真机交易结果。
- 体验版操作者及四角色测试账号、客服端接收人、真实旧学员与老师分配样本；个人资料／会话票据不进 Git。

状态：**新候选静态与隔离数据库 Gate／归档、ECS 隔离构建及无数据库资源冒烟 PASS；无日期和站内正文的受控入口已通过代码测试。真实稿件资料、生产资讯预热、API 切流、支付启用、微信体验版上传、真机、正式发布均尚未执行。**
