# 甲方管理员本地备份与选择性恢复合同（2026-10-17 状态）

甲方管理员在自己的电脑上定期手动操作；不要求开发者赠送或常驻 Mac mini、付费云备份、24 小时 Runner。业务范围是小程序、公司官网及必要共享入口。保留模块化加密下载、数据类别说明、只读诊断、选择性恢复计划、隔离演练和经审查的生产恢复；范围是 miniprogram / website / all，组件单独选择。正式生产覆盖尚未实现。

## 资产与敏感性

| 组件 | 已知来源 | 管理要求 |
| --- | --- | --- |
| database | 腾讯 CloudBase MySQL，线上业务真相源 | 用户档案、课表、AI结果等个人资料；管理员持有加密文件，原始 SQL/密码不进 Git/聊天/CI |
| user-files | /opt/jiuchen-api/shared/cases | 私有案例，可能含个人信息；独立归档 |
| api / runtime | /opt/jiuchen-api/current 的真实 release；Node22 运行时 | 保留真实目标与权限；代码包仍按潜在敏感文件管理 |
| website | /www/wwwroot/jiuchen-current 指向的真实 release，最后见 20260809-115206-2fecbaf0、22MiB | 备份内容及指针，恢复时不能覆盖小程序 |
| secrets | /etc/jiuchen-api 及服务 unit | 密钥配置高度敏感，事故默认保留现役 |
| entry | /etc/nginx；NPM 的 data、letsencrypt、自定义 app/index.js | 共享代理、证书私钥；SQLite 用在线 .backup 一致快照，恢复前逐路由审核 |

CloudBase 持久外部对象、官网附属数据库、外部 nginx include/证书及额外 unit/timer 依赖仍需盘点；当前 fullBusinessCoverage=false。Harbor/Portainer 只登记依赖，未经证实不整机复制或修改。

## 验收和保留

管理员每次下载必须知晓 database.jcb 和 user-files.jcb 含用户数据、secrets.jcb 和 entry.jcb 含密钥/证书、程序归档也可能含历史资料。加密文件与密码分开保管，目录权限0700/文件0600；不要上传到 Git、Actions、聊天或公开网盘。逐组件下载后解密认证，失败标 PARTIAL；只有全部所选且必需组件完成才能标 downloadVerified，不代表 fullBusinessCoverage 或 productionBackupRestored。

最多三代是三套独立可恢复集合；上线前固定恢复点计入三代。当前轮换仅有合成算法测试，未接入自动清理。区间备份是将来优化，必须有完整基线、所有新增/更新/删除事件、结构版本及整链恢复证明；不能用有损 JSON 特征取代业务真相。旧基线被后续区间引用时，不得清掉。程序可按哈希去重，用户历史数据按业务保留需求保留。

恢复按 scope 和 component 输出影响计划；先验证归档、权限、依赖、隔离目标和回退点。网站/小程序分别恢复，共享入口单列授权；数据库默认隔离恢复，覆盖生产需要明确数据丢失窗口和独立批准。ECS API 版本使用不可变 releases 和既有 promote 健康回滚机制，现役/上一稳定/额外稳定三代版本的清理与本地备份代际分开判断。现有工具仅可把选定明文组件上传到 ECS 私有 staging，不能切流或执行生产 SQL。

## 实际证据（截至 2026-10-17）

- WSL Ubuntu 24.04、管理员自托管 Runner、Docker mysql:8.0 本机镜像已存在。ECS 不安装 MySQL 客户端，也不动其 Docker、官网、NPM、Harbor、Portainer。
- 10-16 现场 doctor：已知官网/API 源站、列出的资产路径和 sqlite3 工具全 true；只表示基础检查通过。
- 第一轮备份前六组件已下载，数据库失败留 PARTIAL；v2 断点校验并复用原密文，不重下完整包。用户尚未提供成功备份目录或隔离恢复回执。
- 10-17 v3 db-check：DB_CLIENT_BACKEND=local-mysql8；REMOTE_CONFIG_READ 和 SSH_TUNNEL_CREATE 已运行；MYSQL_CONNECT_AND_ENGINE_CHECK 返回 MYSQL_ERROR_2026。官方码意为 SSL connection error，具体 TLS 根因未确认。数据导出未完成，不擅自关闭 TLS 或重试全部组件。
- 工具 [README](../../tools/maintenance/README.md) 的12项本地合成测试 PASS；没有实际 MySQL导出、隔离恢复或生产覆盖验收。productionBackupRestored=false，fullBusinessCoverage=false。

备份功能在 [正式发布业务排序](../handoff/p1-release-open-items-2026-10-17.md) 最后；Profile/News/商业表任何生产 DDL 前仍须最小可恢复点。工期中的业务功能可并行施工和有限体验版验证，不把安全门槛伪装为已经通过。
