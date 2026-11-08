# 九辰教育小程序｜Batch A 收官与工程状态快照

日期：2026-11-07（Asia/Shanghai）
项目：`orange-lee-tech/jiuchen-edu-platform`
性质：**人类真机验收结论 + Codex 本地交付报告的状态快照**。本文件是可导入仓库的交接稿，**尚未写入 GitHub 仓库**；以下本地 SHA/状态由开发者及 Codex 报告提供，未在当前运行环境复核本地 Git。

## 1. 结论

**Batch A：CODE 完成；LOCAL TEST 已通过适用检查；DEVICE 验收 PASS；CI 未运行；PROD 未变更。**

2026-11-07 开发者明确确认三项最后的真机验收均 PASS：
- 教师规划应用学员：PASS。
- 未保存草稿与账号隔离：PASS。
- “认识九辰”与客服入口：PASS。

此前开发者已确认课表入口路由错误和资讯分类/复选筛选 UI 问题均已解决；A1–A4 其他行为在先前验收中报告正常。本次结论限于已实际反馈的验收范围，不外推为所有屏幕尺寸、全部业务压力或正式生产支付功能通过。

## 2. 已交付本地提交

工作分支：`codex/ux-batch-a-20261106`
最后已报告本地 HEAD：`9a0965f31e444f40525dfb2bf87d79e3ce89ace9`

| SHA | 交付范围 |
| --- | --- |
| `4d2c1a347af07614c0fefebb311e4bd4f54ba763` | 五文件热修 checkpoint：机会筛选、课表入口路由校验等 |
| `9b583c8dec5fe71ec291671e24b7a2e9b3a48ebe` | A1 学期设置收纳 |
| `c03299f5a4d04a79daea71fd0e4eec37b9b17469` | A2 规划原位编辑及共享任务编辑组件 |
| `25c530a11e0277c84c263d793144886c6a0f606e` | A3 曾将“认识九辰”改为默认折叠；后续 P1 已按用户意见恢复常显 |
| `5cf00ff6cd1599fc35636507965b031bd041523a` | A4 间距压缩 |
| `7ccb9b987673e4ff8c5656d3a53518ffaba6ab99` | A2 安全补充：身份切换时未保存草稿隔离与提示 |
| `be70b4f21baadca2a0221c9e5a150471bf95e301` | P0 教师规划应用学员：任务字段白名单、逐学员结果与失败重试 |
| `ed5b371207d054e45de371e4f3d9b7359bed2271` | P1 原生 Tab 后保留草稿、继续/放弃提示 |
| `9a0965f31e444f40525dfb2bf87d79e3ce89ace9` | P1 “认识九辰”三个入口常显、客服常显 |

此前另有本地提交 `694f71d`，修复资讯 TypeScript 参数默认值及保留本地标签精简变动。本表仅列收官报告中明确回报的提交；完整提交图由本机 `git log` 决定。

## 3. 验证证据及边界

- 小程序 `npm run typecheck`：Codex 报告 PASS。
- 定向前端回归：Codex 报告 7/7 PASS，P1 各额外检查一次。
- `git diff --check`：Codex 报告 PASS。
- API `teacher-planning.test.ts` + `classroom-direct-save.test.ts`：开发者曾在本地实际运行 6/6 PASS，随后 API typecheck 与 build 均无报错。P0 本轮改动集中在前端，Codex 报告未再次运行 API 测试。
- 真机：开发者最终明确三项 PASS。
- 云端 CI：**未执行**；不能记为 PASS。
- GitHub 远端：报告仍未 push / merge。本地领先 origin 10 个提交（最后一次 Codex 报告），须在开始新施工前本地复核。
- 生产 API、ECS、MySQL、小程序正式版：**无本轮变更或部署**；不据此声称生产已部署 Batch A。

## 4. 保留资产及限制

- `apps/miniprogram/project.config.json`：本地独立修改，未提交、未暂存；不得覆盖或自动纳入 Batch B。
- 4 个历史 Stash：未清理；原有备份目录保留。
- 未授权执行 push、merge、deploy、生产 DDL、真付费调用或小程序正式发布。
- Batch A 已冻结；新问题必须有实际可复现证据才重新开启，不因 Batch B 的施工顺手重构 Batch A。

## 5. 后续里程碑

**Batch B（U1 + U2）启动**：定位页背景资料/成长事实原位编辑 + AI 次数、商品、订单、售后能力迁移至“我的”。先事实资料，后商业 UI，沿用既有 API/状态机。施工令见 `jiuchen-batch-b-codex-plan-20261107.md`。

**Batch C（U3）仍未启动**：课表课程学分与成绩，需先形成数据合同、旧数据兼容与必要迁移审查；不得混入 Batch B。

## 6. 入仓规则

由本地 Codex 在确认当前分支及工作树后，将本文件内容保存为仓库内例如 `docs/handoff/batch-a-acceptance-2026-11-07.md`，再更新现有 `docs/handoff/CURRENT.md` 的阶段索引；检查已存在文档的历史时序，不覆盖后续状态。以上更新必须由本地操作完成，**本文件本身不代表已写入仓库**。
