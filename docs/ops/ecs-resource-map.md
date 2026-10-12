# 九辰 ECS 资源与基础设施地图 V1.0（2026-10-13）

**性质：只读盘点及治理台账，不授权删除、停服、生产 DDL 或发布。** 数据源为用户 2026-10-12 23:59 至 2026-10-13 00:14 CST 的 ECS 终端回执；数值为当时快照，不是实时监控。修改前重新核实。重大变更以 `docs/handoff/CURRENT.md` 和 `CONSTITUTION.md` 为准。

## 1. 资源容量与生产基线

| 指标 | 实测 | 意义 |
| --- | --- | --- |
| OS / CPU | Alibaba Cloud Linux 3 / 2 vCPU | 宿主机共享承载多业务 |
| RAM | 约 1.8 GiB；used 653 MiB；available 969 MiB | `available` 包含可回收缓存，并非每个服务独立额度 |
| Swap | 2 GiB，已用约 168 MiB | 不应将 Swap 作为生产稳定内存 |
| 磁盘 | ext4 `/dev/vda3`，40G / 已用18G / 可用20G，49% | 空间尚充足 |
| inode | 已用21% | 暂无 inode 紧张 |
| 生产 API | active `b150d2c5c8720aac8d48fbd0395d8db9c408bc63`；previous `ea8c971008a9efd042ec43fdc62398e136262259` | 10-13 回执；未经新核对不得视为永久不变 |
| API 约束 | `jiuchen-api.service` User=jiuchen-api；MemoryMax=256MiB；CPUQuota=50%；TasksMax=64 | 禁止绕过 release 管理 |
| 健康 | 公开 `/health/live` HTTP 200，服务 active | 健康不代替业务验收 |

## 2. 主要磁盘资产（含保护等级）

| 资产 | 快照占用 | 级别 | 治理动作 / 解除条件 |
| --- | ---: | --- | --- |
| `/var/lib/docker` | 首次统计 ~5.0G；第二次 `du -xhd1` ~2.7G，口径不同 | 严格保护 | Harbor/官网/NPM/Portainer 全在运行，严禁 `prune`、删卷/overlay；辨别 bind mount、overlay 与数据去重后再量化 |
| `/opt/jiuchen-api/releases` | ~1.6G，12份 | 当前及回滚绝对保护 | 仅人工确认其余 release 无 rollback/追溯引用后制定保留策略 |
| `/opt/jiuchen-api/staging` | ~904M | 待核清理 | 保留已上传 Release A `incoming` 和未完成构建/异常现场；核对遗留 build 目录后审批 |
| `/var/log` | ~1.7G | 可治理，不可清空 | journal ~913M；Harbor ~539M；先核对保留策略/增长率/归档 |
| `/opt/jiuchen-releases` | ~674M（旧站点代码，node_modules ~601M） | 待核实 | 2026-06-04 最后修改；可能仍与官网/历史回滚关联 |
| `/root/.npm` | ~645M | 清理候选 | 确认无构建工作和依赖后，可提出独立清理批准 |
| `/opt/jiuchen-api-smoke` | ~161M | 清理候选 | 最后修改2026-10-01，须核实是否被自动化引用 |
| `/root/jiuchen-backups` | ~101M | 保护 / 待核 | 不得未经有效替代备份、恢复验证删除 |
| `/www` | ~792M | 核心保护 | 官网资源，不碰 |
| `/opt/jiuchen-api/runtime` | ~203M | 核心保护 | 生产 Node runtime |
| `/opt/jiuchen-api/shared/cases` | ~656 KiB | 核心私有数据 | RAG 真实案例文件，禁止复制到归档/输出 |
| `/opt/jiuchen-api/staging/incoming` | ~268 KiB | 保留 | Release A 上传归档，SHA-256 已核实 |

目录占用与 Docker 报告不是同一统计口径，不能叠加作为“可删除空间”。**安全可删除容量：尚未核定，为 0 GiB 已获批准。**

## 3. 功能、服务和端口（资产保护）

- **API**：独立 systemd；服务工作目录 `/opt/jiuchen-api/current/services/api`，Node `dist/server.js`，内网监听 `172.25.80.203:3100`，生产环境文件 `/etc/jiuchen-api/production.env`。
- **案例**：`ASSESSMENT_CASE_DATA_ROOT` 实测设置且精确匹配 `/opt/jiuchen-api/shared/cases`；`jiuchen-api` 用户可读 `ai/rag/v1.0.0/rag_reference_production_all.jsonl`。此前 `current/data-source/cases` 假设已否定；不得复制案例入 release。
- **Docker**：11个运行中容器：Harbor 的 nginx、core、portal、db(PostgreSQL)、Redis、registry、registryctl、jobservice、log；`nginx-app`（Nginx Proxy Manager）；Portainer。配置与持久化卷严格保护。
- **服务管理**：Aegis、Aliyun Assist、CloudMonitor、HBR backup agent、nginx、Docker/containerd 等都运行中；运行不等于备份可恢复。
- **监听**：80/443 Nginx Proxy Manager；5001 Harbor nginx；5002 Portainer；5003 NPM 管理界面；8088 宿主机 nginx；3100 API 内网；5000 宿主 dotnet 进程归属/安全组待查。0.0.0.0 监听不等于公网可达，必须独立核安全组/iptables/firewalld。
- **外部**：生产 MySQL/腾讯 CloudBase/微信官方 API/阿里百炼等为外部依赖候选，精确网络拓扑与故障域尚需核定；切忌把 Harbor PostgreSQL 误当小程序 MySQL。

## 4. News timer 配置漂移——已核实事实

- `jiuchen-news-sync.timer` active，`/etc/systemd/system/jiuchen-news-sync.timer`；`OnUnitActiveUSec=30min`、`OnBootUSec=10min`、`AccuracyUSec=1min`、`RandomizedDelayUSec=2min`、`Persistent=yes`。
- `jiuchen-news-sync.service` 为 oneshot，`User=jiuchen-api`，工作目录 `/opt/jiuchen-api/current/services/api`，`ExecStart` 指向 `/opt/jiuchen-api/current/services/api/dist/scripts/sync-official-account.js`，加载生产 `production.env`。
- 2026-10-12 晚多次成功结束约2–4秒，回执稳定 `total=21,created=0,updated=21`；不能等同微信源端已核实的40个发布组，也不能证明实质字段每次都变化。
- **任务独立资源与运行时限均未限制**：`MemoryMax=infinity`、`CPUQuotaPerSecUSec=infinity`、`TimeoutStartUSec=infinity`。下一运维批按实测峰值定义上限及合理超时；切勿直接设想象数值。
- 与早期交接“timer 未安装”的说法冲突，**以 ECS 为准**。Release A staging 和 timer 资源治理分开；当前不得禁用/重启/覆盖 timer。

## 5. 风险矩阵

| 风险 | 优先级 | 当前缓解措施 |
| --- | --- | --- |
| Release A 无数据库 smoke 与真实业务负载差异；256MiB 配额下余量不足 | P0 | 脚本静态审查；候选只到 staging，不自动 promote |
| News timer 无限资源和频繁全量更新 | P1 | 单独申请受限 timer 配置与日志/内存观察 |
| 官网/Harbor/API 共用小主机 | P1 | 严禁单次维护跨服务修改；保留核心回滚 |
| journal/Harbor log 大 | P1 | 先查保留策略与可恢复证据，调整后观察 |
| 备份代理 active、恢复能力未验 | P1 | 另立备份/恢复 Gate，不以 HBR running 代替备份成功 |
| 多公网监听（Portainer/NPM/Harbor/未知 dotnet） | P1 | 安全组核查，最小开放权限需另批 |
| Docker 数据大小统计差异 | P2 | 拆解目录/挂载，禁用盲目清理 |
| 旧代码、staging、npm caches 占用 | P2 | 按引用和版本保留清单形成可审批清理包 |

## 6. 近期施工 Gate

- **Release A**：代码候选 `8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`；Windows 与 ECS 发布包 SHA-256 `8aa28262294d647ca3bd27ed782e77e941e28c904be95051576d547a6ada633f` PASS，已上传；**未执行 staging 构建、无数据库 smoke、promote**。修订脚本审查见 `docs/handoff/release-a-staging-review-2026-10-13.md`。
- 这轮 ECS 只读资产盘点已经收口，无需再要求用户重复执行前述命令。未授权任何清理或 timer 修改。
- 后续先完成受控 staging；官网保护、Harbor、配置/私有案例与正式 API 一律不随动；生产上线需要新一轮明示审批。
