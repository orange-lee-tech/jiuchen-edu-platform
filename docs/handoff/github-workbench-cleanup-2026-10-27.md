# GitHub 工作台规整回执（2026-10-27）

## 已完成：PR #9 合并

- PR: https://github.com/orange-lee-tech/jiuchen-edu-platform/pull/9
- PR head: `b6318c748e26c868374a7fdd92c345da8317ed44`
- Merge commit: `8778fde63cfaa74170bfb50090fbac7c623278d9`
- PR-head CI run [#40489949057](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/40489949057)：success。
- Merge commit main-push CI run [#40491735769](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/40491735769)：success。
- PR 合并只统一源码；未执行 ECS 部署、生产 DDL、服务切流、支付开关或微信正式发布。

## 已完成：废弃工作流收敛

已移除以下五条固定 SHA、已标记 deprecated 的 P1 工作流。它们只响应自身文件在历史 `p1/foundation` 分支上的 push 或手动 dispatch，不承担现役主干门禁。删除工作流文件不删除 GitHub 已有的运行记录。

- `.github/workflows/p1-fixed-candidate-local.yml`
- `.github/workflows/p1-frontend-release-local.yml`
- `.github/workflows/p1-isolated-mixed-local.yml`
- `.github/workflows/p1-mixed-charset-local.yml`
- `.github/workflows/p1-release-archive-local.yml`

现役工作流登记保留三条：`ci.yml`、`news-v2-mysql-gate.yml`、`profile-mysql-gate.yml`。登记文件已同步收敛。

## 远端分支清理状态

本次 commit **没有删除任何远端分支引用**。剪枝必须在当前 SHA 与 main 祖先关系重新核验后进行。

### 已批准的 10 个 main 祖先分支（待脚本再次核验并剪除）

| Branch | Expected HEAD |
|---|---|
| `codex/p1-device-contact-favorites-2026-10-19` | `8bbbe7db4f5fbdda10eb0dec90de1f73961f1d5f` |
| `codex/p1-favorites-contact-api-2026-10-19` | `72a91c6a727660067bdc4e737fd2e54230020816` |
| `codex/p1-isolated-api-2026-10-14` | `eda525c1a2276af90668849b669e9bce19a4fd7d` |
| `codex/p1-isolated-api-2026-10-16` | `e5908185b3b460a04a8102b7e2a30b663623ac30` |
| `codex/p1-isolated-api-2026-10-17` | `1b8ae8b3c5a1285b84ab6b5f573ca9db5d93d0a7` |
| `codex/p1-news-content-isolated-2026-10-18` | `858aa6a5bebbdb88346c6282f691b4976886b935` |
| `codex/release-a-2026-10-12` | `8cc4bb85ffdf3e86e7a13a89d119f1b110491e48` |
| `p1/release-a-2026-10-12` | `2b1c165d0428e2d22cbed7620fd3cc936e568a1b` |
| `p1/foundation` | `7cc8f7596d350cdd6a5d9eeee15a13ab2402053c` |
| `fix/identity-poster-ai-cost-20261026` | `140ee0365afdcab39ee0cc39d1b5b66ea989650a` |

### 另外 11 个含独有提交的历史分支（保留，逐项审查）

`codex/commercial-closed-loop-v2`, `codex/device-acceptance`, `hotfix/read-only-schedule-2026-10-10`, `p1/assessment-background-client-gate-20261006`, `p1/rc-api-ea8c-readonly-date-2026-10-10`, `p1/release-api-core-closeout-20261007`, `p1/release-identity-bootstrap-20261008`, `p1/release-identity-bootstrap-v2-20261008`, `p1/release-readonly-schedule-2026-10-10`, `p2/prototype-shell`, `p2/v1-shell`。

对其中有价值的独有提交，先创建可追溯归档标签，再删除分支引用；不改写、不删除提交历史。

### PR #9 源分支（单独处理）

`codex/virtual-payment-jc000-20261026` 的 HEAD 为 `b6318c748e26c868374a7fdd92c345da8317ed44`，已由 `main` 包含。它不在上面获批的 10 分支列表内；建议完成 SHA/祖先核验后单独删除该远端分支引用。该项尚未执行，避免默默扩大已确认的删除清单。

## 本地工作树与文件

- 已收到的本地只读审计显示主工作目录仍在 PR 分支，另有未提交的 `project.config.json`、发布暂存包、运维脚本、数据源及私有/忽略文件。
- 本次没有清理本地文件、分支或 worktree。禁止运行 `git clean -fdx`、`git reset --hard`。
- 先检查每个 worktree 自身的 `git status --short` 与 HEAD，再决定是否移除。标记为 `prunable` 的 worktree 记录需先 dry-run 核对。
- 本地同步顺序：保留未提交和未跟踪文件 → `git fetch origin --prune` → 检查状态 → 切换到 `main` → `git pull --ff-only origin main` → 核对 HEAD 与 GitHub main 一致。

## 后续工作

完成远端剪枝和本地同步后，进入已批准的蓝金温润 UI/UX 改版。优先「今天」工作台、今日/明日课表、今日规划摘要、学期切换。此次仓库规整未改动应用业务代码。
