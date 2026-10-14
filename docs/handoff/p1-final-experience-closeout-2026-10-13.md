# P1 产品体验收口 — 10月13日任务，10月14日执行回执

## 真实版本与范围

- 初始／同步基线：`18eb311b78ced1d1b69e5fa23360f31ce2bf937f`；安全pull已执行，Already up to date。
- 最终业务源码：`a1541a118b69728979258d479162ddcaddbad649`；API源码验证点为`cc918fd65785f77d176610054812b10559b7f3c7`，其后API无改动。后续交接／诊断提交不是另一份业务构建。
- 生产已知active：`8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`；rollback：`b150d2c5c8720aac8d48fbd0395d8db9c408bc63`，依据用户10月13日回执，非本轮实时SSH核查。Release A已生产，用户报告ECS治理完成，本轮未执行或重新审计治理。
- 学员、老师、管理员各原有四栏；`app.json`未修改。AI Runtime/Prompt/RAG、支付、Schema、timer、官网未修改。无生产DDL／promote／微信上传或发布。
- 两项施工前状态保留并排除提交：`apps/miniprogram/project.config.json`（22增4删）、`apps/miniprogram/miniprogram/packages/schools/data.ts.bak`（未跟踪）。
- 本轮不是删除旧只读路由：三个view文件删除独立“镜像”内容，保留lazy授权入口并进入已有角色页；没有新学生入口、固定底栏或第二套导航。

## 切片与测试

| 顺序 | 提交 | 实际结果 |
| --- | --- | --- |
| 0/1 | `4d1e4c056d488617754bfd32a49dcb402f39adeb` | 截图／文字矩阵、只读文章诊断；本机官方40164，生产漏文根因未证实 |
| 2 | `bad572ab866f5c2f2dc22278de7aed0c1ea813d5` | 重复页拒绝、真实回执、30＋72、个人收藏保留、图文内嵌视频、时间语义 |
| 3 | `138cdf036191c9d17ef778c873368c48f625497a` | 核心结论／空优势语义、可靠JCC内联、五个导出选项、全文input、分段PNG和A4 PDF |
| 4 | `1806210396b6592149eae480fb1d00b17524c156` | 原生四栏只读能力令牌、固定目标／原session、全局写入拒绝、缓存与迟到响应隔离、我的退出 |
| 5 | `cc918fd65785f77d176610054812b10559b7f3c7` | 正式身份投影、明确未认领种子隔离、绑定记录保留、角色负例、脱敏聚合诊断 |
| 6 | `a1541a118b69728979258d479162ddcaddbad649` | 最后原生界面核对：只读首页不提示可运行AI／不提供编辑入口，学堂地点空值统一；再跑小程序94/94 |

所有切片均已推送p1/foundation。逐项验收见 [问题矩阵](p1-acceptance-matrix-2026-10-14.md)；现行资讯合同见 [30＋72合同](../product/news-experience-contract-2026-10-14.md)。

最终源码本地验证：

```text
services/api: npm run typecheck PASS / npm run build PASS / npm test 208/208 PASS
apps/miniprogram: npm run typecheck PASS
node --test tools/testing/miniprogram-navigation.test.cjs tools/testing/report-export.test.cjs tools/testing/school-catalog.test.cjs tools/testing/real-data.test.cjs
95/95 PASS（包含收口诊断覆盖负例；最后业务源码本身94/94）
node --check tools/diagnostics/identity-seed-read-only.mjs PASS
node --check tools/diagnostics/news-target-read-only.mjs PASS
git diff --check PASS
```

小程序没有单独build脚本；TypeScript及WXML回归通过，不冒称微信开发者工具实际编译通过。改用单一受保护名单接口时两条旧断言曾失败，已修正并全量94项重跑成功，不带失败测试提交。

最终业务源码GitHub： [CI 38490779604](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38490779604)、[News MySQL 38490779887](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38490779887)、[Profile MySQL 38490779609](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38490779609) 全部PASS。CI含管理端typecheck/tests/build。隔离MySQL是临时库迁移与关系回归，不是生产库复刻／备份恢复验收。

收口诊断额外增加覆盖负例：不完整扫描／旧scanner没有独立组数时，禁止推断源端没有文章。独立scanner的Node类型擦除导入与无凭据fail-closed已实测PASS。新增负例后小程序全量95/95再通过；最终交接／诊断HEAD的CI与业务源码CI分开核对，不从旧绿灯推断新提交。准确执行方式见矩阵，不能用现役旧scanner的旧计数冒称新分页证据。

使用PDF技能的实际渲染核对：合成fixture生成5种输出；Poppler解析并逐页渲染4页A4 PDF，修复无内容尾页，中文、水印、页码无裁切；DOCX核对OOXML及逐页身份页眉。生成文件位于忽略的`tmp/p1-report-qa`，无真实用户资料；真实Word客户端分页与手机相册仍未验。PDF是图像型，文字不可选取；长图／PDF超资源预算明确报错，不静默截断，建议改全文MD或Word。

## 修改文件与可复核清单

精确全集（不含原有本地文件）：

```powershell
git diff --name-only 18eb311b78ced1d1b69e5fa23360f31ce2bf937f a1541a118b69728979258d479162ddcaddbad649
git show --stat 4d1e4c0 bad572ab 138cdf03 18062103 cc918fd6 a1541a11
```

重点页面：`components/auth-gate`、`components/role-shell`、`packages/read-only/view`、`pages/admin`、`assessment-history`、`assessment-result`、`classroom`、`growth-profile`、`index`、`news`、`news-detail`、`plan-editor`、`position`、`profile`、`teacher-students`；工具为`assessment-image`、`assessment-report-export`、`report-pdf`、`growth-profile-cache`、`navigation`、`read-only-context`、`request`。`report-png`现有编码器复用，未新增第二套导出后端。

API本轮精确名单（相对本轮18eb311基线；不是直接生产复制白名单）：

```text
services/api/src/app.ts
services/api/src/routes/mobile-admin.ts
services/api/src/routes/news-v2.ts
services/api/src/routes/news-v2.test.ts
services/api/src/routes/news.ts
services/api/src/routes/read-only-workspace.ts
services/api/src/services/admin-identity-directory.ts
services/api/src/services/admin-identity-directory.test.ts
services/api/src/services/news-lifecycle.ts
services/api/src/services/news-lifecycle.test.ts
services/api/src/services/news.ts
services/api/src/services/official-account.ts
services/api/src/services/official-account.test.ts
services/api/src/services/read-only-context.ts
services/api/src/services/read-only-context.test.ts
services/api/src/services/session.ts
```

诊断为`tools/diagnostics/news-target-read-only.mjs`、`identity-seed-read-only.mjs`；回归为`tools/testing/miniprogram-navigation.test.cjs`、`real-data.test.cjs`、`report-export.test.cjs`；合成渲染脚手架为`render-report-export.cjs`。其余变更为CURRENT／矩阵／现行合同与本交接。

## 发布材料与实际执行门槛

**BLOCKED — 本轮没有可批准生产切流的隔离候选SHA，不能把cc918fd作为生产release。** 生产基线与全集成源码差异包含本轮之外的News V2、配置/迁移/统计代码；不得按上述“本轮名单”整文件覆盖生产。隔离包、SHA256与256MiB实测尚未生成，不能冒称准备完成。

### A′ 无新增Schema的只读身份／资讯兼容批

代码来源为上述已测试切片；生产源SHA8cc4bb85。只读核心的精确移植范围：

- `138cdf03..18062103` 的API五文件：app.ts、read-only-workspace.ts、read-only-context.ts及test、session.ts；仅全局guard/上下文接入，不移植全集成app.ts。
- `18062103..cc918fd6` 的API三文件：mobile-admin.ts、admin-identity-directory.ts及test；只新增受保护名单读接口与投影，不扩大原写权限。
- 资讯兼容批仅official-account分页／错误／扫描回执及旧news读写兼容所需差异；mobile-admin需hunk级移植，禁止夹带未部署V2引用。

这些是移植材料，不是已验证隔离构建物。隔离后必须重跑typecheck/build/全量tests及旧Schemafixture：缺enrollment_year／支付三表／V2七表、NEWS_V2_ENABLED=false。只读名单新SQL未引用缺列及支付；完整角色页的现有Profile接口仍受缺列影响，不能将名单兼容扩大为整个体验无Schema依赖。原生角色页还需要实际成长／课堂Schema证据。

能力令牌没有新表或env；进程内最多512个、10分钟、绑定原session。现单进程适用；多实例未授权，不能直接扩容而假设凭证共享。API重启让只读查看失效，但原账号session不变，重新选择即可。

预检查只读命令（不打印env）：

```bash
readlink -f /opt/jiuchen-api/current
cat /opt/jiuchen-api/shared/previous-release
systemctl show jiuchen-api.service -p ActiveState -p User -p Group -p NRestarts -p MemoryCurrent -p MemoryMax -p CPUQuotaPerSecUSec -p TasksMax
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3100/health/live
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3100/health
command -v jiuchen-promote
```

同时按矩阵提供文章／种子聚合脚本回执；脚本不导入app、不开worker、不同步、不写数据库。

隔离构建门槛：Node22；归档先校验SHA256，拒绝绝对路径、`..`、符号链接／硬链接／设备文件、`.env`和私有data-source；按源码白名单解压到新staging目录，不覆盖current。构建cgroup预算经ECS实际余量批准，npm单进程、禁止把Node heap当RSS限额。以jiuchen-api用户核对目录遍历、dist可读、模块依赖及共享案例可读，不输出数据／env。

服务受控测试必须`env -i`且无任何DB／AI／支付／CAM凭据，独立127.0.0.1端口。候选onReady仍可启动worker逻辑，只有database未配置下的空worker允许；health/config必须确认databaseUrlConfigured=false、splitDatabaseConfigComplete=false、assessmentBackgroundExecution=false。不能在生产连接上开第二API做压力、导入或AI测试。需要真实负载时使用获批准的独立脱敏非生产DB，否则性能门槛BLOCKED。

实际资源验收需MemoryMax=256MiB、CPUQuota=50%、TasksMax=64，记录MemoryPeak、memory.events的oom/oom_kill前后差值为0、RSS趋势、重启次数及固定负载延迟，保留明确余量，不以一次空载health成功批准商业负载。失败仅隔离新staging路径及日志，不清理旧release/shared/cases；不扩大cgroup掩盖OOM。

**仅在未来用户批准精确候选SHA、READY／approved-release由受控运维写入且全部门槛满足后**，使用现有`sudo jiuchen-promote`（无参数；如command -v未找到先核对安装路径，不安装新helper）。本轮不填READY、不改approved-release、不执行该命令。

发布后检查三健康端点、原认证／课表／AI历史、旧/news、管理员统计与身份、只读写接口403、业务日志和OOM。现helper在服务restart失败或health失败时自动恢复原current；业务失败不由health替代，需人工审批恢复发布前实测active（预期8cc4bb85），重新设置该已存在release为approved与READY再调用同一promote。禁止手工ln覆盖current；数据库不做自动逆向DDL。回滚后只读能力失效，原账号不注销。

### B Profile单列

来源固定为cc918fd树中既有`upgrade-enrollment-year.ts`／`profile-schema-contract.ts`，本轮未修改。唯一DDL：`ALTER TABLE user_profiles ADD COLUMN enrollment_year INT NULL AFTER current_grade`。先准确生产结构和备份校验、隔离恢复／两次迁移／旧行比对；再单独批准执行该脚本，禁止db:push或全量迁移。回滚旧API时保留新增列，不自动DROP COLUMN；恢复生产备份需要另案审批与停写窗口。缺备份恢复证据，目前BLOCKED。

### C News V2

同一源码树既有`upgrade-news-v2.ts`／`news-v2-schema-contract.ts`，七表精确范围：news_display_states、news_favorites、news_retirement_batches、news_retirement_tasks、news_retirement_reads、news_task_audit、news_sync_runs。复用已有迁移，非生产不兼容表阻断／两次迁移／关系回归CI已PASS；仍需生产结构复刻、备份与隔离恢复、30＋72接口端到端，再单独批准DDL。仅七表，不扩展业务Schema。

Schema通过后先受控API默认NEWS_V2_ENABLED=false，再单独批准flag打开并验收藏隔离、取消收藏、退役保留、视频原链接及标签/隐藏不覆盖。Payment／AI开关保持现状。flag故障先恢复批准前值再回退API，保留七表及收藏数据，不DROP。未获得执行授权，不运行升级脚本／开关修改。

### Timer

现有jiuchen-news-sync.timer生产已运行，不能新建第二timer或按旧每小时文档重装。本批无需unit差异（差异清单为空）；30＋72由同一reconcile服务随现有同步执行。ECS治理用户已报告完成，资源限制实值与新代码下扫描／到期处理仍需回执。本轮不执行enable/start/restart/编辑timer。未来如果要改变unit或频率，先取现unit快照、精确diff、资源/配额证据和恢复快照方案，再单独请求批准。

### 微信体验版与人工验收

上传源码锁定a1541a1业务树（交接／诊断后继不改变业务）；项目本地配置保持用户原有状态，禁止夹带提交。先用开发者工具实际编译、分包大小和合法域名核对。当前API未提供新只读上下文，收藏V2亦未启用：完整体验发布BLOCKED；不能靠前端隐藏/假返回冒称已验。

准备体验版而非直接正式发布；用户批准具体前端SHA和后端依赖后才能上传。回滚为已验收前端版本，保存该版本号与源码SHA并核对其API兼容，不臆造旧微信版本号。后端回退时新版只读入口会明确失败，不能保留目标私密缓存。

## 未完成／阻塞与人工动作

| 项目 | 阻塞证据／解锁条件 | 不影响什么 |
| --- | --- | --- |
| 10月12日文章 | 用户提供真实原链接；本机40164，web不可读；等待白名单ECS只读源端／库回执，必要时准确标题 | 代码回执、分页负例、其他切片 |
| 独立视频发布 | 当前只确认图文中的video标记，缺官方独立视频样本及能力配置；需公开样本／原链接真机结果 | 图文正文及已有内嵌视频卡片 |
| 历史优势没单列 | 页面确读saved output.strengths；已补profileSummary、消除“没有优势”文案。生成缺项需真实input/output离线核验，Runtime另案 | 不改历史数据，现有报告／全部导出 |
| 已绑定测试命名 | 种子来源不证明绑定人仍是测试用户；人工分类，不能按昵称删除／隔离真实账号 | 未认领明确种子隔离、正常搜索 |
| 生产Schema与候选 | 无实时结构／备份恢复／隔离候选包及资源证据；各审批独立 | 集成代码／临时MySQL CI |
| 真机／真实Word | 没有本轮手机或Word执行回执，合成渲染不替代 | 类型检查、逻辑/导出编码回归 |

人工固定用例：学员、老师、管理员各四栏；管理员看已绑定学生／老师，教师仅分配学生，去掉target header的只读凭证POST/PUT仍403；我的客服下面退出回原工作台。正式名单真实学校／认领／分配／缺资料状态、搜索、种子隔离数量。首页新用户完善资料／首次评估，老用户AI入口，本周时间／地点及空地点。图文／视频原文、收藏／取消／重复点击／跨用户／退役后重开、29/30/31与72h边界。保存历史报告→复制→MD/Word/PDF/摘要/长图逐种打开，输入完整、JCC上下文、水印三字段、姓名缺失提示、中文／分页／无黑块／相册保存，超长明确失败不截断。

结论按层：**代码已提交／集成CI PASS／生产未发布本批／真机PENDING**；生产发布候选 **BLOCKED**，不标记RELEASE_A_READY_FOR_APPROVAL。不因等待回执重复修改冻结模块。
