# P1 收尾候选与统一微信验收清单（2026-10-13）

## 数据来源与本轮界限

本轮只改集成分支代码，没有生产 DB、ECS、微信体验版操作。`git pull --ff-only` 因工作环境网络代理不可达未成功；本地是无 Git 历史的源码快照，提交时以 GitHub `p1/foundation` 的预期 SHA 非强制更新。2026-10-12 的生产只读结果见 `real-data-audit-2026-10-12.md`，**不是本轮重新查询**：公众号 40 组完整抓取、最新标题“月满中秋，清辉相伴｜九辰教育祝您中秋安康”，原始更新时间 2026-09-25 09:00:02 北京时间，真实发表时间未获证实；评估成功 9、失败 5、草稿 1；支付／账本／冻结表缺失；身份仅有未认领学员、已认领未分配学员及管理员脱敏样本，已分配学员和已认领老师样本缺失。

| 范围 | 本轮代码核对与修改 | 接口／生产状态 | 体验版核对路径与预期 |
| --- | --- | --- | --- |
| 学堂与首页 | 导入和学期确认使用 `/me/classroom/schedule-imports`；日期 PUT 只写 `termStartDate` 并读回。课表页重新显示时读 `/latest`，成功保存后重算周次；首页重新显示时独立读 `/latest`，展示真实学期、本周课程或明确错误。规划页的本周面板也读 `/latest`。 | Release A 源码已有独立日期 PUT；此前真机课表 DEVICE PASS，本轮未重复写生产。 | 学员：我的课表→导入/编辑→选择归属学期→设置第一周周一→返回首页及我的规划→本周课表。核对首页学期、周次、课程与服务端重读一致；失败时不把新日期显示为已保存。 |
| 管理员身份 | `/me/admin/internal-ids` 关联 `users/internal_ids/students/teachers/user_profiles/student_teacher_assignments`。未认领、未分配和资料待完善分别展示；管理员无岗位数字，不把 NULL 变成 0。页面去掉测试命名提示；后台仍识别需要完善的占位姓名，没有批量改名、自动认领或删除。 | 旧只读样本覆盖不全；管理员实名／岗位没有独立记录。只读身份镜像授权不变。 | 管理员→用户与内部编号：未认领学员、已认领未分配学员、已分配学员、老师、管理员分别核对；缺已分配及老师真实样本则记 DATA PENDING。暂停／撤销独立核对，不以分配状态覆盖。 |
| AI 统计 | `/me/admin/assessment-analytics` 从 `assessments` 统计创建、成功、失败、运行中及区间去重评估用户；创建趋势加入图表，周／月／年及折线／柱状保留。支付按 paid 订单分，账本和冻结独立来源错误。 | 2026-10-12 只读样本有 9 条成功；支付三表不存在，应显示“数据源不可用”，不得显示 0；历史完成时间的时区差仍待真实归桶核验。 | 管理员→AI 评估与充值统计：切换周期和图形，核对已成功评估进入对应区间；用户数指区间创建过评估的不同账号，全库账号数单列。核对充值不可用不影响评估数。 |
| 资讯运营 | `freepublish/batchget` 每页 20 组，最多 200 组并报告截断；审核过的文章按来源更新时间进 20 条窗口，离窗缓冲 72 小时；收藏写公众号 `mp.weixin.qq.com` 原链接；退役任务待办／知晓／在办／反馈及备注仅老师／管理员可读。 | News V2 七表生产未迁移、开关关闭；旧接口不具备 V2 收藏和退役状态。来源 `update_time` 是来源更新时间，不能冒充发表时间。 | 管理员→资讯运营核对同步回执的检查时间、来源更新时间与最新真实标题；启用 V2 前只验证旧版显示、分类和收藏待开放，V2 状态流转记 DEPLOY PENDING。学员不可见未审核文章及内部备注。 |

## 一次性体验版验收

使用真实已认领学员、老师、管理员账号及未认领编号的脱敏样本；不要在仓库或截图写入完整个人资料。先由本人在微信开发者工具以最终 SHA 编译并上传体验版，再集中核对上述路径、客服复制模板、AI 报告结果与历史长图水印、资讯分类和院校地图。微信工具、真机与生产只读接口本轮均未执行，所有这些项为 **DEVICE PENDING / DEPLOYED: NO**。Release A 已上线且不重复发布。生产 Schema、正式切流、支付和微信发布依既有独立 Gate 处理。

## 验证记录

- 小程序 TypeScript 与 `miniprogram-navigation.test.cjs` 53 项通过（含周次、日期保存、返回重读和首页入口）；其他候选专项沿用之前批次的 CI 证据，不在本轮重报真机 PASS。
- API typecheck/build 通过；相关 analytics、identity、News lifecycle 测试通过。完整 API 测试经 `node --import tsx --test` 为 46/47：唯一失败的院校目录镜像测试在受限工作环境内 `spawnSync node EPERM`；单独运行目录生成器 `--check` 通过。`npm test` 的 tsx IPC 也因 `listen EPERM` 不能在本环境执行；需 GitHub CI 独立确认完整测试。
- 本轮未用生产凭据执行私有 GET、官方同步 POST、DB 写入、DDL、微信上传或手机验收。代码完成与 CI／真机状态要依据提交后实际运行结果更新。


## CI 最终回执

最终修复提交 `156f2ab70f7e70e205a35267b1398954663b3cb7` 的 [CI](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38356200246)、[News V2 隔离 MySQL Gate](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38356200232) 与 [Profile 隔离 MySQL Gate](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38356200256) 均 PASS。CI 只证明测试代码通过，未部署生产或微信体验版；DEVICE PENDING。
\n\n## P1 RC 依赖审计补充（2026-10-13）\n\n旧 `/news` 由 Release A 直接提供，V2 收藏及退役接口只在服务端开启 V2 时触发。管理员统计对 Release A 未返回的 `assessmentUserCount` 显示“当前 API 未提供”，原成功／失败／创建图表保留；账号、分配与资讯页面已拆开独立读取。代码 `22f3889` 的 CI PASS；完整路径与 Profile 缺列阻塞见 [设备就绪审计](p1-device-readiness-audit-2026-10-13.md)及[最终清单](p1-experience-candidate-checklist-2026-10-13.md)。此候选 **可上传体验版进行有限验收**，但完善资料不可标 PASS，P1 全功能交付 NOT READY。\n