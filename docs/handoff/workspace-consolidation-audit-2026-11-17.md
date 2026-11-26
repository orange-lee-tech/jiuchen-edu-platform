# 九辰教育小程序｜本地工作区整合审计

> **历史本地快照：2026-11-17。** 本文件记录当日 NEW/OLD 工作区、stash、worktree 和本机路径事实。GitHub 当前远端分支 HEAD 已推进至 `73ab8e2f2bf72259c0be8eb0549dd0bf9a17facd`（文档更新提交；应用代码候选仍为 `01864846a2f0e000555abde27cf50001535491d5`），PR #16 OPEN；本机资产归档/清理是否完成无法由 GitHub 证明。当前远端与发布状态见 [2026-11-26 当前交接](STATUS-2026-11-26-api-release-preparation.md)。

**审计日期：** 2026-11-17  
**仓库：** `orange-lee-tech/jiuchen-edu-platform`  
**唯一目标工作区：** `C:\Users\yulia\Desktop\04_项目开发与代码\jiuchen-edu-platform`  
**旧对比工作区：** `C:\Users\yulia\Desktop\04_项目开发与代码\jiuchen-edu-platform-main`

> 本文件记录本轮已取得的本地证据与整合决策。它不是生产发布批准，也不是删除旧目录、分支、stash 或 worktree 的授权。未核实资产一律保留。
>
> **基准规则（用户 2026-11-17 明确）：NEW 是唯一默认基准。OLD 仅用于历史追溯和差异举证。不得主动融合、优化、重构或覆盖 NEW；任何代码/业务冲突逐项报告，由用户决断后再施工。**

## 1. 当前 Git 基线

| 项目 | 证据 / 状态 |
|---|---|
| 当前分支 | `codex/ux-consolidation-20261116` |
| 本地 HEAD | `1b2a33f0aeeb804b300c9d4e4c7149e8175b2fb7` |
| 提交 | `feat(miniprogram): integrate assessment, sharing and timetable UX` |
| 提交范围 | 15 files changed, 259 insertions(+), 71 deletions(-) |
| 推送 | 已推送至 `origin/codex/ux-consolidation-20261116` |
| 远端核对 | GitHub 当前分支相对本机最后回执 `1b2a33f0...` 仅前进；后续提交均为 `docs/handoff/*` 文档更新，应用代码未变。本机需要先核对远端 ref，再执行 fast-forward；精确 SHA 以同步时 GitHub 实际分支指针为准。 |
| 提交时检查 | 暂存文件 15 个；无未解决冲突；`git diff --cached --check` 无输出 |
| 最近代码检查 | 用户此前回执：小程序 typecheck 通过；导航测试 122/122 通过；相关定向测试通过。以上是本地代码证据，不替代微信开发者工具和真机验收。 |

本轮提交没有包含 `apps/miniprogram/project.config.json` 的本地修改，也没有纳入未跟踪文件。提交后根工作区仍有：

- `apps/miniprogram/project.config.json`：modified；
- 32 个未跟踪文件，包含发布暂存材料、诊断预览图、UI/UX 验收矩阵、ECS 发布/预检脚本、维护演练脚本及测试文件。

这些资产未审计完毕前不得清理、覆盖或批量加入提交。

## 2. 新旧工作区文件比较

旧工作区相对其 HEAD 的变更文件与新工作区逐项比较，共 17 项：

- **11 项 SHA-256 完全一致**；
- **6 项内容不同**；
- 图片 `apps/miniprogram/测试.png` 两边哈希一致；
- `project.config.json` 两边哈希一致；
- 六项内容差异见下一节。

结论：新工作区并非对旧工作区的完全替代。整合策略必须是按业务语义择优组合，禁止整目录覆盖或机械复制。

## 3. 六项差异审计：默认保留 NEW，不执行融合

用户已明确修正整合策略：

- **NEW（`codex/ux-consolidation-20261116`）是唯一默认基准。**
- OLD（`codex/ux-batch-a-20261106`）仅作为历史工作区和差异证据。
- 不因 OLD 的某项实现看起来更丰富、文件时间更晚或代码行数更多，就把它合入 NEW。
- 不主动改动 NEW，不做“有机融合”、重构、优化或兼容性改写。
- 若发现冲突或疑似遗漏，先报告具体文件、行为差异、影响和证据；由用户逐项决策。
- 用户未批准前，所有差异文件保持 NEW 原样。

### 3.1 Assessment Form：三文件差异，仅登记，不融合

涉及：

- `apps/miniprogram/miniprogram/pages/assessment-form/assessment-form.ts`
- `apps/miniprogram/miniprogram/pages/assessment-form/assessment-form.wxml`
- `apps/miniprogram/miniprogram/pages/assessment-form/assessment-form.wxss`

**NEW 当前实现（默认保留）：**

- 院校搜索、选择器及手动添加；
- 研究方向和其他说明使用当前全局字段；
- 对历史草稿中的空院校项及部分填写内容有专门兼容判断；
- 次数不足时提示用户前往「我的」购买次数。

**OLD 历史实现（只作差异记录）：**

- 每个目标院校分别填写研究方向和说明；
- 页面加入 `credit-wallet` 组件；
- 次数不足时可直接打开钱包购买面板；
- 采用不同的空目标院校和草稿处理方式。

**当前决策：** 三个文件均保持 NEW，不把 OLD 的逐院校字段、钱包组件或其他行为迁入 NEW。若用户后续认为某项 OLD 行为有必要恢复，再单独提交决策报告。

### 3.2 Classroom WXML

文件：`apps/miniprogram/miniprogram/pages/classroom/classroom.wxml`

已观察到的差异：

- OLD 为阶段标题与档案标签增加容器层级；
- OLD 将课程地点空值提示改为“地点待补充”；
- NEW 使用自己的阶段标题结构和“地点：暂无”文案。

**当前决策：** 保持 NEW，不主动调整布局或文案。

### 3.3 Classroom WXSS

文件：`apps/miniprogram/miniprogram/pages/classroom/classroom.wxss`

已观察到的差异：OLD 删除了 NEW 的阶段标题横向排版样式。

**当前决策：** 保持 NEW 的布局样式，不以 OLD 覆盖。

### 3.4 Navigation Test

文件：`tools/testing/miniprogram-navigation.test.cjs`

已观察到的差异：

- NEW 保留阶段卡片、规划卡片、课表卡片的顺序断言；
- NEW 检查规划卡片在课表展开前持续存在；
- NEW 检查课表展开状态及旧 `selectedView` 状态不再出现；
- OLD 删减了部分结构断言。

**当前决策：** 保持 NEW 测试，不采用 OLD 中删减后的断言集合。

### 3.5 六项差异的统一处置状态

| 文件组 | 文件数 | 当前处置 | 是否获准修改 NEW |
|---|---:|---|---|
| Assessment Form TS/WXML/WXSS | 3 | KEEP_NEW / 仅记录差异 | 否 |
| Classroom WXML/WXSS | 2 | KEEP_NEW / 仅记录差异 | 否 |
| Navigation Test | 1 | KEEP_NEW / 保留较完整断言 | 否 |

以上是用户当前决策，不代表 OLD 的差异已经被迁移。

## 4. Worktree 与工作区现状

本轮 `git worktree list --porcelain` 共显示 8 项登记（含主工作区）：

| Worktree | 报告状态 | 处理意见 |
|---|---|---|
| 唯一目标工作区 `jiuchen-edu-platform` | 当前分支；有 1 个 modified 配置文件和 32 个 untracked 文件 | 保留，唯一施工目录 |
| `.codex/worktrees/p1-isolated-api-2026-10-14` | 工作区干净；上游分支显示 gone | 暂不删除，先核分支提交是否有独有资产 |
| `.codex/worktrees/product-closeout-build-20261030` | 工作区干净 | 暂不删除，先核分支提交 |
| `.codex/worktrees/release-a-2026-10-12` | 工作区干净；上游分支显示 gone | 暂不删除，先核分支提交 |
| `.codex/worktrees/ux-batch-a-20261106` | detached HEAD；工作区干净 | 暂不删除，先核对应提交和旧分支 |
| 旧工作区 `jiuchen-edu-platform-main` | 分支上游 gone；存在多项 tracked 修改及未跟踪图片 | **禁止删除**；六文件差异及其余本地改动完成整合前必须保留 |
| `jiuchen-edu-client-gate` | 物理目录不存在；gitdir 指向不存在位置 | 疑似失效登记；待归档核验后仅清理登记 |
| `jiuchen-edu-device-acceptance` | 物理目录不存在；gitdir 指向不存在位置 | 疑似失效登记；待归档核验后仅清理登记 |

`git worktree prune --dry-run --verbose` 的输出在 PowerShell 中触发 NativeCommandError，未形成可依赖的完整预演报告。**本轮没有执行正式 prune，也没有删除目录、分支或 stash。**

## 5. 分支、Stash 与未跟踪资产

用户生成的整合审计包摘要：

| 项目 | 数量 |
|---|---:|
| 本地分支 | 17 |
| 非当前分支祖先关系的分支 | 4 |
| Stash | 5 |
| Stash 文件记录 | 94 |
| 当前未跟踪文件 | 32 |
| 文件名层面的疑似秘密文件 | 0 |

上述数字来自审计包生成回执。当前上传的六文件报告没有包含四个独有分支和五个 stash 的完整内容审查。因此：

- 四个非祖先分支必须逐一核对独有提交、文件差异和是否已被当前分支吸收；
- 五个 stash 必须核对文件清单、补丁内容、是否与当前提交重复及是否含唯一资产；
- 32 个未跟踪文件必须分类为发布材料、运维脚本、测试、配置、临时诊断输出或其他资产；
- “疑似秘密文件 0”只代表文件名扫描没有命中，不代表内容级秘密扫描通过。

**待读取的现有审计包：** `jiuchen-consolidation-audit-20261117-103549.zip`。应直接审查此包，不重新生成同一批只读审计，不重复运行已通过的检查。

## 6. 下一步执行顺序

### A. 完成一次性资产审计

1. 读取现有审计 ZIP 中的分支补丁、stash 清单/补丁、未跟踪文件清单和资产副本。
2. 形成逐项处置表：`KEEP / MERGE / ALREADY_INCLUDED / ARCHIVE / SAFE_TO_REMOVE`。
3. 六个差异文件默认全部保持 NEW 原样，不执行融合施工。若出现需要裁决的冲突，逐项报告用户并等待决定。
4. 将审计结论、保留资产及清理边界固定在本目录交接文件中。

### B. 收束为唯一本地工作区

- 唯一施工目录保持为 `C:\Users\yulia\Desktop\04_项目开发与代码\jiuchen-edu-platform`。
- 旧工作区在所有唯一差异与未提交资产完成迁移、校验和归档前不得删除。
- 失效 worktree 登记、已确认无独有内容的 worktree 和分支、stash 分批清理；先保留审计归档，再执行清理。
- `project.config.json` 的本地修改和发布暂存资产单独核验，不被远端文件覆盖。

### C. 小程序最终验收与发布

本项目不是从零开始重新验收。用户确认已有多项功能完成过代码施工和真机验收。本轮尚待用户明确验收的分享动作包括：

- 复制分享链接；
- 转发小程序给微信好友；
- 分享到朋友圈。

对已完成且有证据的功能沿用既有验收记录，只针对新增、变更或未验收动作补测。一次集中审查、一次必要补充、一次本地回归，然后进入微信开发者工具编译和上传；核对上传版本与固定代码候选后，由用户执行正式发布。

### D. 发布后制作完整交接资产

发布完成后再进行最终交接，不将当前临时审计报告当成最终交接文件。最终目录应覆盖全部实际系统模块与运维责任，不预设只有 12 个模块。至少应从以下工程域逐项盘点：

- 小程序前端、页面路由、角色与权限；
- API 服务、接口契约、任务与评估链路；
- 数据库结构、迁移和数据关系；
- AI 服务商、密钥管理、模型配置与成本边界；
- 评估次数、虚拟支付、订单和账本；
- 资讯、院校库、规划、课表及报告导出；
- 管理后台、统计、客服和运营流程；
- ECS、域名、反向代理、systemd、资源限制；
- 手动加密备份、恢复演练、保留策略；
- GitHub 分支、CI、自托管 Runner、版本与回滚；
- 微信公众平台配置、开发者工具、体验版、审核与正式发布；
- 安全凭证边界、故障处理、监控、日常维护和责任交接。

交接内容必须区分已验证、用户现场验收、生产现状、待办和历史记录；不得把代码通过写成真机通过，也不得把部署通过写成正式发布。

## 7. 本轮明确未执行

- 未合并至 `main`；
- 未部署 ECS；
- 未执行生产数据库变更；
- 未上传或发布微信小程序；
- 未删除旧工作区、任何分支、stash 或 worktree；
- 未执行正式 `git worktree prune`；
- 未将未跟踪文件批量加入提交。

**当前审计结论：** 六文件差异已定位；用户明确 NEW 为唯一默认基准，六项均保持 NEW，不执行融合。新旧工作区、stash 和其他 worktree 在资产审计完成前继续保留。完整本地资产审计以现有 ZIP 和时间戳 JSON 为现有证据，不重复已完成的同类只读采集。


## 8. 时间戳维度：新增整合判定规则（2026-11-17）

用户要求在新旧工作区比较中加入时间维度。后续采用“文件级时间线 + 内容哈希 + 业务语义 + 测试证据”综合判定，不以整个工作区或单一时间戳决定胜负。

### 8.1 时间证据分层

每个候选文件同时采集：

1. 文件系统 `LastWriteTimeUtc`：观察本地文件最近写入时间，适用于未提交改动；复制、checkout、stash 恢复、解压和同步可能改变或保留该时间，因此只作辅助证据。
2. Git AuthorDate：提交作者记录的创作时间。
3. Git CommitDate：该提交进入当前 Git 历史的时间；rebase、cherry-pick 等操作可能改变提交时间。
4. 当前工作区 HEAD、文件最近一次提交、工作区状态（clean/modified/untracked）。
5. SHA-256：确认两个工作区文件内容是否相同；时间较新不等于内容更正确。
6. 必要时读取 worktree HEAD reflog 与 stash 创建时间，识别 checkout、恢复、暂存等操作对文件时间的影响。

### 8.2 当前 ZIP 能证明与不能证明的事项

- ZIP 记录了新工作区 HEAD `1b2a33f0aeeb804b300c9d4e4c7149e8175b2fb7`，旧工作区 HEAD `217934e00898c002f741b49511e46a41c209e4bc`。
- 当前分支已包含旧工作区所在分支的 HEAD；旧分支没有独有提交。但旧工作区仍有 16 个 tracked modified 文件和 1 个 untracked 图片，属于未提交工作区差异，不能由分支祖先关系自动判定已吸收。
- ZIP 中没有为新旧两个工作区的全部对应文件提供原始 `LastWriteTimeUtc`、文件哈希和逐文件 Git 最近提交时间的配对清单。
- ZIP 内 `current-untracked-assets/` 的归档条目时间主要集中在 2026-11-16 16:03:04 / 16:03:06，另有 2026-11-17 10:36:48 的条目。这些是归档条目时间，缺少原始文件时间采集记录，不能据此判定文件实际创作时间或新旧优先级。
- 四个历史分支补丁保留了各自独有提交的 AuthorDate/CommitDate，可用于历史分支排序；它们不能替代当前两个工作区未提交文件的实际时间戳。
- Stash 补丁保留内容和文件差异，但当前清单未记录每个 stash 的创建时间及对应文件原始 mtime。

### 8.3 用户确定的版本取舍规则

| 证据情况 | 执行规则 |
|---|---|
| 新旧文件 SHA-256 相同 | 内容一致，记录即可，不重复迁移 |
| 新旧文件内容不同 | 默认保留 NEW，不自动合并 |
| OLD 文件时间更晚 | 仅作为演进时间证据，不构成采用 OLD 的授权 |
| OLD 存在 NEW 没有的功能或字段 | 描述功能差异、调用影响和潜在价值，交由用户决定 |
| NEW 与 OLD 存在业务行为冲突 | 逐项报告，等待用户裁决 |
| 时间戳与 Git 历史冲突 | 说明 checkout、复制、stash、rebase 等可能因素；不自行选边 |
| 测试覆盖不同 | 保留 NEW 当前测试约束；不得为了合入 OLD 而降低覆盖 |

**总原则：NEW 决定默认版本；时间戳用于重建演进顺序；哈希用于识别内容；测试和业务语义用于解释风险；用户拥有冲突裁决权。**

### 8.4 时间戳审计回执

用户最终 PowerShell 回执报告：

- `CollectionComplete=True`；
- `TotalPaths=48`；
- `ExpectedFileRows=96`；
- `ActualFileRows=96`；
- `Files.Count=96`；
- 两个工作区各 48 条记录；
- `AUDIT DATA STRUCTURE VERIFIED`；
- 仓库文件未被该只读采集修改。

本地 JSON 位于仓库外：

`C:\Users\yulia\Desktop\04_项目开发与代码\jiuchen-workspace-timestamp-audit-20261117.json`

该 JSON 尚未作为文件上传到本交接目录；本文件仅记录用户终端回执，不替代对 JSON 原始记录的独立内容复核。**不重复执行同一轮 48 路径时间戳采集。**

## 9. 分享功能代码审查（2026-11-17）

基于远端施工分支 `codex/ux-consolidation-20261116` 当前代码进行只读检查。

### 9.1 微信好友分享

`apps/miniprogram/miniprogram/pages/index/index.ts` 已包含：

- `wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })`；
- `onShareAppMessage()`；
- 固定分享路径 `/pages/index/index`；
- 分享封面 `/assets/jiuchen-visual-v1/banners/today-campus-hero.png`。

### 9.2 朋友圈分享

首页已包含 `onShareTimeline()`，返回固定标题、空 query 和分享封面。

品牌页 `pages/brand/brand.ts` 同样包含 `showShareMenu`、`onShareAppMessage` 和 `onShareTimeline`，分别指向品牌页。

### 9.3 自动化测试覆盖

`tools/testing/miniprogram-navigation.test.cjs` 新增静态测试，检查首页和品牌页的分享菜单、好友分享回调、朋友圈分享回调及固定路由。

这是代码和测试证据，不等于微信开发者工具或真机已验收。用户尚未完成对应入口的真实微信操作验收。

### 9.4 “复制小程序分享链接”现状

针对小程序页面 TS 文件及相关 API 服务进行检索，当前发现的 `wx.setClipboardData` 用途包括：

- 评估结果页：复制 AI 评估报告文本；
- 我的 / 管理员页面：复制九辰内部身份编号；
- 院校/资讯资料页：复制公众号文章原文 URL。

这些都不是九辰小程序自身的可打开分享链接。

后端 `services/api/src/services/wechat.ts` 已有稳定 access_token 获取与缓存逻辑，环境配置已有 `WECHAT_APP_ID` / `WECHAT_APP_SECRET`；但当前审查未发现调用微信 `wxa/generate_urllink` 的实现，也未发现对应的小程序 URL Link API 路由。

**结论：** 微信好友分享与朋友圈分享已有代码；“复制小程序分享链接”尚无完整证据证明已实现。不能用复制 `/pages/index/index` 这样的内部路径冒充可分享链接。

若要实现真正可粘贴并打开小程序的链接，需要服务端调用微信 URL Link 生成接口，再由小程序将返回的 `url_link` 复制到剪贴板。入口位置、目标页面和链接有效期策略应在施工前确定；不把 AppSecret 或 access_token 放在小程序前端。

### 9.5 当前待决项

- [ ] 用户确认“复制分享链接”是否指微信官方 URL Link（可粘贴并打开小程序的 HTTPS 链接）。
- [ ] 确认复制入口放在首页、品牌页，还是两处。
- [ ] 好友分享与朋友圈分享：代码已存在，等待用户在微信开发者工具/真机验收。
- [ ] 不在本轮擅自改动 NEW 的评估表单或其他业务代码。


## 10. 六文件 Diff 及资产收束更新（2026-11-17）

六个 OLD/NEW 差异文件的实际补丁已收到并审查，补丁 SHA-256：`80da02c8ee00068456eff39a74f08a9fb82f9b52ce66b1b761ee580fc1873372`。六项全部保留 NEW，无需从 OLD 合并代码。差异涉及评估表单院校选择/全局研究方向与备注、旧草稿兼容、次数不足提示，以及课表学期布局和导航静态断言。真机重点见 [收束与历史资产归档记录](workspace-consolidation-closeout-2026-11-17.md)。

资产处置、Stash 分类、Worktree 保留边界、七份 API 历史归档预期 SHA-256 和下一步本地操作见同一收束记录。**本轮未删除、移动或恢复任何本地资产；未执行分支、Worktree 或 Stash 清理。**
