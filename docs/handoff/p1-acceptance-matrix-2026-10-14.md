# P1 截图与文字逐项验收矩阵 — 2026-10-14

当前基线 `18eb311`，分支 `p1/foundation`。施工前 `project.config.json` 和 `packages/schools/data.ts.bak` 保留且排除提交。生产已知 Release A 为 `8cc4bb85`，本轮未重验。所有身份沿用原有四栏。

顺序：0 工作区与证据 → 1 最新资讯定位 → 2 资讯窗口／视频／收藏 → 3 报告映射与全部导出 → 4 四栏只读复用及服务端拦截 → 5 真实身份列表 → 6 CI、发布材料、统一真机验收。依据用户提供的施工顺序原文，不以截图中的界面文案作为操作授权。

| ID | 来源／要求 | 验收方法 | 代码 | CI | 生产 | 真机 |
| --- | --- | --- | --- | --- | --- | --- |
| N01 | 图2：10月12日新文章漏取 | 原链接逐段核对源端分页、同步、入库、公开列表；不可用旧文章更新回执代替 | 诊断脚本／重复页缺陷修复；根因未证实 | 分页负例PASS | BLOCKED：本机40164，缺ECS回执 | 原问题未复验 |
| N02 | 约30条正常展示＋旧文72小时缓冲 | 29/30/31边界、幂等、到期、隐藏撤回优先、后台时间原因 | 已实现30＋72 | 38431579922 PASS | 七表／开关待审批 | 待验 |
| N03 | 图文与视频 | 图文正文／封面／原文；视频标题／封面／摘要／可信原链接 | 图文及内嵌视频已实现；独立视频缺样本 | 合成样本PASS | 待发布及源端样本 | 待原文跳转 |
| N04 | 图3：个人收藏可点击并重开 | 用户隔离、幂等、即时状态、公共退役后原链接保留 | 已实现；旧API提示不可用 | 隔离／幂等／保留PASS | 七表／开关待审批，未假称收藏成功 | 待验 |
| N05 | 16:9封面保持 | 手机卡片比例及标题摘要约束 | 保留16:9、标题2行摘要3行 | 静态回归PASS | 小程序待发布 | 现比例用户认可 |
| I01 | 图1：模板学员占据查阅列表 | 确认来源；明确测试标识隔离、真实账号搜索保留；不删除历史 | 种子来源已确认；未认领种子隔离，绑定账号保留 | 本地PASS；最终CI见closeout | 待脱敏聚合证据／API发布 | 待验 |
| R01 | 图4：复用对应身份完整UI | 复用已有四栏页面组件；原会话保留 | 已复用原生角色页；无独立镜像 | 38488469097 PASS | API未部署；无有效账号目标明确报错 | 待逐页比对 |
| R02 | 四栏冻结 | 学员首页／规划／机会／我的；教师管理员原四栏 | app.json/tabBar无改动 | 四栏／旧路由回归PASS | 无导航扩容 | 待验 |
| R03 | 双重只读 | 所有写入、审核、支付、AI运行、OCR导入服务端403；无越权读取 | 短期固定目标只读凭证＋全局写入拒绝 | 写入／越权／撤权负例PASS | API待发布 | 待验 |
| R04 | 我的退出 | 客服下方退出只读查看，返回原工作台，清空目标上下文 | 已实现 | 退出／迟到响应PASS | 小程序待发布 | 待验 |
| A01 | 图5：优势空与其他分析冲突，核心业务缺陷 | 脱敏核对生产成功记录的输入信号、保存strengths与证据数量；再查原始生成／修复／过滤环节，不从风险编造优势 | 报告映射已修；Schema与提示允许空优势、证据过滤可删条目；新增只读聚合诊断，根因待样本 | 映射回归PASS；语义质量尚无回归 | P0 DATA PENDING：ECS只读回执；运行时修复需先定根因并单独验收 | 待验 |
| A02 | 图5：编号孤立行 | 对应论据旁“参考案例JCC…”内联展开来源；无关联隐藏 | 已实现可靠关联内联引用 | 编号负例PASS | 小程序待发布 | 待验 |
| E01 | Markdown／Word／PDF／图片 | 同份保存input/output；姓名缺失提示、ID、导出日期 | 五个选项已恢复；PDF为图像型不可选文字 | 全文／OOXML／PDF回归PASS；合成PDF4页渲染检查 | 纯客户端，待微信发布 | 待真实Word分页／文件下载 |
| E02 | 摘要分享图 | 说明适合转发，仅摘要；完整内容可另导出 | 已命名并解释用途 | 导出回归PASS | 小程序待发布 | 待相册 |
| E03 | 完整报告长图 | 包含完整报告与用户提供信息；无截断／黑块／中文完整 | 全文＋保存input；分段白底合成；超预算明确失败不截断 | 流式PNG／透明像素／完整内容PASS | 小程序待发布 | 无黑块／无截断仍待真机 |
| E04 | 姓名＋ID＋导出日期 | 真实姓名来源；缺失明确占位；水印正文下方-25°/alpha.30 | 已统一真实档案姓名；缺失“姓名未登记” | 水印／无昵称代替PASS | 待发布 | 待验 |
| H01 | 首页新老用户、课表时间地点状态 | 完善资料入口／AI入口；本周时间地点为空提示 | 复核已有实现，未重构 | 首页／周次／保存负例PASS | 既有课表链路已验收，本轮前端待发布 | 本轮待复验 |
| I02 | 真实状态与游客隔离 | 未认领／未分配／待完善；游客不混入正式学员 | 现有identity投影＋正式查阅状态；未猜实名／未虚造游客 | 投影／权限负例PASS | 真实全角色样本不足 | 待真实账号 |
| P01 | 精确发布与回滚 | DDL／API切流／timer／微信分别审批；保存精确SHA与清单 | 见closeout材料；生产候选未READY | 集成CI与隔离MySQL不替代发布验证 | BLOCKED；无DDL／切流／timer操作 | 未上传／发布 |

N01 样本原文：`https://mp.weixin.qq.com/s/WnhmDWF30adA5OM_BipHgQ`（用户确认10月12日已发布）。网络阅读器无法打开，不将抓取失败解释为文章不存在。

真实基线分类：资讯窗口、收藏七表和只读投影为“仓库已有但生产依赖未验”；PDF与原生四栏目标上下文为“代码缺失”；最新文章与模板学员为“数据异常待证据”；优势为空为“保存结果／映射待定位”。本地官方只读检查返回 `official_account_token_40164`，需从已有白名单ECS执行；不修改白名单。

## 阶段1／2代码回执

- 源端重复页现在报 `official_account_pagination_duplicate_group`，不把重复发布组计成完整覆盖；回执含页数、独立发布组数、源端最新3篇标题与时间。此缺陷已用合成重复页复现，不声称是本次10月12日漏文根因。
- 30条窗口、72小时边界与个人收藏快照保留已落实；含视频的图文走可信公众号原链接，独立视频发布仍需官方源端样本。
- 后台展示状态变更／缓冲开始／退役截止时间；原因仅根据已有状态与窗口规则说明，不伪造源端撤回证据。
- 最新本地 API 全量202/202、小程序91/91、typecheck/build通过；后续阶段变更须重新验证。生产七表、开关、原文真机打开仍待独立审批及验收。
- “收藏原文”不再死按钮；旧API无收藏能力时明确告知服务不可用，不假称已保存；新API具备表及开关后进入真实个人持久化。

## ECS只读定位（无需切流）

将 `tools/diagnostics/news-target-read-only.mjs` 作为诊断文件放入 `/opt/jiuchen-api/staging/diagnostics/`，并将已测试业务树的 `services/api/src/services/official-account.ts` 独立放为该目录的 `official-account.mts`。后者只有可擦除的type import，无运行时依赖，使用Node22受控类型擦除读取。由已有授权运维账号执行以下命令。脚本不启动API、worker、同步或DDL，只读公众号及 `news_posts`。两文件不覆盖现役release；独立scanner防止现役旧代码把重复页误报完整。

```bash
cd /opt/jiuchen-api/current/services/api
NEWS_AUDIT_URL='https://mp.weixin.qq.com/s/WnhmDWF30adA5OM_BipHgQ' \
NEWS_AUDIT_SCANNER_PATH='/opt/jiuchen-api/staging/diagnostics/official-account.mts' \
node --experimental-strip-types --env-file=/etc/jiuchen-api/production.env \
  /opt/jiuchen-api/staging/diagnostics/news-target-read-only.mjs
```

若输出 `TARGET_NOT_IDENTIFIED_SHORT_URL_NEEDS_TITLE`，仅补 `NEWS_AUDIT_TITLE` 为该文准确标题再执行一次。输出只含公开文章字段及脱敏数据库样本键，禁止贴环境文件。`SOURCE_COVERAGE_UNVERIFIED` 禁止推断文章不存在；不完整扫描或旧scanner缺独立组数均受此门槛约束。输出 `NOT_IN_FREEPUBLISH_SOURCE` 时须核对公众号后台实际账号与发布渠道；`SOURCE_PRESENT_DATABASE_MISSING` 才是入库缺口；`DATABASE_PRESENT_HIDDEN_OR_UNCLASSIFIED` 是审核／隐藏环节；可见候选再查公开列表排序和窗口。当前本机40164未获ECS回执，N01生产定位仍为BLOCKED。

## 阶段3回执

- 结构化映射直接读取保存的 `output.strengths`，不存在索引错位；原页面遗漏 `profileSummary`。现完整显示核心结论，空优势条目明确说明“已保存报告未单列”，不把缺条目解释为用户没有优势，也不重写历史分析。历史模型为何没有单列优势仍需真实报告输入输出离线评测；Runtime/Prompt未修改。
- 已恢复Markdown、Word、PDF、摘要分享图和完整报告长图；所有全文格式包含保存的input及output。JCC只取可信evidence关联，并在对应论据内联标明“参考案例”，展开来源；没有关联时隐藏编号。
- 姓名来自当前学员业务档案，读取失败／无实名字段时显示“姓名未登记”，不把昵称当实名。用户ID与导出日期统一写入全文；Word逐页页眉，PDF及图片文字水印-25°/alpha.30。
- PDF使用现有中文Canvas及分段PNG编码器生成A4分页图像PDF（不可选择文字），没有新增后台转换服务。合成fixture实际生成MD、DOCX、PDF、摘要PNG、全文PNG；Poppler解析／渲染4页A4成功，逐页检查中文、水印、页码、无黑块／裁切，修复末尾身份导致的空白第5页。
- 小程序完整93/93回归通过，尾页修复后导出16/16再验证。Word已核验OOXML结构／页眉与全文保留，真实Word客户端分页仍PENDING；真机文件下载和相册保存仍PENDING。临时文件10分钟清理，下次打开报告也清理本功能过期文件。
- 资讯提交 `bad572a` 已推送，GitHub CI `38431579957`、News MySQL `38431579922`、Profile MySQL `38431579875` 全部PASS；均不是生产迁移或微信发布证据。

## 阶段4回执

- 删除独立镜像界面；原lazy路由只负责授权进入已有native四栏，app.json和tabBar结构无改动。目标界面仅增加只读限制与“我的→联系客服→退出只读查看”。
- 原账号会话保留，目标读取使用不含原凭证的短期随机只读能力令牌（10分钟、固定目标、绑定原session；进程重启需重新进入）。每次读取重新校验原授权与教师分配，写请求在全局hook提前403，去掉目标header也不能用只读令牌写入。
- 不允许只读令牌读取原账号认证、管理员操作、支付或任意目标；前端同样拦截写入、OCR/AI入口、审核、资料/计划编辑。切换或退出丢弃迟到响应，成长缓存不将目标数据写入原账号缓存。
- API typecheck/build PASS，完整206/206；小程序typecheck PASS，完整94/94（含四栏、授权/写入负例、退出和迟到响应）。仅是本地验证；生产API/真机角色逐页对比仍PENDING。未认领或失效目标账户不可模拟完整登录界面，保留明确错误与退出。

## 阶段5回执

- 来源证据：`seed-test-internal-ids.ts` 的 `dev-seed-v1` 批次，以及 `seed.ts` 的固定演示学员ID；旧查阅名单直接取原表，未作业务投影。未认领且有此明确来源的记录从正式查阅隔离，仍存在于编号管理与数据库，不删除、不重写历史。
- 已绑定种子身份可能属于真实使用者，一律保留。展示只取students/teachers和可信user_profiles学校专业，不从昵称猜实名；占位业务姓名显示资料待完善，不声称实名已核验。尚无正式测试标记的账号不能仅按名字从正式名单删除，需人工核实。
- 新GET `/me/admin/read-only-directory` 受原管理员权限保护，不改变分配接口和写权限。返回认领／分配／待完善标签及可查看状态；未认领、禁用、无有效目标角色不可进入原生查看。搜索保留姓名、学校专业，原有四栏未变。
- 新只读聚合诊断 `tools/diagnostics/identity-seed-read-only.mjs` 仅输出种子批次绑定数及Profile列存在性，不输出个人姓名或凭据。在ECS按上方诊断目录方式取出后，从current/services/api执行 `node --env-file=/etc/jiuchen-api/production.env /opt/jiuchen-api/staging/diagnostics/identity-seed-read-only.mjs`，不会启动应用或worker。
- 只读切片 `1806210396b6592149eae480fb1d00b17524c156` 的集成CI `38488469097`、News MySQL `38488469119`、Profile MySQL `38488469141` 均PASS。正式名单生产聚合回执与真实账号验收仍PENDING。

## 阶段6最终门槛

业务源码`a1541a118b69728979258d479162ddcaddbad649`的CI `38490779604`、News MySQL `38490779887`、Profile MySQL `38490779609`均PASS。API208/208、typecheck/build通过，小程序typecheck通过；最后增加诊断覆盖负例后全量95/95。普通学生四栏和app.json未改；学堂缺地点显示“地点：暂无”，只读首页不提示可运行AI。资源／备份／生产只读回执／微信真机未验；精确范围、依赖、执行与回滚材料见 [最终交接](p1-final-experience-closeout-2026-10-13.md)。本轮未制作可切流隔离包，发布候选BLOCKED，不伪报READY。

## 10月14日核心质量复核

A01提升为P0数据质量调查。`tools/diagnostics/assessment-strength-read-only.mjs` 从现役库只读最多100条成功评估，仅输出空优势数量、匿名样本键、完成时间、各结构数组数量与输入信号布尔值；不输出姓名、原文、用户ID、模型输出正文。现行 `assessmentOutputSchema` 允许空 `strengths`，系统提示词亦允许空数组，证据引用保守过滤可移除条目；这些是已核实的代码路径，**尚非生产样本根因**。使用该回执定位目标记录后再做最小脱敏离线对照；不自动改历史评估或重复调用付费模型。

在ECS既有授权账户下，复制该诊断文件至 `/opt/jiuchen-api/staging/diagnostics/` 后执行：

```bash
cd /opt/jiuchen-api/current/services/api
node --env-file=/etc/jiuchen-api/production.env /opt/jiuchen-api/staging/diagnostics/assessment-strength-read-only.mjs
```

N03视频目标是标题、封面、摘要及真实服务号视频原链接的跳转；不开发小程序内播放。独立视频样本仅用于验证链接字段与真机打开。

## 10月14日09:06 CST生产只读回执（用户ECS执行）

- `freepublish/batchget` 两页40组、40个独立组、41篇，覆盖完整且未截断；源端最新 `sourceUpdatedAt=2026-09-25T01:00:02Z`，没有10月条目。目标短链接元信息读取失败（`targetTitle=null`），故该短链接本身尚未与源端条目按标题匹配；`news_posts`按短链接未命中。由于41篇只列出了按来源更新时间排序的前10篇，且`publish_time`全为空，**不能凭最新更新时间判定10月12日文章不在41篇中**。下一步列出全部41篇标题并精确匹配，再核对服务号账号与发布渠道，以及当前AppID末六位`4880db`是否对应目标服务号。不要把`TARGET_TITLE_NEEDED_FOR_SHORT_URL`误读成源端没有该具体文章的最终证明。
- 成功评估9条中1条`strengths=[]`，匿名样本键`9689ad9c77b4`，完成时间`2026-10-12 10:40:12`（数据库原时区未在回执中注明）；`risks=1`、`targets=1`、`evidence=13`，输入含GPA、排名、英语、科研、竞赛。此为**核心质量缺陷已在生产记录中证实**，不是无资料样本。持久化结果不能分辨模型原始空数组还是引用过滤移除；禁止以页面文案替代修复，下一步对该记录做受控脱敏输入／输出与证据引用核对，建立质量门槛和回归，不重写历史也不自动重复收费调用。
- 本次只读，不构成News V2/Assessment Runtime发布授权。

## 10月14日09:19 CST完整标题对照（用户ECS只读回执）

- `freepublish/batchget` 40组、41篇逐条列出；目标标题《中南大学保研看什么？成绩、综测与学院细则》及短链接均不在全部41篇中。41篇均按`source_key`在`news_posts`找到；36篇active但`tagCount=0`，5篇已有1或2个标签。故**目标文章未进入当前AppID的freepublish列表**，此次缺文不归因于分页、入库、标签或30条窗口。另有36篇旧文的公开标签运营问题，应独立处理，不拿它解释目标漏文。
- 下一个唯一定位点：公众号后台核对目标文章所属账号AppID是否末六位`4880db`、文章发布渠道（发表记录／群发／视频号等）和对应原始长链接。若账号不同，修正授权绑定；若账号相同但渠道不属于freepublish，补单一受控来源适配或后台原链接补录，保留去重、审核、收藏及30＋72窗口，不使用无授权页面爬取冒充官方同步。视频仍仅卡片跳转原链接。
- A01仍需针对匿名键`9689ad9c77b4`做核心质量修复；41篇资讯对照不解决AI优势缺项。

## 10月14日09:27 CST公众号后台实证（用户截图）

- 同一服务号 AppID 末六位与 ECS 配置 `4880db` 一致。后台“发表记录”共57次，目标《中南大学保研看什么？成绩、综测与学院细则》位于最新记录，周一13:00，状态“已发表”；展开状态明确“已开启通知，内容已在服务号列表和服务号主页展示”，58人通知成功、0失败。用户确认目标日期为10月12日。另一截图同时显示随后历史发布记录。
- 同一账号的 API `freepublish/batchget` 完整返回40组41篇且无目标。因而账号误绑、分页漏扫、数据库写入、标签与30条窗口均非**该目标文章**的首个断点。后台57次和API40组不能直接相减为缺失篇数（单位及集合不同）；可以确认两种视图不一致。
- 当前不把“后台已发表”为由臆断具体发布通道或微信接口故障。下一步在既有白名单 ECS 对目标原文链接及可用官方只读来源做字段级核对，确定稳定增量来源；同时将该目标原链接作为受控补录候选，须保持原文链接、去重、审核、收藏和30＋72窗口。未做生产补录或同步变更。

## 10月14日21:32 CST同账号漏文受控补录代码候选

- 在 News V2 已启用且七表存在时，新增管理员会话 `POST /me/admin/news/verified-official`：输入真实公众号原文链接、标题、封面、摘要、官方后台已核对的发表时间与人工分类。原文链接仅接受 HTTPS `mp.weixin.qq.com`，封面限制微信图片域名；记录保留管理员核对时间与用户标识，不抓取公众号页面，不冒充 `freepublish` 的来源时间。
- 同一原文链接重复提交返回既有记录；同标题不同原文链接返回409待人工核对。新增记录仍按 `wechat_official` 进入既有30条窗口与72小时缓冲、可按个人收藏原链接。后续接口若取得同名不同链接，源端新行默认未分类，不自动公开成第二张卡；仍需独立来源身份核对。独立视频仅使用原文链接及卡片信息，无小程序内播放器。
- 业务提交 `f69f99a68655fb263b99362de210be3a95eb74a2`；本地 Node24 对改动的三个 TS 文件 `node --check` PASS。该提交的 [CI](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38572604647)、[News MySQL Gate](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38572604689)、[Profile MySQL Gate](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38572604662) 均显示 FAILURE；job 步骤信息为空，日志接口404 BlobNotFound，不能判定代码是否通过类型检查或测试。前一条纯文档提交 `16c68b6` 的同三项工作流也为 FAILURE。候选状态为 **CODE COMMITTED / SYNTAX CHECK ONLY / FULL CI UNVERIFIED / PROD NOT DEPLOYED / DEVICE PENDING**。
- 这个入口可补已确认的10月12日文章，但**未解决公众号后台发表记录57次与API返回40组的自动同步差异**。下一步需要同账号官方数据字段级回执，确定可稳定枚举新增发表的接口或事件，再做单一来源适配及长期漏取告警。不得仅用人工补录宣布自动抓取修好。真实补录、DDL、NEWS_V2开关、API切流和微信上传均未执行。

## 10月14日22:01 CST本地验证回执（用户 PowerShell）

- 同步至修复提交 `7165a11de9792d5c366cc4b618417f041caf7d65`；首次人工运行发现新测试第121行 TypeScript 泛型缺 `>`，已修复。随后 `npm.cmd --prefix services/api run typecheck` PASS，`npm.cmd --prefix services/api test` **209/209 PASS**，`npm.cmd --prefix services/api run build` PASS。依赖 `npm.cmd ... ci` 安装188包成功。原本 `project.config.json` 本地修改未覆盖。
- 本机回执证明本批 API 代码可构建、回归通过；GitHub Actions 仍显示失败且 job 日志404，根因未核实。当前 **LOCAL API PASS / GITHUB CI UNRESOLVED / PROD NOT DEPLOYED / DEVICE PENDING**。自动漏取缺口、真实补录和AI优势质量缺陷均未由此测试通过。

## 10月14日22时后优势质量门槛候选

- `dff3c9cf9080cc6af95800a28284f3c386b92ba5`：评估输入明确填写竞赛奖项或科研产出且输出 `strengths=[]` 时，使用既有**最多一次**模型修复机会，要求核对真实成果并引用相应 input ref；修复仍无优势则抛 `assessment_strengths_missing`，后台按已有失败路径持久化并释放预留额度。无奖项／无科研产出输入仍允许空数组；不按 GPA 或科研参与经历推断必然优势。
- Agent 版本从 `assessment-agent-v2` 提升为 `assessment-agent-v3`，输出 Schema 不变；历史成功报告保持原样，无自动重跑或二次扣费。新增合成样本覆盖“修复后有据优势”和“修复后仍空则失败”。本地仅 Node24 语法检查；**API typecheck / 211 项预期测试 / build 尚待用户本地回执**，GitHub Actions 状态另核。该候选不改变生产模型选型或知识库，运行时修复可能产生一次额外模型调用，属于待独立发布范围。
- 这条门槛防止未来有明确成果的空优势报告被记为成功；匿名生产历史样本 `9689ad9c77b4` 缺原始模型输出，不能倒推出当时是模型空生成还是引用过滤删除，仍需脱敏样本核对。既有历史报告不伪造补全。

## 10月14日22:19 CST本地回归与断言修复

- 用户同步到 `7629646` 后执行：API typecheck PASS、build PASS；测试 211 项中 210 PASS、1 FAIL。唯一失败为 `/assessments/meta` 断言仍期待 `assessment-agent-v2`，而新质量门槛已经升级为 v3；两项新增优势行为测试均 PASS。
- 提交 `1d72b0158bd4b1233ad1b19f9478e52cd4b410d3` 将该元数据测试期望改为 v3。此提交之后的 211 项全量结果**尚未重新取得**；不得把先前 210/211 记为全通过。生产运行时与历史记录未变。
