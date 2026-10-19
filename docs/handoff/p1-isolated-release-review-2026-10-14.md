# P1 隔离发布候选／精确审批与恢复

## 固定交付

- 实测生产源：`8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`；现previous：`b150d2c5c8720aac8d48fbd0395d8db9c408bc63`（用户本轮ECS回执）。
- 集成来源：`35f61d767a364e1fdca641305ff6936392abbc39`。
- 隔离候选：`eda525c1a2276af90668849b669e9bce19a4fd7d`；分支`codex/p1-isolated-api-2026-10-14`；[Draft PR #3](https://github.com/orange-lee-tech/jiuchen-edu-platform/pull/3)，base为现生产源码分支，不是main/p1。只供审查，未合并。
- 交付归档：`tmp/p1-isolated-api-2026-10-14/jiuchen-api-eda525c1a2276af90668849b669e9bce19a4fd7d-readonly.tar.gz`；304088 bytes。
- SHA256：`18e6cb2ee5228f27e433623b3ad0da0647ff94efd84225d088350a0d640fb25c`。只采用此权限规范版；旧未带readonly后缀归档保留作本机历史，不用于交付。Git tar.umask固定0022且逐项验证无group/world write，符合不可变release权限前提。
- [精确38项差异与162项归档清单](p1-isolated-api-manifest-2026-10-14.json)。仅services/api运行源码，另2项public学校数据/生成器供既有全量测试；不是小程序发布包。无dist/node_modules、真实.env、私有案例、微信配置/密钥。

**REVIEW_ARTIFACT_READY / PRODUCTION_APPROVAL_BLOCKED / DEVICE_PENDING**。已有真实候选与归档，不再沿用旧“候选未生成”；仍不标READY_FOR_PROMOTE。

## 隔离方式与实测

从8cc4新建独立工作树，明确移植34个API文件，保留生产原有2项权限测试；增加2项兼容负例；只改院校检查器CRLF比较，不改院校数据。既有MySQL Gate恢复步骤作为审查文件，不进API运行归档。没有整树覆盖集成分支。

本机Node24.18：锁定npm ci安装188包；typecheck/build PASS；完整 **215/215 PASS**（211已有集成回归＋2保留生产权限＋2新增兼容）。首次全量214/215失败为新工作树CRLF与生成器字节比较，修复后全量重跑。旧/news、管理员资讯/身份在V2=false不读取七表或enrollment_year；支付三表均不存在时仍统计9条合成成功，充值/账本/预留不可用不是0。Profile原接口缺列仍是单独B依赖，不冒称全角色界面无Schema依赖。

清空凭据、无.env、无数据库、随机loopback端口30次health：功能NO_DB_SMOKE_PASS，backgroundExecution=false；没有实际AI worker/生产写操作。heap160MiB不等于RSS256MiB。候选采样RSS274485248 bytes/峰值maxRSS273196KiB；旧生产同环境RSS290463744/maxRSS293232KiB。两者都超过256MiB；这是Windows/Node24观察，**资源验收BLOCKED**，不推断ECS Node22一定通过或一定OOM，不放宽限额、不改模型/基础架构掩盖问题。

小程序本轮未改页面，typecheck PASS、95/95复验PASS。两项恢复脚本embedded Node语法2/2通过；没有MySQL实跑或生产结构复刻。

本固定候选CI run38587466729、News38587466435、Profile38587465970均failure，三个job steps=null/logs_url=null。账号计费拦截未解；见[原始证据](p1-final-ci-and-source-evidence-2026-10-14.md)。不能用旧绿色HEAD代替本候选。

## 独立变更审批包

| 包 | 精确变更 | Schema／开关 | 回退 |
| --- | --- | --- | --- |
| API core | session只读能力与global写入guard、真实身份名单、统计读投影、资讯分页/回执、旧news兼容 | 无新增表才能先关V2构建/验证；原Profile/课堂/成长实际Schema须读证据 | 恢复发布前8cc4；原session不注销、RO能力失效重新进入 |
| AI quality（单独确认） | manifest中的domain/assessment.ts、assessment-runtime.ts及2项相关测试（包括app metadata断言）；v3门槛使用既有一次修复预算 | 保持生产qwen3.8-flash及RAG/供应商配置；明确成果仍空优势则失败，不重写历史；可能有一次额外模型调用 | 回8cc4/v2；不改历史成功/收费/账本 |
| Profile B | candidate内profile-schema-contract/upgrade-enrollment-year/check-profile-foundation | 唯一DDL `ALTER TABLE user_profiles ADD COLUMN enrollment_year INT NULL AFTER current_grade`；兼容检查和备份恢复后单独批准 | 回退API、保留列及数据；不自动DROP列／恢复生产备份 |
| News V2 C | candidate内upgrade-news-v2/news-v2-schema-contract及runtime store/routes；30＋72、收藏、退役任务、受控补录 | 七表：news_display_states、news_favorites、news_retirement_batches、news_retirement_tasks、news_retirement_reads、news_task_audit、news_sync_runs；NEWS_V2_ENABLED默认关闭 | 先关flag再回API，保留七表/收藏；不DROP |
| timer | **unit diff为空**，复用现役同步脚本/current入口；源码sync脚本改为既有统一服务 | 不重装，不改频率；新V2需同flag/Schema，不开第二timer | API/flag回退；unit未改无需恢复，不擅停已运行timer |
| 微信 | 前端源码35f61d7；本地用户project.config保留；原四栏／全部导出 | API/context、Profile列、V2七表/flag须先到位；真实视频能力待样本 | 回到用户实际已验收微信版本，版本号先记录不臆造 |

生产DDL脚本从候选固定树取出，不从后来移动的branch HEAD取；不要db:push、全量迁移、修改支付表。临时CI恢复测试不替代生产备份/隔离恢复；本机无非生产MySQL，不能向生产运行这些演练。

**eda525c1中的AI质量v3没有独立运行开关**：若用户只批准core而不批准该质量变更，不得部署本归档；需从8cc4另制core-only后继SHA并重新验证／归档，不能手工拎文件混包。News V2默认关闭可以独立延期，但完整前端验收仍受B/C依赖阻断。

## 本轮唯一最小人工回执（只读，无生产批准）

1. GitHub账号账单管理员在Settings→Billing & plans恢复付款/Actions可用额度；随后本固定候选CI和两个Gate各重跑一次，不能只重跑main或任意新HEAD。
2. 将本轮三个诊断文件独立复制到`/opt/jiuchen-api/staging/diagnostics/`（不是current），执行：

```bash
bash -n /opt/jiuchen-api/staging/diagnostics/p1-production-preflight-read-only.sh
bash /opt/jiuchen-api/staging/diagnostics/p1-production-preflight-read-only.sh
cd /opt/jiuchen-api/current/services/api
node --env-file=/etc/jiuchen-api/production.env /opt/jiuchen-api/staging/diagnostics/p1-schema-read-only.mjs
NEWS_AUDIT_DATE='2026-10-12' \
NEWS_AUDIT_TITLE='中南大学保研看什么？成绩、综测与学院细则' \
node --env-file=/etc/jiuchen-api/production.env /opt/jiuchen-api/staging/diagnostics/news-source-fields-read-only.mjs
```

同一source命令可加另一近期已发表准确标题`NEWS_AUDIT_SECOND_TITLE`。不重抓已经对照的40/41；素材／分析字段不自动当发表原文。不输出environment/秘密/学生行。

当前`127.0.0.1:3100`拒绝连接，preflight只找该API MainPID实际监听；找不到唯一监听则停止并回报，不调整网站/NPM/端口。收DDL后才能安排脱敏结构复刻、非生产双次迁移及恢复；未取得数据前不编造“生产结构复刻PASS”。

## 后续可执行部署／恢复命令——本轮禁止执行

以下仅用于精确审批，健康、CI、结构/恢复、资源关口未通过前不上传current、不填READY、不改approved-release。

### 受控staging（需要用户进行ECS操作，非切流）

上传归档到专属incoming路径，先核对以下摘要及162项manifest；检查tar内无绝对/..路径、链接、设备、实际.env与私有案例，再新建候选目录。禁止解压覆盖旧release/current或在生产archive加入共享case/env。

```bash
sha256sum /opt/jiuchen-api/staging/incoming/jiuchen-api-eda525c1a2276af90668849b669e9bce19a4fd7d-readonly.tar.gz
tar -tzf /opt/jiuchen-api/staging/incoming/jiuchen-api-eda525c1a2276af90668849b669e9bce19a4fd7d-readonly.tar.gz
```

归档本机已按Git mode和tar header校验：无链接/特殊项、文件集合与固定SHA完全相等；不凭文件名校验替代SHA。本机复现归档命令：`node tools/release/package-isolated-api.mjs <干净候选工作树> eda525c1a2276af90668849b669e9bce19a4fd7d <输出目录>`。

ECS构建仅新staging目录；Node22.23.3、锁定npm ci、typecheck/build/tests，独立构建cgroup预算须按实测余量确认，单npm任务，禁止拖累生产/Harbor。运行以jiuchen-api用户校验新目录遍历、dist可读、依赖可加载、共享案例只读权限，不复制私有文件。构建失败隔离该新目录和日志，不清理其他release。

```bash
sudo -u jiuchen-api test -r /opt/jiuchen-api/releases/eda525c1a2276af90668849b669e9bce19a4fd7d/services/api/dist/server.js
sudo -u jiuchen-api node --check /opt/jiuchen-api/releases/eda525c1a2276af90668849b669e9bce19a4fd7d/services/api/dist/server.js
sudo -u jiuchen-api test -r /opt/jiuchen-api/shared/cases/ai/rag/v1.0.0/rag_reference_production_all.jsonl
```

不能以第二个连接生产DB的API做资源测试。先无凭据/无DB独立端口（worker空实现）、health配置确认backgroundExecution=false；有真实负载需求必须独立脱敏DB。256MiB硬限、50%CPU、64tasks保持，记录MemoryPeak、memory.events oom/oom_kill前后差值0、RSS余量/趋势、重启次数与延迟；空载/Windows结果不足以批准生产负载。若无法测，保持BLOCKED。

### 仅各审批全部通过后

Profile B与News C分开批准、备份/恢复已验后才执行候选既有单列／七表脚本。先NEWS_V2_ENABLED=false、Payment开关及AI模型配置不变；质量v3须独立确认。随后root受控批准版本文件和READY须同一40位SHA，不手工改current。

```bash
# 只有分别批准Profile单列／News七表且备份恢复关口通过后，才由运维执行所批准那一条：
cd /opt/jiuchen-api/releases/eda525c1a2276af90668849b669e9bce19a4fd7d/services/api
node --env-file=/etc/jiuchen-api/production.env dist/db/upgrade-enrollment-year.js
node --env-file=/etc/jiuchen-api/production.env dist/db/upgrade-news-v2.js
```

这两行不是同批自动执行清单；未批准的行不运行。不得用npm脚本缺env为由复制生产.env到release。开关修改由运维保留原值后单独批准，模型保持qwen3.8-flash。

```bash
# 仅在用户批准此SHA且全部关口通过后由受控运维执行：
printf '%s\n' eda525c1a2276af90668849b669e9bce19a4fd7d | sudo tee /etc/jiuchen-api/approved-release >/dev/null
printf '%s\n' eda525c1a2276af90668849b669e9bce19a4fd7d | sudo tee /opt/jiuchen-api/staging/READY >/dev/null
sudo chown root:root /etc/jiuchen-api/approved-release /opt/jiuchen-api/staging/READY
sudo chmod 0600 /etc/jiuchen-api/approved-release /opt/jiuchen-api/staging/READY
sudo jiuchen-promote
```

发布后按实际已证实监听核对health/live、health、公开HTTPS、课表/AI历史/身份/资讯及资源。helper健康失败自动恢复发布前current；**业务回归、OOM或异常计费仍需人工判失败**。本候选未来切流失败时优先回到发布前8cc4，不是直接越级b150：

```bash
# 仅用户批准回滚后；先由受控运维恢复NEWS_V2_ENABLED批准前值（false），保留Schema：
printf '%s\n' 8cc4bb85ffdf3e86e7a13a89d119f1b110491e48 | sudo tee /etc/jiuchen-api/approved-release >/dev/null
printf '%s\n' 8cc4bb85ffdf3e86e7a13a89d119f1b110491e48 | sudo tee /opt/jiuchen-api/staging/READY >/dev/null
sudo chown root:root /etc/jiuchen-api/approved-release /opt/jiuchen-api/staging/READY
sudo chmod 0600 /etc/jiuchen-api/approved-release /opt/jiuchen-api/staging/READY
sudo jiuchen-promote
```

沿用现helper的所有owner/mode/service-user检查；READY权限由受控运维验证，不给普通用户写权。无需ln/reset，也不自动DROP表/列、不停改timer。任何生产备份恢复另案审批。微信上传在依赖到位后按[统一真机清单](p1-unified-device-acceptance-2026-10-14.md)，测试结果由用户回填。
