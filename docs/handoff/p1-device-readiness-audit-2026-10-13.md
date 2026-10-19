# P1 体验版依赖审计（2026-10-13）

## 基线与判断

候选为 `p1/foundation`，兼容修复提交 `1d6b1cd813c2d4d8fffd0c19a8e790e7cb9a3029`；生产 API 基线按 `CURRENT.md` 的用户 ECS 回执为 Release A `8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`。本环境 `git pull --ff-only origin p1/foundation` 因代理连接失败；以 GitHub 分支 HEAD 和 Release A 对应源文件只读核对。未重新连接 ECS，也未上传微信体验版。**源码可上传体验版不代表所有页面在现有生产 API 下功能通过。**

## 已完成与接口依赖

旧资讯响应路径已由 `22f3889` 的合成回归确认：Release A 不带 `v2` 时，只发送 `GET /news`，不会请求收藏或退役接口。客服复制使用 `utils/consultation-payload` 和已有 `utils/customer-service`，无新表或新环境变量；报告图片逻辑在 `pages/assessment-result` 展示层，不更改 Assessment API／Runtime。

| 功能 | 小程序请求 | Release A 核对 | 体验版边界 |
| --- | --- | --- | --- |
| 学员资讯 | `GET /news`、`GET /news/:id` | 两条旧路由存在；响应没有 V2 标志，收藏入口保持待开放 | 不调用 News V2 收藏／退役 API；未分类在服务端受限 |
| 管理员账号／只读查阅 | `/me/admin/internal-ids`、`users`、`students`、`teachers`、`assignments` | Release A 路由存在；缺失角色真实样本由数据决定 | 已拆分页面请求：编号只取编号／用户，师生分配只取师生／分配，查阅只取师生；资讯错误不连带阻断 |
| 管理员统计 | `/me/admin/assessment-analytics`、`/me/admin/users` | 两条路由存在；Release A 统计响应**没有**新版 `assessmentUserCount` | 保留真实评估统计，用户数明确“当前 API 未提供”；全库账号数另读 `/users`，不能混同 |
| 管理员资讯 | `/me/admin/news`、`/me/admin/news/sync`、标签 PUT | Release A 已含旧接口；V2 退役接口不在生产 | 退役区块仅能在服务端明确报告 V2 已启用时触发 |
| 学堂 | `/me/classroom/schedule-imports/latest`、日期 PUT | Release A 对应路由存在；CURRENT 记录课表 DEVICE PASS | 本轮新增首页读取尚待微信验收 |
| 客服复制 | 既有资料和客服能力、微信剪贴板 | 无新增表、环境变量或支付依赖 | 复制内容与企业微信手动发送待手机确认 |
| AI 图片／长图 | 已保存的评估报告、微信 Canvas／相册能力 | 不改 AI Runtime、Prompt、RAG、Assessment API 合同 | 真机相册、裁切、水印待确认 |

## 待本人微信验收

统一按 [P1-20261013 Experience Candidate Checklist](p1-experience-candidate-checklist-2026-10-13.md) 检查学员、管理员、老师。旧资讯、新的首页课表提示、客服复制、报告图片、身份标签与统计都尚无本轮真机 PASS。体验版上传由本人在微信开发者工具操作；代码测试或 ECS 健康不能替代手机回执。

## 不可测试项、生产依赖与风险

- News V2 的七表、开关和退役／收藏接口未生产启用：本轮体验版仅测试旧 `/news`，不验 V2 功能。
- 支付／账本／冻结表生产缺失；充值金额显示数据源不可用，不把缺表作零。商业方案未冻结，支付不进入 P1。
- Profile `enrollment_year` 生产缺列，相关读写可能失败；完善资料必须记录真实接口结果，不能以 UI 存在声称通过。
- 区间评估用户数 Release A 未返回，页面明确“当前 API 未提供”；已有成功／失败／创建统计仍独立展示。真实成功9条需按时间范围核对，不能强令周窗口等于全历史。
- 缺真实已分配学员和已认领老师样本，角色状态验证记 DATA PENDING；不自动认领、改名或补造。
- 生产 API 健康、课表／AI Runtime／院校图片既有 DEVICE PASS 与新报告图片等体验版 DEVICE PENDING 分开记录。不重复发布 Release A，不执行 DDL、切流、安装 timer、微信正式发布。
- 成本防火墙本轮只形成 [架构说明](../architecture/resource-cost-firewall.md)，没有执行代码、表、计费开关或资源清理。ECS 缓存、旧 release 与日志清理属于第二阶段，不阻断本轮源码审计。
- `assessment-form` 的充值按钮受服务端 `enforcementEnabled` 和 `checkoutEnabled` 控制；生产商业表缺失，不在体验版进行试付。源代码存在不等于支付已开放。

## 收口条件

兼容修复和旧资讯回归已提交；最终代码 `22f3889` 的 [CI](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38357710899)、[News V2 隔离 MySQL Gate](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38357710880)、[Profile 隔离 MySQL Gate](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38357710874) 均 PASS。本地小程序 typecheck 及完整测试组通过。**CODE/TEST READY FOR UPLOAD**；Profile 缺列仍使“完善资料”的生产真机验收 BLOCKED，故 **P1 全功能交付 NOT READY**。微信工具编译、体验版上传和手机验收由本人执行；任何失败都据实记录，不写 DEVICE PASS。
