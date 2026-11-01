# 九辰教育当前交接｜2026-11-01（GitHub 台面收尾）

> 本页是截至 2026-11-01 的最新状态快照；之前 docs/handoff/CURRENT.md 中的 2026-10-29 与更早记录仅作历史参考。任何新部署须独立授权、核对现场。

## 一、对协作开发者最重要的状态

- 仓库：`orange-lee-tech/jiuchen-edu-platform`；**唯一日常开发基线是默认分支 `main`**。
- **正式生产 API 精确源码**：`03bc43b7ebe648b310a2499a1d77fba86e5e6623`。2026-11-01 用户现场回执：`BATCH10_API_SWITCH=PASS`，原 `36aea4b...` 已变为 previous；健康、数据库及此前 404 的四项路由认证门禁均 PASS。切流重启期间曾出现三次连接拒绝，最终 `PROMOTE_OK`；不据此认定持续故障。
- GitHub `main` 现在/未来可能包含**仅文档**的后续提交，因此 **main HEAD 不必与生产 API commit 完全相等**。区分源代码应用版本、文档提交和实际微信预览版本。
- 生产数据库 2026-11-01 已执行七项获批迁移，47 → 55 表；每项验证和关键业务行数/订单金额/次数账本汇总均 PASS。禁止盲目重跑 DDL。
- 2026-10-31 数据库加密备份与隔离恢复：`/home/orangelee-tech/jiuchen-backups/20261031-150653-db-only-ba13b078`，47 表 SQL 导入 PASS；七项迁移双轮及三项合成业务测试 PASS。备份目录在管理员 WSL，不在 ECS；备份文件与密码不得上传 Git。
- WSL 固定源码构建 249 个 `dist` 文件 PASS，ECS staging 无数据库 smoke PASS，正式 release root 权限及 `jiuchen-api` 服务用户访问 PASS。新版 API 已发布。
- 微信开发者工具预览编译问题后续已进入真实小程序界面；截至本页仍为**真机业务验收进行中**，不能因 API 发布成功就写“所有 AI 业务已通过”。
- 本地工作树 `C:\Users\yulia\Desktop\jiuchen-edu-platform-main` 存在尚未纳入上述 SHA 的资讯标签移除修改；另有原项目工作树和 stash。**禁止在台面整理时覆盖、reset、clean 或强推这些本地资产**。

## 二、AI 与安全审查：新旧证据必须分开

- 用户周二反馈的旧评估超时（2026-10-28）不能直接算作 11 月 1 日新版 AI 失败。
- **新版真实复现（2026-11-01）**：用户真机新评估失败，ECS 针对性只读诊断定位 10:23:12 模型初次调用开始，10:24:13 失败；来源 `admin_vault`，`provider=deepseek`，`model=deepseek-v4-pro`，`failureStage=model_request`，`errorCategory=timeout`，`elapsedMs=61059`，`modelRequestCount=1`，`repairRequestCount=0`，`reportPersisted=false`，`creditSettlement=release_committed`。仅证明该调用 60 秒内未完成，**不能单凭此判断是模型供应商故障、端点网络故障还是完整报告生成时间过长**。未授权调大超时、切换供应商或重发评估，先使用管理员对象既有格式连接测试并保留脱敏结果，必要时核对服务商计费日志。
- ECS 日志只读检查 2026-10-27 20:33:54：仅一条材料导入失败，`assessment_import_invalid_payload`，具体校验 `warnings.2 too_big`。旧版/新版对应的 `assessment-import.ts` 核心结构化文件内容相同，因此存在潜在规则不一致（AI JSON Schema 未限制 warnings 长度、Zod 每条最多 300 字），但**没有证据证明新版本已复现该失败**。禁止据此直接修改线上 AI 或盲目启动热修复；用匿名、极小测试材料和新版本真实接口做一次受控回归再决定。
- `assessment-imports` 临时材料由前端上传至 CloudBase，后端 `import-profile` 在进入解析 try 块后 `finally` 调用删除；上传成功后请求未进入解析路由、前置身份校验失败或清理失败等情形仍可能遗留。腾讯云控制台生命周期与访问规则需要单独核验，不得推定已配置。
- 当前源码协议页面展示 `2026-10-06`，前后端登录仍使用 `placeholder-v0`；这是**已证实的跨端版本一致性问题**，以后必须作为独立兼容性变更处理；不得只改客户端造成登录 400，也不得伪造旧协议同意记录。
- 资讯 rich-text 图片允许任意 HTTPS 来源但无主机白名单，属于较低优先级的来源边界改进；应结合服务号信任模型决定规则，避免误伤既有正常图片。
- wxss 选择器及 `wx.getSystemInfoSync` 弃用告警主要是前端维护项，不等同于业务接口错误。

## 三、文档及工作分支治理

- `docs/ops/manual-backup-and-selective-restore.md`、`docs/ops/miniprogram-backend-engineering-map.md` 来自 PR #12，已经在 2026-11-01 以 docs-only squash 合入 `main`；具体架构值为历史快照，不作为操作前的实时证据。
- **2026-11-01 GitHub 台面治理已完成**：五条有独有历史的旧分支已归档为 `archive/2026-11-01/...` 固定标签；第六条旧 UI 分支独有提交数为零，无需标签；六条旧远端分支均经精确 SHA lease 剪除。事后通过 GitHub 连接器验证：远端分支**仅 `main` 一条**、归档标签**五条**、开放 PR **零条**。`main` 在治理前的 SHA 为 `996b38ec6ff5e5a83a6af280f9cee9496cbf331c`；本页后续文档提交会使其前进。全程未强推 main、未修改 Windows 工作树或 stash。
- PR #13 `docs/product-workstream-20261030` 已关闭、**没有合并旧的 CURRENT/AGENTS 信息**。旧产品简报及 HEAD 可通过归档标签 `archive/2026-11-01/docs/product-workstream-20261030` 阅读；必要时由协作者按当前 `main` 重新核实需求后另开 PR。
- 日常共同开发者：从 `main` 拉新分支工作，PR 回 `main`；生产发布先固定候选应用 commit 再验收，不把 README 等文档变更误当成一次 API 发布。
- 本页是工作收尾记录，不构成数据库、ECS、支付、微信发布或 AI 服务商配置的任何新增授权。

## 四、下一项施工

1. GitHub 分支与 PR 台面治理**已收口**；共同开发者日常统一从 `main` 起步，不必重新清理。
2. **高优先级：新版真实 AI 评估 60 秒超时**。先用管理员现有对象连接/格式测试评估 `deepseek-v4-pro` 的最小合成输出（会有少量模型成本），记录 `reachable`、`reportSchemaValid`、`errorCategory`、`providerHttpStatus` 及耗时；对照真实评估调用大小与供应商日志，再决定是否以单独 PR 优化模型参数/总耗时/生成策略。不能因简单探针 PASS 就认定完整报告 PASS。
3. 旧版的 `warnings.2 too_big` 是**不同材料导入链路**；仅用当前版本匿名材料真机复验决定是否修正。
4. 账号协议版本前后端一致性作为明确待修项，单独小 PR + 兼容测试；生产 AI/支付/数据库的任何变更继续独立授权。
