# P1 发布收尾进展 — 2026-10-16 晚间（历史证据）

> 后续更新以 [CURRENT](CURRENT.md) 为准；本页保留当晚验证过程，归档短期下载地址和当时“下一关”不代表2026-10-17的当前可执行指令。

## 固定版本与前端
- 前端固定源码：449d7472adff884401e375703364384bf0c65034。
- 前端本地验证：[38891917207](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38891917207)，typecheck、95/95导航/院校/报告导出/真实数据回归 PASS。
- 此前eda525c1旧小程序TS2783失败保留；不以当前前端绿灯改写历史。
- API旧隔离候选仍为eda525c1a2276af90668849b669e9bce19a4fd7d，原215测试及临时News/Profile门禁证据保留。前后端分版本记录。

## News V2 字符集阻断及修复
生产用户ID为utf8mb3_general_ci，新闻ID为utf8mb4_unicode_ci。原upgrade-news-v2要求两个基础表均utf8mb4且同collation，无法在已观测生产结构上通过预检。
拟修复：各引用users的字段显式沿用users.id字符集/排序规则；各引用news_posts的字段匹配news_posts.id；内部新闻表默认沿用新闻ID字符集。保持原基础表、历史数据与外键约束。
先在Runner临时checkout应用精确补丁后验证；不对生产执行DDL。
首次验证38892056583：API typecheck/213测试/build PASS；混合字符集迁移双次成功，后因本轮新增外键数量断言误写12（实际10）FAIL，未完成新闻恢复断言。Profile临时门禁PASS。该失败不隐藏。
更正断言后的完整验证：[38892084356](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38892084356)。
此测试为混合ID字符集最小fixture，不是完整生产结构复刻，也不是生产备份恢复。

## Runner与生产
用户19:08北京时间回执Runner重新Connected/Listening；标签orangeleetec-local-linux保持。GitHub/API/npm联网及Docker版本检查通过；不改代理/DNS。
生产沿用10:39日志：8cc4bb85，172.25.80.203:3100，live/health通过。未重新要求同套预检。

## 发布剩余关口
1. [已完成] 字符集修复、后继隔离API SHA、归档/清单及固定候选验证；旧eda归档不包含修复。
2. 生产相关结构复刻及备份隔离恢复；productionBackupRestored仍false。
3. Profile单列、News七表分别明确生产审批；AI quality v3无独立开关，需独立确认或制作core-only候选。
4. ECS Node22 编译与256MiB/50%CPU/64tasks无数据库冒烟已过；真实数据库/AI负载仍待验。
5. 按精确SHA批准部署后执行统一真机清单，再微信发布。
公众号源缺口、支付三表、coaching/growth缺表继续单列，不把通过项扩展为全功能交付。

## 本轮实际结论
- 更正后的38892084356：API typecheck/213 tests/build、News混合字符集关系/双次迁移/临时恢复、Profile临时门禁全部PASS。
- 源码修复提交：4d9d429164e29e409f2cb1d8c27276b3dfd69efc。
- 后继隔离API：e5908185b3b460a04a8102b7e2a30b663623ac30，分支codex/p1-isolated-api-2026-10-16；对比旧eda仅upgrade-news-v2.ts一个文件。
- 精确后继候选验证：[38893179855](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38893179855)，最终verify（API typecheck/215测试/build）、mysql-gate（混合字符集七表及恢复）、profile-gate全部SUCCESS。
- 后继归档：[38893319990](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38893319990)，SUCCESS；产物p1-api-e5908185-readonly，162文件、302752 bytes。旧eda归档不能用于发布新SHA。
- 新增验证/归档入口只在自身workflow文件push或手动触发，固定SHA、不自动部署；仍有旧PR云端workflow在额度准入前失败，不反复重跑。

## 已生成交付包
- 文件：jiuchen-api-e5908185b3b460a04a8102b7e2a30b663623ac30-readonly.tar.gz。
- SHA256：ae1db0fa1ee8af35881a0f1a09b4d7fd47134a2707e56d25ee2fcc1f2798ddc2。
- [下载Artifact](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38893319990/artifacts/12042896920)，有效期至2026-10-17 19:25北京时间；同包manifest.json保留文件清单。可按固定SHA和现有脚本重建。
- REVIEW_ARTIFACT_READY / FIXED_SOURCE_TEST_PASS / PROD_NOT_DEPLOYED / DEVICE_PENDING。
- 后继仍包含既有AI quality v3；单文件修复没有改变其独立审批边界。

## 20:12 ECS 实测回执（用户终端）
- incoming归档本地及ECS SHA256均匹配ae1db0fa1ee8af35881a0f1a09b4d7fd47134a2707e56d25ee2fcc1f2798ddc2；162项manifest及Git blob核验PASS。
- staging：/opt/jiuchen-api/staging/verify-e5908185b3b460a04a8102b7e2a30b663623ac30-20261016-200602。
- 默认全局Node24导致最初前提检查退出，无构建。现役独立Node为/opt/jiuchen-api/runtime/node-v22.23.3-linux-x64/bin/node。
- 首轮临时构建384MiB cgroup/256MiB V8 heap，typecheck堆OOM，exit134；未进入冒烟。改用临时构建512MiB cgroup/384MiB heap，Node22.23.3 typecheck/build PASS，耗时88秒；未放宽生产API限制。215测试沿用本地Runner精确候选结果，未冒称ECS全量测试通过。
- systemd239 / cgroup v1，短任务退出后unit被回收；事后MemoryMax=infinity不是运行时限额证据。改为同一cgroup内读取memory.limit_in_bytes并强制断言268435456，执行无凭据/无DB、160MiB堆、loopback随机端口冒烟。
- 用户回执ECS_KERNEL_256M_NO_DB_SMOKE_PASS，Result=success/exit0，4.899秒；内核MemoryPeak72585216 bytes（约69.2MiB），memory.failcnt前后0，under_oom0/oom_kill0。
- 仅代表256MiB内基础启动/健康请求通过，不代表AI/数据库/真实并发资源验收。实际API仍8cc4，未读取生产环境文件、未迁移、未promote、未改官网或Docker。
- 下一关：生产备份及隔离恢复、完整相关结构复刻、精确DDL/API（含AI quality v3）范围确认和真机验收。productionBackupRestored保持false。
