# WSL 自托管 GitHub Runner 停止运行与唤醒机制复盘（2026-11-26）

## 事件摘要

2026-11-26，九辰教育小程序发布准备阶段需要运行 PR #16 的 GitHub Actions 自托管 CI。对应 workflow 使用标签：

```yaml
runs-on: [self-hosted, Linux, X64, orangeleetec-local-linux]
```

GitHub Job 长时间处于 `queued`。本机 WSL 发行版处于运行状态，但未发现 Runner 监听进程。该事件暴露了自托管 Runner 的生命周期管理和唤醒机制缺口。

本记录是工程运维事件与后续预防要求，不代表 Runner 已恢复，也不代表 CI 已通过。

## 现场证据

检查环境：Windows 11 + WSL2 + Ubuntu-24.04（Ubuntu 24.04.5 LTS）。

| 检查项 | 现场结果 | 解释 |
|---|---|---|
| WSL 发行版 | `Ubuntu-24.04 Running, VERSION 2` | WSL 发行版当时处于运行状态 |
| Runner 安装目录 | `/home/orangelee-tech/actions-runner` 存在 | 本地 Runner 程序目录仍在 |
| 注册配置 | `.runner` 文件存在 | 注册配置文件存在；内容与标签仍需用 BOM 兼容方式读取核验 |
| Runner 程序版本目录 | `bin.2.338.0`、`bin.2.338.2` 存在 | 保留了多个 Runner 版本目录 |
| Runner 入口脚本 | `config.sh`、`runsvc.sh` 存在 | 配置与服务脚本仍在 |
| Runner 进程 | `Runner.Listener`、`Runner.Worker` 均未发现 | 检查时没有活动 Runner 进程 |
| 用户级 systemd unit | 未发现匹配项 | 尚未证明用户级服务已安装 |
| 系统级 unit 列表 | grep 未发现匹配项 | 尚未确认系统服务是否存在；需结合 sudo 状态检查 |
| `./svc.sh status` | 返回 `Must run as sudo` | 该次调用没有取得服务状态，不能据此判断服务未安装 |
| GitHub Actions | Run `44864254570` / Job `139643869165` 为 `queued` | 对应 CI 尚未被 Runner 接收执行 |

### 诊断脚本的附带问题

首次读取 `.runner` 时，Python 使用 `encoding="utf-8"`，遇到 UTF-8 BOM 后抛出：

```text
JSONDecodeError: Unexpected UTF-8 BOM
```

这是诊断代码的编码处理缺陷，不是 Runner 注册损坏的证据。后续读取 JSON 应使用：

```python
json.loads(Path(".runner").read_text(encoding="utf-8-sig"))
```

并且只输出 Runner 名称、标签和工作目录等非秘密字段，不输出凭据或认证内容。

## 2026-11-26 后续核验：服务未安装

用户补充执行了只读检查，进一步确认：

| 检查项 | 后续结果 | 结论 |
|---|---|---|
| `.runner` 中的名称 | `orangeleetech-wsl-local` | 与本机注册配置名称一致 |
| `.runner` 中的标签字段 | 未读取到 `labels` 字段，脚本显示空数组 | 该文件不是 GitHub 端标签状态的权威来源，不能据此认定标签为空 |
| 工作目录 | `_work` | 本机配置值 |
| `.service` | 不存在 | 未发现 Runner 服务元数据 |
| `sudo ./svc.sh status` | `not installed` | Runner 服务未安装 |
| systemd unit files | 无 Runner 匹配项 | 未发现已安装的 Runner unit |
| systemd loaded units | 无 Runner 匹配项 | 未发现已加载的 Runner unit |

随后核对 GitHub Actions 实际任务：

- Workflow：`.github/workflows/ci.yml`，当前 main 中 `verify` job 使用 `[self-hosted, Linux, X64, orangeleetec-local-linux]`。
- Run：`44864254570`；Job：`139643869165`；目标 SHA：`d93ba079b75f6b48697497668035acf5f223c597`。
- Job 状态：`queued`；GitHub 返回的 `runner_id=0`、`runner_name=""`，表示该 job 尚未分配给 Runner。
- GitHub 任务要求的自定义标签为 `orangeleetec-local-linux`。Runner 注册名称 `orangeleetech-wsl-local` 与自定义标签是不同字段；本机 `.runner` 文件未提供权威标签清单，仍需在仓库 Settings → Actions → Runners 核验 GitHub 端标签。

**更新后的结论：** 当前已确认本机 Runner 服务未安装，且检查时没有 Runner 进程；因此没有自动启动与服务级故障恢复机制。WSL 发行版当时显示 Running，不足以保证 Runner 在线。GitHub job 仍未分配。尚未确认 systemd 是否作为 WSL 的 PID 1 启动，也尚未确认 GitHub 端 Runner 标签是否匹配。

后续恢复前先检查 WSL 的 PID 1、`systemctl is-system-running` 与 `/etc/wsl.conf`。若 systemd 可用，再安装现有 Runner 的服务并设置开机启用；若 systemd 不可用，先评估 WSL systemd 启用方案。不得删除 `.runner`、重新注册 Runner 或创建重复 Runner 来绕过本次问题。

## 2026-11-26 恢复结果：Runner systemd 服务已安装并接收 CI

用户在 Ubuntu-24.04 中执行了以下操作：

```bash
cd ~/actions-runner
sudo ./svc.sh install orangelee-tech
sudo ./svc.sh start
sudo ./svc.sh status
```

执行成功，输出确认：

| 项目 | 实际结果 |
|---|---|
| PID 1 | `systemd` |
| `/etc/wsl.conf` | `[boot] systemd=true` |
| systemd unit | `actions.runner.orange-lee-tech-jiuchen-edu-platform.orangeleetech-wsl-local.service` |
| Loaded | `loaded` |
| Enablement | `enabled`，已链接到 `multi-user.target.wants` |
| Active | `active (running)` |
| 运行用户 | `orangelee-tech`，UID 1000 |
| Runner listener | PID 23913 |
| Runner service wrapper | PID 23903 |
| 注册身份 | 原有 `orangeleetech-wsl-local` |

### GitHub 端接收任务的验证

恢复后重新读取 PR #16 的 CI Run：

- Run：`44864254570`
- Job：`139643869165`（`verify`）
- 固定候选 SHA：`d93ba079b75f6b48697497668035acf5f223c597`
- Run 状态：`in_progress`
- Job 状态：`in_progress`
- 已完成：Set up job、Initialize containers、Checkout、Setup Node.js。
- 正在执行：Install and typecheck miniprogram。

这证明 Runner 已经重新接收该 CI 任务，且至少完成了任务初始化、容器初始化、代码检出和 Node.js 设置。**CI 全部步骤尚未完成，不能记录为 CI PASS。**

### 恢复结论与剩余边界

- 已确认：Runner 原有注册被保留；systemd 服务安装成功、启用成功、当前运行；GitHub Actions 任务已从 queued 进入 in_progress。
- 尚未确认：Windows 开机后是否自动启动 WSL 发行版；Windows 重启后的端到端自动唤醒；Runner 异常退出后的自动恢复实测。
- 后续：检查 Windows Task Scheduler 是否需要增加 WSL 启动任务；完成 Windows 重启验收；继续监控当前 CI 的最终结论。

## 当前结论与未确认事项

**已证实：** 检查时 WSL 发行版仍在运行，但 Runner.Listener / Runner.Worker 均未运行，GitHub Job 因而没有被该 Runner 接收。

**尚未证实：**

- Runner 是否已通过 `svc.sh install` 安装为系统服务；
- 服务是否被禁用、停止或启动失败；
- WSL 是否配置了 systemd，以及 systemd 服务是否可用；
- Runner 注册是否仍有效、在线标签是否包含 `orangeleetec-local-linux`；
- 停止原因究竟是 WSL 生命周期、Windows 休眠/重启、服务未安装、服务异常退出，还是人工停止。

因此，“Runner 睡着了”可作为现象描述，不作为已经查明的根因。当前更准确的状态是：**WSL 运行中，Runner 进程缺席，服务安装与启动机制待核验。**

## 恢复顺序

1. 以 `utf-8-sig` 只读解析 `.runner`，核对 Runner 名称和标签。
2. 在管理员权限下执行 `sudo ./svc.sh status`，核验服务状态；只读确认服务 unit、ExecStart、运行用户和日志路径。
3. 若已有服务，优先恢复原服务，不重新注册 Runner、不生成新 token、不创建重复 Runner。
4. 若未安装服务，先审查 `svc.sh` 与现有配置，再决定是否将当前 Runner 安装为服务。
5. 恢复后核对 GitHub Runner 在线状态及 `self-hosted`、`Linux`、`X64`、`orangeleetec-local-linux` 标签。
6. 由 GitHub 接收一个实际 job，确认从 queued 进入 in_progress 并完成；只以对应 SHA 的真实结果记录 CI 状态。

## 未来客户部署的唤醒与常驻要求

未来为甲方部署自托管 Runner 时，不能只完成安装和注册；必须把“机器启动后 Runner 能自动上线、异常退出后能恢复、GitHub 能识别正确标签”纳入交付验收。

### 原生 Linux 主机 / VM

- 使用官方 Runner 服务脚本注册为 systemd 服务。
- 设置开机启用；确认服务用户为专用、低权限账户，不以 root 运行常规 job。
- 配置并验证服务失败后的自动重启策略；重启间隔应避免快速失败循环。
- 核验网络恢复后 Runner 能重新连接 GitHub。
- 提供服务状态、最近日志、Runner 在线状态和队列积压的监控/告警。
- 通过重启 VM 的实测验收，不能只凭 `systemctl enable` 或安装成功宣告常驻可用。

### Windows + WSL2 主机

WSL2 的发行版生命周期与 Linux 内部 Runner 服务是两层机制，必须同时验收：

1. Windows 启动或指定用户登录后，使用 Windows Task Scheduler / 经批准的启动任务唤起指定 WSL 发行版。
2. WSL 内启用并验证 systemd（若采用 systemd 服务方案）。
3. 在 WSL 内将 Runner 配置为受控服务，验证开机/发行版启动后的自动运行和失败重启。
4. 验证 Windows 重启、WSL 终止、网络断开恢复后，Runner 均能重新上线。
5. 监控 GitHub Runner 在线状态、标签匹配和 queued job；发现离线或队列积压时通知责任人。

不得把“WSL 发行版显示 Running”当作 Runner 在线证明，也不得把“Runner 文件存在”当作服务已启动证明。

## 交付验收清单

- [ ] Runner 使用专用低权限账户运行
- [ ] Runner 名称与标签符合 workflow 的 `runs-on` 要求
- [ ] 开机/发行版启动后自动上线
- [ ] 服务异常退出后自动恢复
- [ ] 网络短暂中断后自动重连
- [ ] Windows/VM 重启后完成真实恢复测试
- [ ] GitHub 在线状态与本机服务状态可交叉核对
- [ ] queued job 能被目标 Runner 接收并完成
- [ ] 日志与告警不泄露注册 token、PAT、仓库 secret 或业务凭据
- [ ] 交付文档说明唤醒入口、状态检查、日志位置和人工恢复步骤

## 后续行动

- [ ] 完成九辰当前 WSL Runner 的 sudo 服务状态核查。
- [ ] 确认是否已有服务；若有则恢复原服务，若无则评估最小服务化方案。
- [ ] 验证标签 `orangeleetec-local-linux` 与 GitHub 在线状态。
- [ ] 恢复 PR #16 当前固定 SHA 对应 CI，记录真实结果。
- [ ] 将上述常驻与唤醒要求纳入未来甲方 Runner 部署交付模板。

## 影响范围

本事件影响 GitHub 自托管 CI 的任务调度与执行可用性。它本身不代表小程序代码失败，不代表数据库故障，不代表 ECS 生产 API 故障，也不影响已通过的 2026-11-21 真实备份迁移隔离演练结果。

本文件记录运维事件、证据边界和预防要求；不包含任何密码、token、密钥或真实业务数据。
