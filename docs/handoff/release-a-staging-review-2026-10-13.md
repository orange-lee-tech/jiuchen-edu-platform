# Release A ECS staging 静态复核｜2026-10-13

**状态：REVIEWED / REVISION_REQUIRED；未执行 staging 构建、临时服务、DDL、promote 或 timer 修改。** 用户决定今晚停止 Codex/ECS 施工，明天继续。本文只为交接，不是生产授权。

## 锁定事实

- 生产 active/approved：`b150d2c5c8720aac8d48fbd0395d8db9c408bc63`；previous/rollback：`ea8c971008a9efd042ec43fdc62398e136262259`。以上来自用户 ECS 回执，执行前仍须再次核对。
- Release A 候选：`8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`，候选分支 `codex/release-a-2026-10-12`；对应 GitHub CI `38271759179` PASS。候选归档已经上传至 `/opt/jiuchen-api/staging/incoming/`，ECS sha256sum 校验 PASS；摘要 `8aa28262294d647ca3bd27ed782e77e941e28c904be95051576d547a6ada633f`。不需要重复上传。
- ECS：2 vCPU、约 1.8GiB RAM、2GiB Swap、40GiB ext4；审计时可用内存约 969MiB、系统盘可用约 20GiB。生产 API systemd MemoryMax=256MiB、CPUQuota=50%、TasksMax=64；只读健康检查 200。生产案例为 `/opt/jiuchen-api/shared/cases/ai/rag/v1.0.0/rag_reference_production_all.jsonl`，不是 `current/data-source/cases`；禁止把私有案例复制进候选。环境变量 `ASSESSMENT_CASE_DATA_ROOT` 可配置，值此前未核实。
- `jiuchen-news-sync.timer` **现已 active**，约 30–32 分钟触发一次。服务 `User=jiuchen-api`，目前 MemoryMax/CPUQuota/TimeoutStartSec 均为 infinity；10-12 晚多次回执 `total=21, created=0, updated=21`，不能据此宣称已同步40组或每次有实质数据变动。timer 治理单独立项，**不夹带 Release A**。

## 对 Codex 所交 702 行 staging 脚本的静态审查

结论：**不可直接原样运行。** 脚本并未写生产 current、approved-release、staging/READY、releases，也不执行生产 DDL/promote，但以下事项必须修订、实测或在输出中降级表述：

1. **案例数据检查不要硬编码 748 行作为固定业务契约。** 需确认真实数据模式、版本、访问权限及文件完整性；若确有固定版本行数应附可信证据。环境文件 grep 的单一写法也可能拒绝合法引号/空格设置；只校验配置有效及目录可读，绝不输出凭据。
2. **256MiB hard / 250MiB acceptance 只有 6MiB 余量**，过于接近 OOM。无数据库健康端点仅能做有限空载 smoke，不足以批准生产切流；需实测峰值、cgroup OOM、资源增长趋势及生产前后监控。不能因一次 `/health/live` 200 宣称具备实际业务承载能力。
3. **隔离 smoke 必须保持 `env -i`、不加载 production.env、不提供数据库参数**。候选 `services/api/src/app.ts` 的 `/health/config` 确有 `databaseUrlConfigured`、`splitDatabaseConfigComplete` 和 `assessmentBackgroundExecution` 字段，`/health` 在 DB 未配置时确实返回 `not_configured`。onReady 调用 worker.start()，务必保持无数据库条件下空实现，不调用业务或生产写入接口。
4. **构建运行环境仍需适配验证**：`jiuchen-deploy` 用户及文件权限、systemd-run 支持的属性、`ProtectSystem=strict` 对 npm 构建/测试的影响，以及构建时 512MiB cgroup 对同机 Harbor/网站/API 的影响。首次运行失败只能标记脚本/环境失败，不能自动诊断为业务代码有故障。
5. 解压包路径与类型检查、SHA、flock、工作目录隔离及失败留痕原则可保留；在执行前使用 `bash -n`、在不会误修改生产的离线环境核对完整脚本，防止人工粘贴截断或错行。
6. **命名 Gate**：`STAGING_BUILT`（受控构建）→ `NO_DB_SMOKE_PASS`（无数据库测试）→ `READY_FOR_PRODUCTION_APPROVAL`（审批前完整审查）→ `DEPLOYED` → `REAL_BUSINESS_PASS`。脚本输出 `RELEASE_A_STAGING_READY` 不代表后三级完成。
7. Release A 代码差异和锁文件已经审计，**不因为 timer 实存、案例文件路径或资源清理而扩大本次源代码/业务范围**。不得在今晚尝试 promote。

## ECS 资源地图 V1 重点资产（只读口径）

- `/opt/jiuchen-api` ~2.7GiB：releases ~1.6GiB（12份）、staging ~904MiB；保护 active、previous、候选归档及其他尚未识别的引用。
- `/opt/jiuchen-releases` ~674MiB：历史网站工程，含 node_modules ~601MiB；归属未确认，不能删除。
- `/root/.npm` ~645MiB；`/opt/jiuchen-api-smoke` ~161MiB：清理候选但须核对引用和备份。
- `/var/log` ~1.7GiB，其中 journal ~913MiB、Harbor ~539MiB；先设计保留和轮换，不能清空证据。
- Docker 活跃11容器，Harbor/Postgres/Redis/Registry/NPM/Portainer 均属严格保护；`/var/lib/docker` 不运行 prune/delete。
- 5000–5003 等端口监听已见，未证明公网可达；后续结合安全组和端口映射核查。
- 系统备份代理运行不等于备份可恢复；备份演练独立 Gate。

## 明日仅需继续的工作

1. 以本页及 `docs/handoff/CURRENT.md` 为入口，修订 staging 脚本，不重复上传归档、不新开功能开发。
2. 先做语法/权限/资源保护静态核对，再在用户批准时执行 staging 构建、无数据库 smoke；结果必须报告峰值和 OOM。
3. 保留生产 active/rollback、官网、Harbor、Docker、真实数据、timer 原状。即使 staging PASS，仍需用户另批生产 promote。
4. ECS 资源图后续按「核心保护 / 可调配 / 待审批清理 / 安全风险」持续更新；今晚不清理。
