# P1 本地 Runner 恢复验证（2026-10-16）

## 已确认事实
- GitHub owner `orange-lee-tech` 是个人账号；私有仓库。
- 用户账单截图：Actions 2000/2000 分钟，Billable $0；Actions 额外预算 $0，故云端执行被阻断。
- 用户已安装 WSL2 Ubuntu 24.04，位于 `D:\WSL\Ubuntu-24.04`；用户 `orangelee-tech`。
- 镜像网络及 Windows 代理已连通 GitHub / Docker Registry / auth；Docker daemon 独立代理已配置。
- 用户回执：Docker Client/Server 正常、用户属于 docker 组。
- Runner 页面 Idle：名称 `orangeleetech-wsl-local`；自定义标签 `orangeleetec-local-linux`。以实际标签为准，不自动纠正拼写。
- 这是用户个人工程环境；当前注册范围仅本仓库。

## 本批变更
新增 `.github/workflows/p1-fixed-candidate-local.yml`。只在该文件推送到 p1/foundation 时自动启动；不新增 PR 自动触发；提供 workflow_dispatch，按钮可用性受默认分支是否包含工作流影响。本轮使用 push 启动，后续从本次 run 重跑。
- 固定检出 `eda525c1a2276af90668849b669e9bce19a4fd7d`，并逐 job 断言 HEAD。
- 工作流本身属于集成分支的 harness SHA；被测源码 SHA 是 eda525c1，分别记载。
- 依次执行 verify → mysql-gate → profile-gate；独立检查使用 !cancelled()，前项失败仍继续后项；取消运行才停止。主CI中的导航、管理端、API阶段同样独立执行；任何失败仍将verify标为failure。
- 三个 job 只匹配 self-hosted / Linux / X64 / orangeleetec-local-linux，没有云端回退。
- 从候选自身的三个工作流逐项移植检查命令，保持测试/迁移/备份恢复命令完全一致。
- 不启用 npm 云缓存；checkout 不持久化凭据；contents:read。
- 临时 MySQL 8.0 容器只绑定本机 127.0.0.1:3306；两个 gate 串行，避免相互占端口；现有其他任务不得同时占用3306。
- 本地 runner 需要 Node setup 下载及 npm registry 网络；此项由实际运行验证，不能由 Docker 可用推断。
- 每 job Summary 记录候选 SHA、harness SHA、runner、job status。
- 不修改候选分支、不更新生产、不访问生产数据库、不执行支付或真实AI调用。
- 完整候选测试 PASS 不替代生产结构复刻、备份恢复、ECS资源验收及微信验收。

## 验证边界
发布前已本机验证 YAML 结构、三个固定 checkout、本地标签、原检查命令逐项一致、Bash 与内嵌 Node 语法、MySQL串行依赖。实际 Runner 结果 PENDING，以 run 日志为准。旧三个失败 run 仍保留为云端额度阻断证据，不能改写为通过。

## 主线顺序
1. 本地 Runner 三个 gate 获得真实回执；失败只针对具体步骤诊断，不反复重跑全套。
2. 结合10月16日用户生产只读日志完成最新事实同步；不要求重复已有成功诊断。
3. 生产备份/隔离恢复与精确 Profile 单列、News七表依赖分别验收。
4. ECS候选资源及权限检查；固定候选含无独立开关的AI质量v3，需要单独范围决策；未批准则另制core-only后继候选。
5. 形成精确发布审批包，之后按受控 promote 与统一微信真机清单收口。

生产运行与构建执行地点不同：本地 Runner 负责验证，ECS继续承载官网及API。现有生产审批边界沿用 CURRENT。

## 首次运行与受控修正
- [run 38864129484](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38864129484)，harness f5e4e4e，实际Runner orangeleetech-wsl-local。
- Node22.23.3安装成功、固定SHA断言成功。小程序typecheck在schools/data.ts:632报TS2783：address/addressSource重复定义；这是候选快照真实代码FAIL，不是计费/网络FAIL。
- 两个DB job因第一版needs依赖被skipped。一次受控修正仅调整harness独立检查条件，原检查命令不变，候选源码不变；随后再跑一次。
- 集成分支当前schools/data.ts已采用末尾显式address/addressSource回退，没有候选快照的重复字段；固定候选为API-only发布包，其历史前端typecheck失败仍需保留，不冒称全树CI PASS。当前小程序发布源码需要独立验证，不能以API归档替代。

## 第二轮实际回执
- [run 38864486844](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38864486844)，harness 3b94ed2501c2714e66b591c57ba6486f194ab1f1，checkout候选eda525c1断言成功。
- verify：小程序快照TS2783 FAIL；导航回归PASS；管理端typecheck/build PASS；API typecheck、215/215 tests、build PASS。整体verify仍FAIL。
- News mysql-gate：实际本地执行，Checkout步骤FAIL，迁移步骤未执行；具体日志下载暂返回BlobNotFound，错误原因待原始日志。不能归因为数据库测试失败。
- Profile job 116856811046：截至本轮查询queued，尚无结果。
- 需要用户保持本地Runner/代理在线，并提供Runner控制台近期输出以排查排队/连接；不盲目重跑全套。
- 旧云端CI/News/Profile仍可能被PR事件触发并在步骤前受额度拦截；本批只新增候选本地入口，未完成日常三工作流全面迁移。不得声称所有未来CI均已本地化。

## 15:21 更新：网络恢复后单项重跑
- 用户Runner控制台07:07:41Z记录SSL连接失败；07:08:47Z将原News job记为Abandoned。GitHub原News job显示Checkout失败，两种回执均保留。没有关闭TLS校验。
- 用户所贴计费拦截属于旧云端run 38865463762/job116857152938，labels=[ubuntu-latest]、steps=[]，与本地验证run不同。
- Profile首次执行job116856811046于07:15:25Z SUCCESS，固定候选SHA校验、双次迁移、旧行/入学年份读写及临时库备份恢复均PASS。
- 因后续Profile已成功连接并完成，判断网络已经恢复；只请求重跑原News job116855528980，未修改源码或测试要求。平台同时重跑下游Profile，属于依赖重跑行为。
- News重跑job116860342198于07:21:02Z完成全部断言，job SUCCESS。真实输出：NEWS_V2_REAL_MYSQL_RELATIONS_PASS / NEWS_V2_REAL_MYSQL_GATE_PASS / DISPOSABLE_NEWS_BACKUP_RESTORE_PASS。
- 因此，固定候选API类型/215测试/构建、News临时MySQL及Profile临时MySQL已有实际PASS证据；旧小程序快照类型检查仍FAIL，整套workflow不能标PASS。
- 后续需当前前端独立验证或修复后继候选、生产结构复刻与备份恢复、ECS资源验收、精确范围审批；未部署。
