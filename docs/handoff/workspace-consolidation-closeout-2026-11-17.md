# 九辰教育工作区收束与历史资产归档记录｜2026-11-17

> **历史本地快照：2026-11-17。** 远端代码分支后续已推进至 `01864846a2f0e000555abde27cf50001535491d5`，PR #16 OPEN。本文记录的本机归档、stash、worktree 清理状态没有新的现场回执；不要把“尚未执行”直接延续为今天事实，也不要推断为已完成。当前远端状态见 [2026-11-26 当前交接](STATUS-2026-11-26-api-release-preparation.md)。

**状态：审计结论已固化；本地归档与清理尚未执行。**

## 1. 当前代码基线

| 项目 | 状态 |
|---|---|
| 唯一施工工作区 | `C:\\Users\\yulia\\Desktop\\04_项目开发与代码\\jiuchen-edu-platform` |
| 施工分支 | `codex/ux-consolidation-20261116` |
| 本次审计时 GitHub HEAD | `4bea21d1ec91d058783be3cfc073922c7b9bbd97` |
| 同步前本地 HEAD | `1b2a33f0aeeb804b300c9d4e4c7149e8175b2fb7` |
| OLD 工作区 | `C:\\Users\\yulia\\Desktop\\04_项目开发与代码\\jiuchen-edu-platform-main` |
| OLD 分支 | `codex/ux-batch-a-20261106` |

原始资产审计 ZIP 在本地采集时 HEAD 为 `1b2a33f`，早于 7 个文档同步提交；该 7 个提交只更新交接文档，未改变小程序/API 业务代码。后续操作以远端当前实际 HEAD 为准，执行前重新 fetch。

## 2. 六个 OLD/NEW 差异文件的最终裁决

对比补丁：`jiuchen-old-vs-new-six-files.patch`  
SHA-256：`80da02c8ee00068456eff39a74f08a9fb82f9b52ce66b1b761ee580fc1873372`

| 文件 | 差异主题 | 处置 |
|---|---|---|
| `assessment-form.ts` | 院校选择器、全局研究方向/备注、旧草稿兼容、次数不足提示 | KEEP NEW |
| `assessment-form.wxml` | 目标院校选择交互及表单结构 | KEEP NEW |
| `assessment-form.wxss` | 院校选择器样式 | KEEP NEW |
| `classroom.wxml` | 学期信息布局、课程地点展示 | KEEP NEW |
| `classroom.wxss` | 学期卡片布局 | KEEP NEW |
| `miniprogram-navigation.test.cjs` | 规划/课表结构与地点断言增强 | KEEP NEW |

**结论：6/6 文件保留 NEW；OLD 无文件需要反向合并。** 本结论是静态代码差异审查，不替代微信开发者工具、真机或业务验收。

### 真机重点

1. 旧评估草稿恢复后，确认全局研究方向可正确回填；缺失时可补填后提交。
2. 目标院校最多选择 5 所，支持搜索、手动添加、去重和删除。
3. 全局研究方向为必填；全局备注为选填。
4. 每所目标院校的独立项目名称编辑 UI 已简化。当前数据结构仍保留项目名称，旧草稿恢复逻辑保留旧值；如产品仍要求逐校编辑项目名称，需另立需求，不在本轮擅自恢复。

## 3. 四个非祖先历史分支

原始审计采集到的独有提交：

| 分支 | 独有提交 | 当前裁决 | 备注 |
|---|---:|---|---|
| `codex/commercial-closed-loop-v2` | 6 | 不合并；功能级对照显示 NEW 已有对应实现 | 保留原始分支补丁 |
| `codex/device-acceptance` | 3 | ARCHIVE | 隔离真机验收工具尚未进入 NEW |
| `codex/ux-batch-a-checkpoint-20261106` | 1 | 不合并；七天课表导航已进入 NEW | 保留原始分支补丁 |
| `p1/release-api-core-closeout-20261007` | 3 | 不合并；对应 API 核心能力已在 NEW 找到 | 保留原始分支补丁 |

审计包含四个分支的 patch 文件。仓库历史中已有若干 archive tags，但不能据此推定所有 tag 都精确指向本次审计的分支 tip。**本地分支不得删除，直至逐一确认 archive tag/远端 tag 指向正确 tip，或创建新的精确归档 tag 并验证推送。**

## 4. 五个 Stash

| Stash | SHA | 处置 |
|---|---|---|
| stash@{0} | `4551a405efe3cc67b18827cfdcfdd5f679952522` | KEEP；单文件夹整合前完整快照，含 32 个文件 |
| stash@{1} | `391b1dc1f2b2e73ad659fc10480ed2699050fc62` | 功能已由 NEW 吸收；先 ARCHIVE，暂不 drop |
| stash@{2} | `e8b712edd6b9391b003acd98b35e02353fb278bc` | 截止日期及 UI/API 相关功能已在 NEW 找到；先 ARCHIVE，暂不 drop |
| stash@{3} | `57c92aa9cb55c8c3b3044b124b750b2930001b9e` | ARCHIVE；早期 UI/发布工具快照 |
| stash@{4} | `3fc24bad53fb2c28c1af19c87f512309005540ff` | ARCHIVE；含 657 行院校数据备份 `data.ts.bak` |

五个 stash 共 94 条文件记录。上述“功能已吸收”不等于允许删除 stash；须先完成外部审计包归档、确认补丁可读，再进行 drop。

## 5. 32 个未跟踪资产

审计清单：`untracked-files.csv`。其中 28 个文本/清单资产进入 ZIP，4 个二进制/大文件未打包，只记录大小和 SHA-256。

| 类别 | 数量 | 处置 |
|---|---:|---|
| `.release-staging/` 发布材料 | 6 | KEEP；先核对 7 个历史 API tar.gz 的物理存在性及 SHA-256 |
| UI/UX 历史验收文档 | 2 | ARCHIVE |
| `ops/ecs/` 固定版本发布/预检脚本 | 13 | ARCHIVE；禁止当作当前通用发布脚本直接执行 |
| `tools/maintenance/` 历史演练/维护工具 | 8 | ARCHIVE；按固定 SHA 和旧流程使用，不自动恢复到活动工具目录 |
| `tools/testing/` 历史测试工具 | 2 | ARCHIVE |
| `apps/miniprogram/测试.png` | 1 | ARCHIVE；图像内容尚未复核 |

`apps/miniprogram/project.config.json` 有独立本地修改。同步时哈希未变化；继续保留为本机配置，不纳入业务代码提交，除非后续单独审查并批准。

## 6. Worktree 处置

原始审计登记 8 条记录，其中两条路径是同一 OLD 工作区的斜杠写法差异；6 个实际存在目录、2 个目录不存在。

| Worktree | 审计时状态 | 本轮处置 |
|---|---|---|
| 主 NEW 工作区 | 当前施工分支 | KEEP |
| OLD 工作区 | 16 个 tracked 修改及测试图片 | KEEP；最终回归前不删除 |
| `p1-isolated-api` | clean，旧分支 | 候选清理；先核对分支/归档 tag |
| `product-closeout-build` | clean，旧分支 | 候选清理；先核对分支/归档 tag |
| `release-a` | clean，旧分支 | 候选清理；先核对分支/归档 tag |
| `ux-batch-a` | detached HEAD | KEEP，先核对 HEAD 与资产 |
| `jiuchen-edu-client-gate` | 目录不存在 | 可在最终确认后 prune 失效登记 |
| `jiuchen-edu-device-acceptance` | 目录不存在 | 可在最终确认后 prune 失效登记 |

**当前没有移除任何 worktree、分支或 stash。** 不得仅凭旧审计状态执行清理；执行前重新检查实时 status、HEAD、路径和引用关系。

## 7. 七份历史 API 归档：待现场核验

审计包的 `release-archives.json` 仅保存了路径、大小、SHA-256 和 tar 成员名；ZIP 没有包含七份 tar.gz 的文件字节。因此本次只能提供预期值，不能宣称文件仍存在或哈希匹配。

| 文件 | 预期大小 | 预期 SHA-256 |
|---|---:|---|
| `jiuchen-api-0b339a4f86f248f1de3df8ee957f5bdda2254fda.tar.gz` | 379212 | `57F8CEAE215E963A5DB7BA21C6E090197D4E94443F5081210AF77C11AFCFDDA0` |
| `jiuchen-api-1054c2ad3d6f46fb40af15f0d5368238bdab54a3.tar.gz` | 362458 | `5948CDC90E54D5F36B7D21CC3A1CD0B505E998C35B08CBEF24A64E8DDA5A04D9` |
| `jiuchen-api-2a551b092c6e7df96da7d53498144344dc391cdc.tar.gz` | 333624 | `3693418F0A5E2FCD2DEF6A917D4C34CC7CD7B72D640A7BE3FC54A15983FEC462` |
| `jiuchen-api-36aea4bab3e9bc1aa1c46403cc05e3b2208df1d4.tar.gz` | 388601 | `AA4E831C7E229E1CCFE617B7B1A3DA5491B27EEC1E8A2C0DDFC726E1F8AC5117` |
| `jiuchen-api-985be8c75e2e1254761ab7c914975f5dac77cf83.tar.gz` | 365415 | `A4A97A2A9421C79F2793844C2B35F44C81BC7CCD9EFB9E735C87C6AE1B56E685` |
| `jiuchen-api-ba42b663a38ebcd638f777e7884b893405b31a3e.tar.gz` | 367013 | `6EAF1AE71466A11E4101D587226BC6E293C3E7CA1549A12C97D732B4BE419E23` |
| `jiuchen-api-c76afc28068987d5ebea6f96fb6e2e0d170ef3fe.tar.gz` | 365148 | `BA820CF066359D664378E1E898799CCDA61AF36D0A594B8B36F839D930660D66` |

这七份文件必须逐一核对。任一缺失或 SHA 不匹配，都应停止对对应发布归档及暂存目录的清理。

## 8. 外部审计资产指纹

以下文件已上传至本轮 ChatGPT 会话，两个重复上传件经 SHA-256 确认为字节相同：

| 文件 | SHA-256 |
|---|---|
| `jiuchen-consolidation-audit-20261117-103549.zip` | `07209dd63b146b120c20ddb03932c7d40986b43ee6f0d75e07e497ae4813d1d5` |
| `jiuchen-workspace-timestamp-audit-20261117.json` | `e1da241d362c8a8ccbe21adfa7a424ede3444f57712bd06a95b6a1726f5fd446` |
| `jiuchen-old-vs-new-six-files.patch` | `80da02c8ee00068456eff39a74f08a9fb82f9b52ce66b1b761ee580fc1873372` |

这些文件目前是会话附件和外部审计证据，不是 GitHub 仓库内的持久归档。须在管理员本地仓库父目录建立独立只读归档目录，复制上述三件文件并再次核对 SHA-256；保留原始 ZIP、时间戳 JSON、六文件 patch 和两份已有 sibling backup。不要把用户数据库、私有案例、凭据、ECS secrets 或明文业务数据上传到 GitHub。

## 9. 备份与事故约束

- 遵守《自主手动备份与选择性恢复规范》：管理员 WSL 本地加密备份、组件选择、三代保留；GitHub 代码历史不替代数据库、ECS secrets、证书及未跟踪运维资产备份。
- 不把本地历史 API tar.gz 与自主加密备份混为一谈。
- 任何恢复生产数据库、ECS 切流、共享入口配置或正式发布操作，均需独立范围与批准。
- 遵守 Batch 9 事故约束：SCP/SFTP 二进制传输、SHA-256、Bash 语法和退出码分开验收；不能把本地模拟或脚本静态检查写成真实 ECS PASS。
- 权限验证必须使用实际服务账户读取完整运行文件，不以 root 所有权或单文件检查代替。

## 10. 当前执行状态与下一步

| 操作 | 状态 |
|---|---|
| NEW/OLD 48 路径和哈希比较 | 已完成（审计采集时） |
| 六个差异文件代码 Diff | 已完成；全部保留 NEW |
| 四个历史分支 patch 审查 | 已完成分类；不合并 |
| 五个 stash 分类 | 已完成初步分类；未 drop |
| 32 个未跟踪文件分类 | 已完成；未移动/删除 |
| 外部审计包归档 | 待管理员本机执行并复核哈希 |
| 七份 API tar.gz 物理存在及 SHA-256 | 待管理员本机执行 |
| Worktree/分支/stash 清理 | 暂停，等待归档和实时复核 |
| 小程序最终回归、微信真机、发布 | 未开始本轮最终验收 |

### 本地下一步

1. 将审计 ZIP、时间戳 JSON、六文件 patch 复制到仓库外的独立归档目录，校验本文件第 8 节 SHA-256。
2. 对第 7 节七份 API tar.gz 执行只读存在性、大小和 SHA-256 检查。
3. 把完整终端回执交给工程负责人。若七份全部匹配，再制定分批清理脚本；先清理已确认干净的辅助 worktree，再处理引用和 stash。
4. OLD 工作区继续保留至最终回归完成。NEW 仍是唯一施工基准。

**本文件只记录审计与处置，不代表已完成本地归档、清理、PR 合并、ECS 部署或微信发布。**

## 11. GitHub 文档固化提交核验

以 `4bea21d1ec91d058783be3cfc073922c7b9bbd97` 为基线，本轮新增/更新 4 个文档提交，当前施工分支 HEAD 为 `c74e9e394986fc7380b7a42c1bee5a08ca8de9e3`。GitHub compare 返回 `ahead_by=4`、`behind_by=0`，文件变更仅限：

- `docs/handoff/workspace-consolidation-closeout-2026-11-17.md`（新增）；
- `docs/handoff/README.md`（导航更新）；
- `docs/handoff/CURRENT.md`（当前入口更新）；
- `docs/handoff/workspace-consolidation-audit-2026-11-17.md`（补充六文件 Diff 结论）。

**本轮没有修改应用代码、API 代码、数据库迁移、CI 工作流或生产配置。** `main` 仍为 `d179ea8db76b2796f0bb9c929ec2c467fa45c87a`，本轮没有创建 PR、合并 main、部署 ECS 或上传微信版本。
