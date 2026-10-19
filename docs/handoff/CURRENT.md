# CURRENT — 九辰教育唯一活跃交接（2026-10-19）

**当前状态：** 用户 ECS 回执确认生产 API 已切至 `dbd7d9a818523cc3b007afe47a03519510415652`，服务健康、News V2 公开读取和新路由未登录拦截通过；四篇十月稿先前已写入并公开可读。官网指针未变。用户报告固定前端的其他体验项已通过，客服卡片点击仍显示微信“页面不存在”；当前截图中的卡片标记“未发布的小程序·开发版”，待上传并指定体验版后用新卡片复验。真实商户交易、充值次数及统计、正式发布待验。旧云端 CI 计费失败不替代固定 Runner 验证。

## 2026-10-19：main 合包与本地验证回执

- 固定配对合包 API typecheck、222/222 tests、build，小程序 typecheck、106/106 回归，管理端 typecheck、2/2 tests、build，本地均 PASS。合包以 Git tree blob 逐一核对小程序未改变、API 九处取自现役固定候选；本地源码快照缺少部分仓库文档/二进制资产，但测试过的应用源码与对应 blob 核对一致。
- PR #4 的 GitHub 托管 CI run #39224074557 失败，job `steps=null`，与此前 Actions 额度阻断一致；不可记为代码失败或完整 CI 绿灯。固定配对自托管 Gate #39207715118 的通过仍有效，合包另有本地全套检查。此次无生产部署、DDL、支付开关或微信上传操作。
- 当前 `main` 源码树已整合；0.0.19 体验版实际上传与新卡片、商户交易/额度统计、AI 真实负载和微信提审仍按上面的发布阻断执行。旧分支剪除由用户执行，见本次分支核验清单。

## 2026-10-19：0.0.19 发布台面与分支整合状态

- 用户指定体验版号 `0.0.19`，固定前端源码 `9da7f9178b737b8ebbc7b17ece1ef3260824f893`；生产 API 的最后现场回执为 `dbd7d9a818523cc3b007afe47a03519510415652`。尚缺 0.0.19 上传、设为体验版及新客服卡片点击的现场回执，开发版旧卡片“页面不存在”不能作为体验版或正式版的结论。
- 发布阻断：新卡片回跳与必要角色真机验收；真实商户配置、充值、扣次和统计闭环；新组合在生产数据库与 AI 请求下的资源和业务检查；微信体验版、提审与审核通过。用户报告其他真机问题已通过，但逐项证据待补。四篇十月原文公开读取通过；十月后续公众号自动来源仍有缺口，不能把四篇补录等同于持续自动同步。
- 代码整合已完成：PR #4 将固定前端与现役 API 的九处源码/测试差异及必要发布工具组成双亲合包 `8bbbe7db4f5fbdda10eb0dec90de1f73961f1d5f`；保留固定前端树，API 文件 blob 与 `dbd7d9a8` 一致，排除两份过时的一次性工作流。PR #4 合入 `p1/foundation` 为 `acfd0b75d6d9cf0959809506e82f49b958482740`；PR #1 合入 `main` 为 `13a1c25762bbe09cd7860af8c2822162c950639b`，合并后的树均为 `23a0f138deb71c3b58ec172ab96b99d761113560`。合并不等于微信正式发布、生产配置或商户验收。
- 数据恢复：生产 DDL 前的最小可恢复点已下载，本地隔离导入 17 张原表及迁移演练通过；长期轮替备份放发布后。不得把隔离导入当作生产业务恢复验收。
- GitHub 整理回执：PR #1 和 #4 已合并；早期原型 PR #2、旧 API PR #3 已关闭。PR #5 的 API 提交已由双亲整合提交纳入 `main` 的历史（旧目标分支上的 PR 本身另行关闭）。远端分支尚未删除，用户负责剪除；须按 main 可达性逐项核验，不能仅凭日期删除，官网/生产回退目录也不因删 Git 分支而清理。
- 临时工作台：旧隔离源码快照的三处 npm 依赖目录以 `npm prune --omit=dev` 清理开发依赖，合计目录占用从约 737 MiB 降到约 211 MiB；未删除源码快照或用户 Windows 桌面的体验目录。

## 2026-10-19 15:16 CST：真机客服卡片单项未通过

- 用户报告此前集中验收的其他问题已通过；此项为用户口述 PASS，尚无逐项原始回执。两张截图显示客服会话中可生成管理员身份摘要卡片，卡片底部标记“未发布的小程序·开发版”；点击进入微信的“页面不存在”。不得记为客服卡片回跳 PASS，也不能把微信的页面不存在写成 API 页面加载空白。
- 固定前端 `9da7f9178b737b8ebbc7b17ece1ef3260824f893` 的 `customer-service.ts` 给客服卡片设置首页路径 `/pages/index/index`；该页面确实在 `app.json` 的 pages 数组。截图无法单独判定是开发版卡片的访问版本差异，还是微信对卡片路径格式的解析；从图片也不能核定用户当前手机运行的精确前端 SHA。
- 本次体验版版本号由用户设为 `0.0.19`；说明：`九辰保研体验版：资讯原文与收藏、本人姓名及学业资料、四角色权限和客服咨询联调。前端 9da7f917，API dbd7d9a8；客服卡片回跳待验，充值支付未开放。` 将固定源码上传并在后台设为体验版，使用体验版重新产生**一张新卡片**，由具备体验权限的微信号打开。若仍“页面不存在”，记录体验版版本、微信号是否具备体验权限和新卡片截图，再针对路径或微信平台约束修复，不拿旧开发版聊天卡片做结论。
## 2026-10-19 14:50 CST：dbd7d9a8 API 已切流，转入联合真机验收

- 用户在 Windows PowerShell 校验切流脚本 SHA-256 `a96257e158ee91cbf7c988ce34398d1995a986f784bced8f146222165d6612c2`，上传 ECS staging；ECS 对该脚本及固定旧 promotion 脚本分别 `sha256sum: OK`，`NEWS_V2_FLAG_PRECHECK_PASS`、`PRECHECK_PASS candidate=dbd7d9a818523cc3b007afe47a03519510415652 previous=858aa6a5bebbdb88346c6282f691b4976886b935`。
- `STEP=PROMOTE_FIXED_SHA` 后得到 `PROMOTE_OK active=dbd7d9a818523cc3b007afe47a03519510415652 previous=858aa6a5bebbdb88346c6282f691b4976886b935`；最终 `NEWS_V2_PUBLIC_COUNT=10`、`AUTH_BOUNDARY_DISPLAY_NAME=401`、`AUTH_BOUNDARY_FAVORITES=401`、`API_CURRENT=/opt/jiuchen-api/releases/dbd7d9a818523cc3b007afe47a03519510415652`、`ROLLBACK_TARGET=/opt/jiuchen-api/releases/858aa6a5bebbdb88346c6282f691b4976886b935`、`WEBSITE_POINTER_UNCHANGED=true`、`DBD7_API_PROMOTION_PASS`、本机 `API_CUTOVER_COMMAND_PASS`。
- 重启期间三次 `curl: (7) ... Connection refused` 是 promotion 健康轮询初期的瞬时连接失败；随后健康门禁和脚本后检通过。没有 `RECOVERY_START` 或回退迹象。该回执证明 API 切流与所列只读接口检查成功，不证明学员资料写入、收藏取消、微信客服卡片、AI 真实负载或充值交易成功。
- **固定体验版入口：** [前端精确 SHA 源码 ZIP](https://github.com/orange-lee-tech/jiuchen-edu-platform/archive/9da7f9178b737b8ebbc7b17ece1ef3260824f893.zip)，独立解压，微信开发者工具导入其中的 `apps/miniprogram`（项目 AppID 已在 `project.config.json`），Windows PowerShell 用 `npm.cmd install --no-save --package-lock=false --no-audit --no-fund` 再 `npm.cmd run typecheck`；两项均须检查退出码。编译后上传并由小程序后台设为体验版；不要从本分支移动 HEAD、旧体验版目录或聊天历史旧卡片取证。
- **下一步同一体验版：** 从固定前端 `9da7f9178b737b8ebbc7b17ece1ef3260824f893` 打开微信开发者工具并上传体验版，在手机连续验收四篇正文与图片、收藏取消及原文／退役后的本人阅读、姓名与学业资料、管理员/老师/学员/游客客服入口和新卡片、四角色只读权限、评估与课表。先确认使用的是新体验版，旧聊天记录里的旧卡片不能算新版本失败。随后单列商户配置、一次真实充值及后台统计，最终才提审正式发布。若真机失败，记录身份、页面、动作、状态码/微信 errMsg，不扩大生产修改范围。

以下按发生时间保留切流前证据；其中“未切流”“待切流”均为当时状态，以本节为准。
## 2026-10-19：dbd7d9a8 ECS staging 与 release 准备通过（未切流）

- 用户 ECS 日志：固定 tar.gz 与 staging 脚本双 SHA-256 OK，`ARCHIVE_MANIFEST_AND_BLOBS_PASS`；隔离目录 `/opt/jiuchen-api/staging/verify-dbd7d9a818523cc3b007afe47a03519510415652-20261019-061659-574221`。Node 22 typecheck/build `ECS_TYPECHECK_AND_BUILD_PASS`；cgroup v1 实测 30 次无数据库健康请求，内核 MemoryLimit=268435456、MemoryPeak=76087296 bytes、MemoryFailcnt=0、CPU 0.5、TasksMax 64，`ECS_KERNEL_256M_NO_DB_SMOKE_PASS`；unit 均 result=success/status=0；`ECS_CANDIDATE_STAGING_PASS` 和 `ECS_STAGING_COMMAND_PASS`。现役仍为 `/opt/jiuchen-api/releases/858aa6a5bebbdb88346c6282f691b4976886b935`。
- [固定 release 准备与数据库只读兼容脚本](https://github.com/orange-lee-tech/jiuchen-edu-platform/blob/8cb1103db618fc4162023d601f414808c6982ef6/tools/release/prepare-contact-favorites-release-20261019.sh) SHA-256 `c184bca674a0d5fac9825064653b29b4bb7efd0f9dce307a3cec95e8e2d5a672`，`bash -n` 和嵌入 JS `node --check` 通过。脚本复核归档与 Git blobs，隔离构建后以生产环境连接做 read-only transaction 的六表必要字段检查；仅在全通过时创建 root 所有的 `releases/dbd7d9a8...`，检查服务用户可读，现役指针保持不变。**已由用户在 ECS 执行通过，回执见下一条；真实业务、AI 与微信真机不因该检查自动通过。**
- **2026-10-19 用户 ECS release 准备回执：** 脚本与固定归档 SHA-256 OK，manifest/Git blobs PASS；Node 22 的 typecheck/build `RELEASE_TYPECHECK_AND_BUILD_PASS`、unit success/status 0；生产只读 DB 兼容检查 `PRODUCTION_DB_READONLY_COMPAT_PASS`，六表 `users`、`students`、`user_profiles`、`news_posts`、`news_favorites`、`news_display_states`，`newsV2Enabled=true`、`productionWrites=false`、`aiOrPaymentCalls=false`；`RELEASE_LINK_BOUNDARY_PASS`。新 root-owned release `/opt/jiuchen-api/releases/dbd7d9a818523cc3b007afe47a03519510415652` 已准备；`PRODUCTION_CURRENT_UNCHANGED=/opt/jiuchen-api/releases/858aa6a5bebbdb88346c6282f691b4976886b935`。未写 READY/approved-release，未重启，未切流。
- [固定新 SHA 切流与失败回退脚本](https://github.com/orange-lee-tech/jiuchen-edu-platform/blob/72a91c6a727660067bdc4e737fd2e54230020816/tools/release/promote-contact-favorites-20261019.sh) SHA-256 `a96257e158ee91cbf7c988ce34398d1995a986f784bced8f146222165d6612c2`；`bash -n` 和两段嵌入 Python 静态编译通过，**尚未上传或运行**。它要求 `--apply`、root、现役精确旧 SHA、新 release、固定旧受审 promotion 脚本哈希，并在执行时写入本候选的批准标记与 READY；只切 `jiuchen-api`，检查健康、News V2、无会话的新写入路由均 401、官网指针不变。失败时尝试恢复旧 SHA 并核查健康，若恢复不完整显式报警。运行前仍需确认固定旧 promotion 脚本存在且校验通过。
- **下一门：** 按仓库 `AGENTS.md` 的精确切流单独审批要求，旧 858 的 A/B/C 授权不自动延伸到 dbd。批准并执行后仍需在同一次微信体验版会话核验 `9da7f9178b737b8ebbc7b17ece1ef3260824f893` 的收藏取消/退役、原文、本人姓名、客服入口与卡片及四角色；支付配置、真实充值和统计也仍须真实验收。

## 2026-10-19：收藏、姓名与客服卡片联合修复候选（未部署）

- 用户复测现有体验版：取消收藏 `400/http_400`；“我的收藏”进入站内资讯正文；学员客服复制文案缺姓名及学业资料；身份与学业展示预置“测试学员零三”，资料编辑没有姓名；此前客服小程序卡片点开“页面不存在”。具体前端体验版 SHA 尚未从本次手机回执核验。这些均按 DEVICE FAIL/PENDING 处理。
- API 隔离候选 `dbd7d9a818523cc3b007afe47a03519510415652` 从现役 `858aa6a5` 精确派生，[Draft PR #5](https://github.com/orange-lee-tech/jiuchen-edu-platform/pull/5) 目标为原隔离 API 分支。保留现役已支持的公众号图片源白名单；增加登录本人已收藏的退役资讯正文访问、POST 取消收藏兼容入口（旧 DELETE 仍在）、本人姓名更新并同步本人绑定的学员名。未改生产数据、DDL、支付、AI 或现役指针。
- 前端后继候选（本分支）：我的收藏主入口使用保存时的公众号原文 URL，保留站内阅读次入口；取消收藏调用新的 POST 路由；个人资料新增由本人填写并保存姓名；客服从服务端核对身份与学业资料后由用户确认，卡片标题只含简短身份摘要，路径固定到公开首页，完整资料仍须用户粘贴发送。微信卡片 API 不提供任意长正文自动填写，体验版可达和客服人员可点开仍需真机验证。原文若被公众号删除，外链也会失效；已收藏的站内正文则由后端按本人权限保留。
- 本地对应源码：API TypeScript、build 和全套 219/219 单元与合同测试 PASS；小程序 TypeScript PASS。[固定配对自托管 Gate](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39207715118) 已核对两个精确 SHA，API Node 22 typecheck、222/222 测试、build 通过；小程序 typecheck、106/106 回归通过；[API 归档](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39207715118/artifacts/12165778617) 上传通过（ZIP SHA-256 `5725a9a3c4fabd3d1924626c1fa54af7b0126cc33f003c61d646622fb45db5c2`，内层 tar.gz SHA-256 `1bffcd9f66da800c7713ecad7bd9008edd68a21228c752e6311928e8adea26de`，163 个 Git blobs）。固定 API 候选仍为 `dbd7d9a8...`、小程序 `9da7f917...`；工作流提交 `16e76c59...` 和后续验收脚本提交 `7ba21b87...` 均不改变候选代码。 [ECS staging 只读脚本](https://github.com/orange-lee-tech/jiuchen-edu-platform/blob/7ba21b8712e6ac8f05c0d68f0a4c6e88c029dec0/tools/release/verify-contact-favorites-staging-20261019.sh) SHA-256 `523792df9da2f05ad3065fea91e4a0ee340e4b3a71740289a29918d368e8bb2a`，已过 `bash -n`，本候选 ECS 实跑通过，见本页首节。生产发布、微信真机取消收藏/原文/卡片、本人真实姓名及四角色验收仍 PENDING。当前生产 API 仍据用户回执为 `858aa6a5`；草稿 PR 和 Gate 不构成切流或微信发布批准。
- 下一步按页首已完成的 ECS staging、生产 DB 只读兼容与 release 准备回执，取得新候选明确切流批准后才切流。同一微信体验版会话查收藏取消、退役本人阅读、官方原文、姓名资料、客服卡片及完整粘贴信息。真实 DB 写入、AI 负载、商户真实充值/统计和正式发布仍独立待验。

## 2026-10-19 真机复测未通过：资讯、收藏和客服

- 用户在固定前端 `6f506aeedf18ad83e8459c0b3ce053f7d7cd911b` 的本机类型检查 PASS 后反馈：收藏后原文仍无法打开；取消收藏出现“收藏未保存，请重试”；客服入口仍未通过；院校和 AI 咨询会话中所见卡片点击“页面不存在”；管理员资讯管理只能编辑标签，缺少正文预览。**尚未确认手机测试的是新预览还是历史体验版、卡片是新产生还是会话历史；不得判定客服修复已通过。**生产 API 指针和官网指针仍以用户上一条只读回执为准。
- 代码检视：资讯与“我的”收藏列表把保存的公众号 URL 直接送入外部打开 API，未使用已存在的站内资讯详情；管理员管理列表无预览按钮，管理员资讯页默认折叠；微信客服调用已在院校/评估场景可达，但旧消息卡片不会因新版代码而从聊天记录消失。服务端生产候选含 `DELETE /me/news-favorites/:id`，这不足以判定本次取消收藏的 HTTP/DB 失败原因。
- 下一前端候选：收藏点击改用 `postId` 进入站内详情；管理员资讯页默认加载文章、管理列表新增“预览正文”；所有环境不再发送新小程序卡片；身份核验后先复制摘要、再通过用户明确点击“打开客服”调用微信接口；失败时显示微信 `errMsg` 并允许一次用户点击重试；收藏失败时保留 HTTP 状态/错误码。业务正文继续由生产 News V2 提供，不更改生产 DDL 或服务指针。小程序 TypeScript 检查通过，导航与报告咨询相关回归 **78/78 PASS**；真机、取消收藏成功、客服实开均**待复验**。
- 下次集中复验先确认新项目预览码与本候选一致，并区分聊天历史卡片和新发送卡片。若取消收藏仍失败，回传页面显示的 `状态码/错误码`；若客服仍失败，回传“客服未打开（新版）”弹窗的微信错误。收到后针对真实原因修复，不能盲目重试生产写入或宣称正式发布完成。

## 2026-10-19：生产只读确认与体验版阻断修复候选

- 用户现场只读回执：`API_CURRENT=/opt/jiuchen-api/releases/858aa6a5bebbdb88346c6282f691b4976886b935`、`API_SERVICE=active`、`NEWS_V2_ENABLED=true`；官网指针未改变。固定前端体验版 `51ea8775de74581289617cf1428ba4165775c1e0`，项目目录 `C:\\Users\\yulia\\Desktop\\jiuchen-experience-51ea8775\\apps\\miniprogram`。
- 真机已见：收藏动作响应，但“我的收藏”点原文报链接无效；管理员身份切换通过，管理员“我的”联系运营闪屏未进入；学员 AI 评估和院校咨询可进入微信客服并可发送信息，但所附卡片显示“未发布的小程序·开发版”，点击报“页面不存在”；其他客服入口尚未完成逐一成功验收。客服聊天可达不等于卡片可打开。
- 本分支前端候选修复：去除公众号链接打开时对全局 `URL` 的依赖；原文 API 不可用时明确复制链接给用户；客服身份独立从 `/auth/me` 只读核验以避免全局 loading 卸载“我的”菜单；“我的收藏”只在真正 onShow 时重置；开发版/体验版不再附带不可访问的小程序卡片，保留剪贴板摘要和客服会话；产品列表及产品详情咨询也进入同一核验流程。已在本地完成小程序 TypeScript typecheck、导航与报告咨询相关回归 73/73，**真机尚待复验**。
- 后续集中真机复验：收藏原文直接打开（若落入复制提示需单独记录）；管理员/学员/老师/游客的“我的”和首页客服、产品列表/详情、院校与评估咨询的会话及粘贴信息；四篇文章及 13 张图片；资料读写、角色只读限制、真实评估资源。商户配置和真实充值仍独立验收，未据此宣称正式商业发布可行。备份已在本地隔离导入 17 张原表并演练三组 DDL，但生产后续变更仍应保留最小可恢复点。

## 2026-10-19 09:32 CST：四篇十月原文已写生产，公开读取通过

- 用户 WSL 现场回执：固定四页私有负载先执行只读 review，随后使用真实管理员会话运行 `submit-public-pages-20261019.py --apply`；`POST_1=CREATED`、`POST_2=CREATED`、`POST_3=CREATED`、`POST_4=CREATED`，最终 `FOUR_POST_REQUESTS_COMPLETED`。曾因输入 `ok` 或将票据连同引号粘贴而在首篇得到 401；一次连接被远端断开且未确认写入。随后切换真正管理员身份，独立只读会话检查 `ECS_AUTH_HTTP=200`、`ECS_ROLE=admin`。不记录会话票据。
- 本机从生产公共 HTTPS 执行 `verify-four-public-news-20261019.py`：四篇逐篇 `ARTICLE_1_PUBLIC_PASS images=2`、`ARTICLE_2_PUBLIC_PASS images=7`、`ARTICLE_3_PUBLIC_PASS images=1`、`ARTICLE_4_PUBLIC_PASS images=3`，最终 `FOUR_PUBLIC_ARTICLES_AND_DETAIL_PASS`。校验覆盖公开 `/news` 的 `v2=true`、各原文 URL 唯一可见、详情标题/媒体类型/图片块数量/收藏功能标记及图文正文块合同。
- 此回执证明 C 四篇生产写入与公开 API 列表/详情读取通过，公开接口已响应 News V2；**不等于**图片在微信真机完成加载、收藏跳原文、客服实际收信、四角色只读/编辑权限、真实评估负载或商户交易通过。A+B 现场激活脚本的完整 `A_B_PROMOTION_PASS`、现役 `current` 精确 SHA 和资源限额真实负载回执未在本次用户日志中提供，应只读核对，不从四篇可读倒推出确切 release SHA。
- 下一关：一次微信体验版集中真机验收；逐条检查四篇正文/13 张图的真实显示、收藏与原文、游客/学员/老师/管理员客服端到端、资料读写、课表/评估与只读身份权限负例。支付继续保持独立门槛，先核商户配置与真实交易，再启用收费；十月稿自动来源缺口、10 月 12 日中南大学稿仍需单列。正式发布/官网和代理变更未获本项批准。

## 2026-10-19 08:21 CST：A/B/C 生产范围批准，待现场执行

- 用户明确批准 A：固定 `858aa6a5bebbdb88346c6282f691b4976886b935` API 切换（随包生效的 AI assessment-agent-v3 与跨身份只读）；B：一次官方资讯生产同步/展示窗口预热及 `NEWS_V2_ENABLED`；C：已核同服务号的四篇真实公开页面（图文 2／3 图、贴图 7／1 图）写入。此批准不包括支付开关、商户密钥、官网/代理、微信正式发布。
- [固定 A+B 现场脚本](../../ops/ecs/p1-858aa6-activate-api-news-v2-20261019.sh) SHA-256 `eda3c5fa1c928e3d5a3a316bace41007b8476c35facb0552e2d8066ee1d4c005` 已经 `bash -n`；需与仓库既有 `jiuchen-promote` 固定复制品 SHA-256 `bd462b9520997e3b4ab3c59da017821e4dd7a718e3961c2212afd691dae752a9` 一起上传，仅在用户 ECS root 执行。脚本先验现役、备份与开关状态，再用固定 release 的只读应用环境执行一次获批的生产资讯预热（会写 News 表），确认正常窗口有内容，再原子设置开关/批准 SHA/READY，通过既有 promote 健康检查切换。若中途失败，原现役与状态以现场回执为准；不把脚本准备当作执行成功。
- 四篇写入使用已审 `61a208d3396e0136279ed843a587da0ed1a290f0d7bf1f01746f67a34a651f92` 私有 JSON 与[管理员批量工具](../../tools/news/submit-public-pages.py)，A+B 成功且有合法管理员会话后执行；原文/会话票据不得入 Git、Actions、聊天。商户真实交易、微信体验版和真机仍待验。

## 2026-10-19 00:09 CST：858aa6a5 release 目录准备回执

- 用户现场回执：固定 `prepare-public-pages-release-20261018.sh` 与 API 归档双 SHA-256 OK；`ARCHIVE_MANIFEST_AND_BLOBS_PASS`、Node 22 typecheck/build `RELEASE_TYPECHECK_AND_BUILD_PASS`、`RELEASE_LINK_BOUNDARY_PASS`；独立 unit `jiuchen-release-build-1792339637-290223.service` success/status 0。
- `RELEASE_PREPARED=/opt/jiuchen-api/releases/858aa6a5bebbdb88346c6282f691b4976886b935`，`PRODUCTION_CURRENT_UNCHANGED=/opt/jiuchen-api/releases/8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`。未写 READY/approved-release、未重启服务、未改生产库。下一门是精确版本/功能范围审查与单独生产切换批准；News V2 开关、四篇内容写入、支付配置、真机及正式发布仍分项待验。

## 2026-10-19 00:03 CST：858aa6a5 ECS 隔离验收回执

- 用户现场日志“粘贴的文本 (1)(20261018-160345).txt”：固定 API 归档及 staging 脚本均 SHA-256 OK，`ARCHIVE_MANIFEST_AND_BLOBS_PASS`；隔离目录 `/opt/jiuchen-api/staging/verify-858aa6a5bebbdb88346c6282f691b4976886b935-20261018-160058-287910`。ECS Node 22 typecheck/build `ECS_TYPECHECK_AND_BUILD_PASS`，独立 systemd unit result=success/status=0。
- 内核 cgroup 256 MiB、CPU 50%、TasksMax 64 下，无数据库的 30 次 `/health` 请求成功；`memoryPeakBytes=77303808`、`memoryFailcnt=0`，`ECS_KERNEL_256M_NO_DB_SMOKE_PASS`，最后 `ECS_CANDIDATE_STAGING_PASS`、`ECS_STAGING_GATE_PASS`。现役 `current` 仍是 `/opt/jiuchen-api/releases/8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`。这不是生产数据库/AI/商户负载、四篇内容入库、真机或上线通过。
- 下一步只执行本候选固定 [release 准备脚本](../../ops/ecs/prepare-public-pages-release-20261018.sh)；尚无 `RELEASE_PREPARED` 回执，不允许将旧 `50e7` 准备目录当作本候选。发布切流、News V2 开关及四篇生产写入分别待精确范围批准。

## 2026-10-18 23:45 CST：四页真实来源与新隔离 API 候选

- 用户上传的匿名公开网页 ZIP `jiuchen-public-pages-v2-20261018-233541.zip`（SHA-256 `173e2e75f860549d5a01bfa30af6aa4d9b55ab8b36931c49bbe1c08e98018704`），四页均 HTTP 200、同服务号 biz `MzY5MTM2ODk5NA==`；页面 `ori_send_time` 与可见 `create_time` 对应。两篇图文的 `js_content` 含全文及 2／3 张正文图片；两篇「贴图」的 `picture_page_info_list` 含顺序 7／1 张，描述文字另存。标题、时间和图片数由 `tools/news/prepare-public-pages.py` 只读提取，输出私有 JSON，原 HTML 与全文不进 Git／聊天；未写生产库。
- 固定隔离 API 候选改为 `858aa6a5bebbdb88346c6282f691b4976886b935`，只增加微信实际使用的 `https://mmecoa.qpic.cn/` 图片域名白名单、对应归一化、用四页公开源生成可审查内容的脚本与回归。本工作环境 Node 24.19.0 typecheck、218/218 API 测试、build 和四页内容/账号/图片顺序校验 PASS；[自托管固定 Gate 39141950531](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39141950531) 四项 verify／commercial／mysql／profile 全部 PASS；[只读归档 39141950607](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39141950607/artifacts/12142425584) PASS。归档内层 SHA-256 `0c316a8582a56c61c89bc8081b0669167b31baee85e0b5f1361bcda7bc089180`，manifest 与 162 Git blobs 本地复核 PASS。四份真实内容负载在模拟管理员 API 合同中通过，无生产写入。原 `50e7fe3d` 的 Gate、归档、ECS staging 和 release 准备均属旧候选证据；现役 `8cc4bb85` 未变，旧准备目录不准直接切流。
- 四篇页面已具备站内内容数据，不代表十月全量自动同步恢复；10 月 12 日《中南大学保研看什么？》仍无原文 URL。生产资讯写入、News V2 开关、API 切流、图片在微信真机可加载、客服、角色、商户和正式发布仍待分别验收。源端 `freepublish/batchget` 对这几条短链的缺席尚未从根本上变成全自动发现能力。

页首记录当前可执行状态，后文保留取证时间线。完整收费版为正式交付目标，生产收费尚未验收；[固定候选与独立 DDL 审查包](p1-paid-release-scope-and-schema-review-2026-10-17.md)是历史审查材料，新的固定配对见下节。旧日期的计划、候选 SHA、绿灯和“下一步”不自动成为今天的授权。接手先读 CONSTITUTION.md → AGENTS.md → 本页 → 对应专项文档；涉及 ECS 再读 ops/ecs/AGENTS.md。

## 50e7 前一配对验证史（已被页首 858aa6a5 取代）

- 固定前端源码 `51ea8775de74581289617cf1428ba4165775c1e0`（`p1/foundation` 的快照）；固定隔离 API `50e7fe3d7f93a347dfdc4af0675992690eb01e6f`（`codex/p1-news-content-isolated-2026-10-18`）。API 是生产 `8cc4bb85` 的后代，只在旧隔离候选 `1b8ae8b3` 上增加五个资讯相关文件。**不要从移动分支 HEAD 归档 API**。
- 本地 Node 22.23.3：隔离 API typecheck、217/217 测试、build PASS；前端小程序 typecheck、导航/目录/导出/真实数据 96/96 PASS。镜像缺失的二进制图标已从仓库原样补齐；旧的 53/54 只是临时镜像不完整。`tools/testing/real-data.test.cjs` 已与正文必填合同对齐。这个结果不替代自托管 Runner、ECS、生产数据库和微信真机。
- 精确候选自托管运行：[隔离 API Gate 39111190229](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39111190229) PASS（verify、commercial-gate、mysql-gate、profile-gate 四任务成功），[前端 Gate 39111190252](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39111190252) PASS，[API 归档 39111190239](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39111190239) PASS。内层 tar.gz SHA-256 `64f58071e86fcdf292810a82314117148232a5fd64ccd38d4a730635c288fe6d`；只读制品不是生产切流批准。
- [固定 ECS staging 验收脚本](../../ops/ecs/verify-news-content-staging-20261018.sh) SHA-256 `cf88bdd43839b5f9a9aee05b0c0c3f6593c34c1c0db751c064b2df145dd21de4`，已过 `bash -n`；它只校验新归档和 blobs、隔离构建及 256 MiB／50%／64 tasks 无数据库冒烟，要求上传到以新 SHA 命名的 staging 目录。本脚本的 ECS 运行回执见下一段。
- **2026-10-18 23:01 CST 用户 ECS 回执：** 固定 `50e7fe3d` 归档与验收脚本双 SHA-256 OK，manifest 与 Git blobs PASS；隔离目录 `/opt/jiuchen-api/staging/verify-50e7fe3d7f93a347dfdc4af0675992690eb01e6f-20261018-145737-266223`；`ECS_TYPECHECK_AND_BUILD_PASS`。cgroup v1 实测无数据库 30 次健康请求，`MemoryLimit=268435456`、`MemoryPeak=78573568` bytes、`MemoryFailcnt=0`、CPU 比例 0.5、TasksMax 64，`ECS_KERNEL_256M_NO_DB_SMOKE_PASS`；最终 `ECS_CANDIDATE_STAGING_PASS`、`ECS_STAGING_GATE_PASS`。`current` 仍指向 `/opt/jiuchen-api/releases/8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`。此证据只覆盖隔离构建/无 DB 基础启动；真实数据库、AI、资讯数据、支付、真机仍待验。日志为用户附件“粘贴的文本 (1)(20261018-150147).txt”，未将原始日志复制进 Git。
- [固定 release 准备脚本](../../ops/ecs/prepare-news-content-release-20261018.sh) SHA-256 `b66f274f5f91a02149a82612b63e4575cc0e5230110ee932514aa6d289e5631a` 已过 `bash -n`；ECS 执行回执见下一条。它从同一固定归档校验 manifest/Git blobs，隔离构建并将 root 所有、服务用户可读的完整目录移入 `releases/50e7...`；不写 READY/approved-release、不重启、不切 current、不连生产 DB。发布审批仍待现场。
- **2026-10-18 23:11 CST 用户 release 准备回执：** 固定脚本与归档双 SHA-256 OK，`ARCHIVE_MANIFEST_AND_BLOBS_PASS`；独立 unit `jiuchen-release-build-1792336165-270505.service` 的 typecheck/build `RELEASE_TYPECHECK_AND_BUILD_PASS`，结果 success/status 0；`RELEASE_LINK_BOUNDARY_PASS`。正式目录 `/opt/jiuchen-api/releases/50e7fe3d7f93a347dfdc4af0675992690eb01e6f` 已生成，`RELEASE_PREPARED`。`PRODUCTION_CURRENT_UNCHANGED=/opt/jiuchen-api/releases/8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`；脚本未写 READY/approved-release、未重启、未连接生产数据库。生产真实依赖、资讯数据、具体上线范围批准与微信真机仍待验。
- 首发真实内容仍缺：四条已给短链以及 10 月 12 日中南大学稿在现有官方 `freepublish/batchget` 及生产库未命中；其中《10月竞赛清单来啦～》经后台确认属于「贴图」。需从同账号可核的公开页面或运营后台取得正文、图片顺序和原链接；仅有截图／短链本身不能生成完整站内阅读。现有自动来源**尚不能覆盖贴图**，管理员受控补录是当前可验收的首发路径，自动覆盖另记未通过。
- **2026-10-18 23:22 CST 来源路径纠偏：** 以前的图文由官方 `freepublish/batchget` 响应中的 `news_item[].content` 自动入库，运营无需交原稿。四条十月短链在这次完整接口扫描未出现，不意味着浏览器网页没有正文；当前工作环境的公开检索打不开短链，浏览器扩展未连接到用户 Chrome。已准备[四页匿名公开网页采集脚本](../../tools/news/collect-public-pages-windows-20261018.ps1)，只在用户本机独立 Chrome 配置读取已给短链并打包原始渲染 DOM，不用用户手工复制原稿、不接触生产库或现有 Chrome 资料。首版执行结果见下一条；采集结果须核服务号归属、正文/图片完整性，再决定受控入库；中南大学稿尚缺 URL。
- **23:28 CST 采集回执：** 用户上传 `jiuchen-public-pages-20261018-232648.zip`；四页 `Chrome exit=0` 但 HTML 均为零字节、ARTICLE/ACCOUNT_MARKER 均 false。首版脚本把进程退出码误当采集成功，**公开正文并未取得**。已准备[Windows HTTP 采集修正脚本](../../tools/news/collect-public-pages-windows-20261018-v2.ps1)：对同四条短链依次用 Windows `curl.exe` 与 `Invoke-WebRequest`，记录字节数/内容标记，零字节时明确失败；无生产写入，不使用浏览器用户资料。尚待实跑，不能记资讯来源恢复。
- 生产三组 DDL 已执行，最小加密备份及隔离导入演练完成；生产 API 切流、News V2 预热／启用、真实商户接线和支付、四角色及资讯/客服真机、微信提审与正式发布均无通过回执。需要在这些实际验收后更新 CODE / TEST / DEPLOY / DEVICE，不得沿用旧候选绿灯。

以下为按时间保留的取证过程；其中 `283a`／`1b8` 的“固定候选”“下一步”和当时的未通过项均是历史状态，以本节为准。

**2026-10-18 资讯站内阅读施工（代码完成、未部署）：** 在 `p1/foundation` 已扩展管理员核实补录为文章文字/图片顺序块、贴图图片组、视频原链，发表时间可空，限制图片为 `https://mmbiz.qpic.cn/`，角色/原文 URL 校验保持；小程序详情页呈现顺序文字/图片、图片预览和原链收藏。News V2 无日期稿使用创建时间参与窗口排序，但页面不伪称发表时间；官方同步按相同原文 URL 复用核实记录 ID、保留人工图片内容/时间来源，避免空正文覆盖。现有自动接口仍只扫描 `freepublish/batchget` 图文，**没有取得贴图官方自动接口证明**；贴图及接口漏稿须先由运营从同账号后台核实原始文字/图片与链接后导入，不能只补链接。原四条短链的真实站内正文/图片仍未提供或写库。服务号自动覆盖、生产 API/开关、体验版真机尚未通过。当地镜像已额外安装 Node v22.23.3，并用该版本运行 API typecheck、215/215 测试、build 全 PASS；小程序 typecheck PASS（本机 Node 24）；相关正文阅读静态回归 2/2。全导航在当地镜像为 53/54，唯一失败因镜像未包含仓库二进制图标而报 ENOENT，不计完整导航 Gate。固定新候选 SHA 后仍需自托管门禁与微信真机复验。新代码范围及证据详见[资讯拓扑审查](p1-news-topology-first-principles-2026-10-18.md)。

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
