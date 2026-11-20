# MySQL 隔离迁移演练执行器故障复盘｜2026-11-20

**状态：执行器故障已定位；底层异常尚未取得，数据库演练未完成。**  
**影响范围：本机一次隔离演练启动失败；生产数据库、ECS 与腾讯云控制台未触碰。**

## 1. 现场回执

- 仓库：`orange-lee-tech/jiuchen-edu-platform`
- 候选分支：`codex/ux-consolidation-20261116`
- 候选 SHA：`d93ba079b75f6b48697497668035acf5f223c597`
- 备份代：`20261108-055750-dac461`
- 备份密文 SHA-256：PASS
- 迁移源文件 SHA-256：PASS
- 迁移源码合同检查：PASS
- API DB scripts 检查：PASS
- 备份解密：PASS
- 临时容器清理：PASS
- 最终输出：`FAILED: REHEARSAL_ABORTED`

未出现 `MYSQL_8_READY=PASS`、`ISOLATED_SQL_RESTORE=PASS`、`PERSONAL_WORKSPACE_UPGRADE_PASS` 或 `PERSONAL_WORKSPACE_MYSQL_PASS`。

因此本次没有证据证明 MySQL 已完成启动、备份 SQL 已导入、迁移已执行或业务验收已运行。容器清理成功只证明本次临时容器已被清理，不代表演练通过。

## 2. 已确认的执行器缺陷

复核 `jiuchen-personal-workspace-rehearsal-v2.py` 源码：

1. 执行器在备份解密后创建临时 Docker 容器，并将 WSL 临时目录 bind mount 到容器的 `/var/run/mysqld`，用于跨宿主机 Unix Socket 连接。
2. `docker create` 成功后设置 `created=True`；最终输出 `TEMP_CONTAINER_CLEANUP=PASS`，证明执行已越过容器创建步骤并进入清理分支。
3. 容器启动阶段没有输出 `MYSQL_8_READY=PASS`，故障发生在 MySQL ready 标记之前。
4. `mysqladmin ping` 的 `subprocess.run(..., timeout=10)` 没有捕获 `subprocess.TimeoutExpired`；脚本顶层又把所有非 `RuntimeError` 异常统一折叠为 `FAILED: REHEARSAL_ABORTED`，未保留异常类型、阶段和 traceback。
5. 因此底层异常被执行器主动隐藏。当前不能断言一定是 MySQL 启动失败或 Socket 权限问题。未捕获的 `TimeoutExpired` 是代码中明确存在的候选失败路径；`os.chmod` 等系统异常也可能被同一顶层处理器隐藏。

**已证实根因：** 本次执行器的异常诊断设计不合格，无法从现场回执定位底层异常。  
**尚未证实：** 具体抛出的异常类型及触发点。

## 3. 工程决策与纠偏

本轮执行器引入了非必要的 Unix Socket bind mount、容器内 socket 权限调整和 Node.js host socket 连接，偏离项目既有的 MySQL 隔离演练路径。

Git 历史中已有成功的真实结构迁移演练（2026-10-18）：

- 使用管理员 WSL 中既有 `maintain.decrypt` 解密已验证备份；
- 使用既有 `mysql:8.0` 镜像；
- Docker 容器通过随机宿主机端口映射到 `127.0.0.1`；
- 通过 `docker exec mysqladmin ping` 等待 MySQL ready；
- 通过 `docker exec -i mysql` 恢复 SQL；
- 由 WSL Node/npm 连接 loopback 随机端口，执行迁移两次和结构合同检查；
- 退出时只清理本次随机容器及其匿名卷。

该历史流程曾对 17 张真实备份表执行 Profile、News、商业迁移及重复执行检查，得到 `REAL_17_TABLE_SCHEMA_REHEARSAL_PASS; final_tables=28; production_writes=false`。参考：
- [2026-10-18 固定演练脚本提交](https://github.com/orange-lee-tech/jiuchen-edu-platform/commit/c33f370d5dfbba91680565c9c0afe6fd3356b6ac)
- [真实结构演练回执记录](https://github.com/orange-lee-tech/jiuchen-edu-platform/commit/0ce2c2378d820f49c769583ecffb262189d81ae2)

**后续采用原则：** 回到上述已验证的容器生命周期与连接方式，只替换本次迁移命令和必要验收项；不再重写备份解密、容器启动、端口映射、SQL 恢复和清理机制。原始 `growth-schema-rehearsal.py` 保持不变，先核对其 `extract_migration` 对当前 TypeScript 多步骤迁移的适配边界，再决定最小补丁。

## 4. 后续验收要求

- [ ] 读取并复用历史 runner 的完整实现，确认当前迁移适配范围。
- [ ] 恢复 2026-10-18 已验证的 loopback 随机端口连接模式。
- [ ] 每一阶段输出独立标记：容器创建、MySQL ready、SQL restore、迁移第 1 次、第 2 次、业务 verifier、cleanup。
- [ ] 捕获并记录异常类型、阶段和安全脱敏错误码；不再把所有异常折叠成同一错误。
- [ ] 在同一份已验证备份副本上执行真实 TypeScript 迁移两次。
- [ ] 执行 `db:verify:personal-workspace`，核对旧计划/任务保留、账号阶段回填、绑定/解绑读取和外键约束。
- [ ] 记录真实结果后，再进入新鲜生产备份、生产只读结构核对及独立 DDL 授权。

本次故障不构成重新下载备份、修改生产 SQL、登录腾讯云 SQL 编辑器、重建生产数据库或触碰 ECS 的理由。

## 5. 发布状态边界

本次失败没有改变候选代码或生产状态。隔离演练仍为 **PENDING**；生产 DDL、ECS staging/promote、微信上传与正式发布均未执行。不得将源码 SHA 校验、备份解密或临时容器清理写成迁移 PASS。
