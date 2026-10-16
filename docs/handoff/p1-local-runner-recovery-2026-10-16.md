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
- 依次执行 verify → mysql-gate → profile-gate；上游失败时下游 skipped。
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
