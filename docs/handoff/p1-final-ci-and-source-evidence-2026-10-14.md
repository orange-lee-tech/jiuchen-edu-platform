# P1 最终 CI／来源证据（本轮实际读取）

本轮初始HEAD `35f61d767a364e1fdca641305ff6936392abbc39`，工作区仅原有project.config.json修改和schools/data.ts.bak未跟踪。fetch及ff-only pull后同HEAD；不按历史交接SHA推断当前代码。

## A. CI 首个失败环节已定位

GitHub插件对该SHA读取：CI run38580343485/job115908264290、News run38580343556/job115908264300、Profile run38580343879/job115908271356均conclusion=failure，steps=null、logs_url=null。用户Actions原始annotation：

> The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings

故首个失败在GitHub账号计费／运行器启动准入，**没有执行代码步骤**。BlobNotFound不是代码测试日志，不能据此修业务代码，也不能把红灯写绿。唯一人工动作：账号／组织账单管理员在GitHub Settings → Billing & plans恢复付款或Actions可用额度；先看具体限制，不盲目修改预算。本轮不修改付款或预算。

固定集成业务点为35f61d7；本轮新兼容测试及隔离候选另有精确SHA。恢复计费后对各固定SHA重跑CI、News与Profile三个Gate一次；未解除前不反复重跑消耗额度。已读取的本机211/211是用户回执，独立隔离候选需重新运行，因为源码树与集成分支不同。

## B. 最新文章首个缺口已确定，自动来源未通过

目标《中南大学保研看什么？成绩、综测与学院细则》，10月12日、同AppID末六位4880db。后台已发表；freepublish完整两页40组41篇没有目标，41篇均入库。首个缺口在官方来源视图之前，不再重复扫描40/41，不再把该缺文解释成分页／入库／分类／窗口错误。后台57次发表不是57篇，不能按57-40推断漏取篇数。

新增 `tools/diagnostics/news-source-fields-read-only.mjs` 做有限字段对照：10月12/13两日官方图文数据，永久图文素材最多3页60组，若提供官方article_id则单条getarticle；不调用freepublish列表，不抓网页，不同步，不开DB或worker，不发布。只输出公开标题、msgid/media_id、可验证的公众号url、日期、覆盖范围及安全错误码。永久素材不等于已发表；数据分析标题/msgid也不等于可导入原链接。源端有匹配之前不接新自动适配，不猜URL。

官方文档读取本机受限，暂未得到账号实际字段回执。因此现有管理员受控补录继续作为体验版应急方案，需V2开关及七表；它不冒充自动同步修复。复用既有接口、去重、审核、30＋72与收藏，不另建同步服务。

只需一次ECS命令（先把本批诊断文件独立放staging/diagnostics，不覆盖current）：

```bash
cd /opt/jiuchen-api/current/services/api
NEWS_AUDIT_DATE='2026-10-12' \
NEWS_AUDIT_TITLE='中南大学保研看什么？成绩、综测与学院细则' \
node --env-file=/etc/jiuchen-api/production.env \
  /opt/jiuchen-api/staging/diagnostics/news-source-fields-read-only.mjs
```

可在同一命令加 `NEWS_AUDIT_SECOND_TITLE`（另一篇近期已发表准确标题）和已由官方后台/接口取得的`NEWS_AUDIT_ARTICLE_ID`，不要按URL猜ID。解锁自动来源必须两个近期真实样本的官方记录→稳定ID→真实原链接→增量／重复同步对照。未取得前AUTO_SYNC_NOT_ACCEPTED；独立视频仅验证标题／封面／摘要／原链接，不做播放器。

## C. 生产基线与健康阻断

用户本次ECSreadlink确认active8cc4bb85、previous b150d2c5，API active/NRestarts0/MemoryCurrent85008384/MemoryMax268435456/CPUQuota500ms/TasksMax64；可用内存981MiB、磁盘22GiB、timer active。**同时127.0.0.1:3100健康连接被拒绝**，不能把10月13日旧200当本轮健康。

新 `p1-production-preflight-read-only.sh` 只核对该API MainPID的实际监听及两健康端点；找不到唯一监听就BLOCKED，不猜端口、不修改Nginx／官网／80/443/8088。它不打印environment。按其回执确定是预检查URL错误、服务子PID还是实际API不可用；发布门槛在健康证实前保持BLOCKED。

## D. 数据库测试边界

本机PATH无mysql/mysqld/docker，常规Docker/MySQL安装路径亦不存在；不在生产库替代演练。复用现有两项GitHub临时MySQL Gate，补备份恢复验证，而非新建第二框架。真实生产结构复刻仍需脱敏DDL/列/索引证据，临时最小fixture不能叫生产结构复刻；生产备份恢复必须另批。本轮不安装数据库、不运行生产DDL。
