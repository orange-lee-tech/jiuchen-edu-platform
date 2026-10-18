# 九辰管理员备份工具

## 当前验收边界

已实现：组件化加密下载、下载后逐项解密比对、资料分类说明、只读故障诊断、选择性恢复计划、选择性上传到 ECS 私有隔离目录、WSL 独立 MySQL 恢复演练接口。

**尚未完成现场验收。没有生产覆盖命令。** 当前接口不切换 current、不导入生产数据库、不修改网站、NPM、环境变量或定时任务。备份模块整体不能标记已验收，也不能据此解除生产迁移 Gate。

本地 12 项测试覆盖：加密往返/错误密码/篡改、危险归档、跨业务选择限制、固定恢复点保留、官网真实release归档、Python3.6远程脚本语法。当前开发环境无 MySQL/Docker/SSH 生产连接，真实备份、数据库演练、Linux 权限和网络尚待 WSL 执行。

## 在管理员 WSL 执行

工具目录放在 WSL home；不要把解密文件或备份目录放到 Windows 共享桌面。需要 Python3.10+、OpenSSH、官方 MySQL8 mysql/mysqldump，数据库演练另需 WSL Docker 与已有 mysql:8.0 镜像。ECS 不安装额外软件。首次执行 start.sh 会建立独立 Python 环境并安装 cryptography，不依赖常驻 Runner。

```bash
cd ~/jiuchen-maintenance
bash start.sh doctor --host root@121.40.168.181
bash start.sh backup --host root@121.40.168.181 --output ~/jiuchen-backups --pin
```

SSH 使用原有主机校验，首次指纹必须核实；不关闭校验。备份密码输入两次，不会出现在命令参数中。下载失败留 PARTIAL；不要拿它恢复。成功标记 `KNOWN_COMPONENTS_DOWNLOAD_VERIFIED` 仅代表已知组件传输/认证通过。

管理员只需回传 doctor 的布尔检查与最终状态；不要发备份、SQL、环境文件、密钥、私有案例或数据库原始报错。通用 FAILED 时停止，由维护人员定位当前最后显示的组件，不要求管理员猜测覆盖对象。

## 每次下载管理员应知道的内容

| 加密组件 | 内容 | 日常救火默认策略 |
| --- | --- | --- |
| database.jcb | 全业务 SQL，含用户档案、课表、评估等个人资料 | 保留当前数据；优先隔离恢复 |
| user-files.jcb | 私有案例、业务文件 | 保留当前数据 |
| secrets.jcb | 环境、密钥、服务配置 | 保留当前配置 |
| entry.jcb | NPM一致性SQLite、代理配置、证书私钥、宿主nginx、自定义index.js | 共享依赖，需逐路由差异审核 |
| api.jcb | current真实release程序与依赖 | 可单独计划恢复 |
| website.jcb | 官网current真实release及静态文件 | 可单独计划恢复 |
| runtime.jcb | 已知Node22运行时 | 默认保留当前运行时 |

所有组件按敏感文件管理，程序包也可能带历史内置资料。管理员本机目录权限0700，文件0600；使用 AES256-GCM，Scrypt派生密钥，认证覆盖头部和密文。密码丢失不能恢复，和备份分开保管。每代有《管理员必读.txt》。临时明文在私有临时目录，正常退出自动清理；强制杀进程/电脑断电后须由维护人员排查临时残留。不声称安全擦除或跨组件时间点一致性。

## 故障判断与选择性接口

`doctor` 仅看已知源站及文件存在性。API健康读取database=ok，检查地址使用172.25.80.203:3100。官网源站暂用127.0.0.1:8088；如果官网虚拟主机要求Host头，此结果需要维护人员修正配置，不可直接判网站坏。不能代替公网DNS/TLS、证书有效期、数据库内容或真实业务验收。

```bash
# 把下面的时间目录替换成备份成功输出的真实目录
backup="$HOME/jiuchen-backups/实际时间目录"
bash start.sh plan --backup "$backup" --scope website --components website
bash start.sh plan --backup "$backup" --scope miniprogram --components api
bash start.sh plan --backup "$backup" --scope all --components website,api
# 仅上传选定组件到随机的0700隔离目录，校验上传前后SHA256，不做覆盖
bash start.sh stage --backup "$backup" --scope website --components website --host root@121.40.168.181
# 仅在本机WSL新建独立容器，禁网、事件调度关闭，恢复后检查表，最后删除本次容器和其卷
bash start.sh rehearse-db --backup "$backup"
```

scope约束：website只能选website；miniprogram能选api/user-files/database/runtime；共享secrets/entry必须显式选择all。即使选择all，也只处理指定components，不自动全选。计划显示默认保留项。

隔离库演练仅证明SQL成功导入和mysqlcheck通过，不证明与源库逐行等价、迁移通过或业务通过。导出时要求基表都是InnoDB；禁止同时做DDL。使用官方mysqldump单事务、触发器/事件/例程/视图支持、二进制十六进制导出；权限不足或不支持参数即失败，不静默缺项。经SSH转发连接云库，DB密码只在管理员进程内和0600临时配置中，MySQL连接强制加密。

## 覆盖与保留的未完成验收项

1. CloudBase持久对象、网站附属数据库、nginx外部include/证书路径尚未确认。`fullBusinessCoverage=false`，不冒称完整业务备份。
2. secrets当前覆盖/etc/jiuchen-api与主服务unit；外部unit drop-in、timer与自定义脚本依赖仍需探测补齐。
3. NPM使用sqlite3在线.backup加完整性检查替换归档中的live DB，不直接复制活动SQLite。代理其他文件、私有案例、SQL之间没有统一停写点，不能声称跨组件一致。
4. ECS只会临时创建/清理本次SQLite快照；选择性stage留下敏感明文，仅维护人员批准恢复/作废后按明确目录清理。尚无自动清理staging或release的命令，避免误删现役/上代/READY。
5. 保留三代算法已有测试，但**尚未接到生产清理**。已知组件覆盖未闭合前不删除旧备份；PIN计入三代。不能把下载成功自动当成可以清掉最后可靠恢复点。
6. 生产覆盖适配仍需实现并演练：官网不可变目录原子切换与回退；API复用现有approved-release/READY/promote，不绕过它；生产数据导入需核对明确范围、停写和备份后数据损失窗口；共享入口恢复须逐路由审核。当前脚本不会猜测这些操作。

该段记录首批工具的验收顺序。最新现场错误与发布优先级以末尾记录及docs/handoff/CURRENT.md为准。

## 失败续传（v2）

现场首次下载在database组件以ValueError停止；前六项的receipt保留。修复合法带连字符库名被拒、IPv6主机兼容，增加固定的脱敏配置错误码。具体现场触发字段仍须重试回执确认，不推断或打印真实库名/主机/密码。

```bash
bash start.sh backup --host root@121.40.168.181 --output ~/jiuchen-backups --pin --resume-latest
```

选择目录内最新PARTIAL，输入原密码。所有已完成组件必须先通过密文哈希和解密认证，再原样复用；不重新下载或覆盖。仅补齐未完成组件。逐组件原子写receipt，失败保留PARTIAL。续传后明确登记各组件采集时间不同，不声称同一时间点业务一致性。新增三项测试：带连字符库名/IPv6、危险配置与错误消息脱敏、保留已完成密文的断点续传。总计9项本地测试通过，不代表现场数据库导出或恢复已通过。

## 区间封存与可恢复性

区间备份是后续优化方向，不是当前CLI已具备的功能。基线保存完整可恢复状态；后续变更块须覆盖新增、更新、删除标记、结构版本、前后水位及关联依赖，并经过整链恢复验证。JSON可作为结构化交换格式，但不能替代一致性、外键/索引/触发器/例程/事件、删除记录及文件对象的恢复保障。不要对用户原始事实做有损特征提取后冒充备份。

用户仍需使用的早期数据应留在在线数据库，或进入已验证的可查询归档，不按时间直接删除。程序/运行时可按版本哈希去重复，不必每个时间块重复存一份。最多三代指三套完整可恢复集合；若采用增量，一代包括其基线与全部依赖块。旧基线被依赖时不得删除，先合并并验证新的基线再轮换。当前仍用官方SQL一致性导出建立首次恢复基线；尚未实现增量追踪、归档查询或自动删除。

## v3 数据库分阶段诊断（2026-10-17）

现场v2续传在database阶段CalledProcessError，具体子命令及原因未明，WSL网络有变动。此前doctor全部通过，不当作今天网络证据。

新增只读入口：`bash start.sh db-check --host root@121.40.168.181`。依次输出客户端后端、REMOTE_CONFIG_READ、SSH_TUNNEL_CREATE、MYSQL_CONNECT_AND_ENGINE_CHECK。备份继续输出MYSQLDUMP_FULL_EXPORT。故障只输出固定阶段名、MySQL数字错误码或TIMEOUT/CLIENT_OPTION_UNSUPPORTED/SSH_TRANSPORT_FAILED，不输出原始stderr、连接串、用户名、主机或SQL数据。SSH增加连接与保活时限。

本机mysql/mysqldump均为官方8系列时直接使用；否则检查本机已有mysql:8.0镜像，客户端以临时只读容器运行，复用WSL host网络访问SSH本地隧道，只读挂载本次0600凭据配置。禁止自动pull；镜像缺失或Docker未运行即停止。不会启动数据库服务、修改Docker配置或使用ECS Docker。TLS仍为REQUIRED，不通过降低安全性绕过连接故障。需要现场验证该Docker客户端路径；本地仅做命令构造、错误脱敏和后端选择合成测试。

新增3项测试，总计12项通过。只读连接检查不证明mysqldump例程/事件等导出权限，最终以完整导出和隔离恢复回执验收。网络有变化时无需先重配代理或重启WSL，先按检查结果处理。所有既有加密备份继续保留。

## 2026-10-18 最小恢复点条件通道（现场仍待验）

生产 root 只读探针证实：当前 MySQL `have_ssl=DISABLED`、`require_secure_transport=OFF`、当前会话无 TLS；现有 WSL 官方 MySQL8 客户端强制 `ssl-mode=REQUIRED`，所以报 `MYSQL_ERROR_2026`。`dbEndpointLoopback=false` 不足以判定是否为 ECS 同机内网 IP。此修改只在管理员 WSL 的 `maintain.py`，不会修改生产库服务、TLS 配置、ECS 或活动 API。

新工具先经现有 SSH ControlMaster 建立 WSL `127.0.0.1` 到 ECS 数据库地址的加密隧道；只读解析 MySQL 握手能力位。若服务端支持 TLS，继续 `ssl-mode=REQUIRED`。若不支持 TLS，则在 ECS 使用现役配置中的同一地址重新核对：必须是数字 IP 且精确属于 ECS 本机网卡，比较地址哈希防止两次配置读取不一致；通过才对本次 WSL→ECS SSH 隧道内的 MySQL 客户端设 `ssl-mode=DISABLED`。其他地址返回 `DB_TLS_UNAVAILABLE_REMOTE_ENDPOINT`，不发送数据库账号或数据。由此只涵盖 ECS 本机 DB 端点；如果是另一个主机，需单独建立端到端加密方案。

管理员从本分支下载最新 `tools/maintenance/maintain.py` 校验 SHA 后替换 WSL 工具目录，先执行 `bash start.sh db-check --host root@121.40.168.181`，期待 `DB_TRANSPORT=SSH_TUNNEL_TO_ECS_LOCAL_INTERFACE` 与 `DB_READONLY_CONNECTION_CHECK_PASS`。再用原备份密码 `backup --resume-latest` 只补 database；成功后执行 `rehearse-db` 并记录隔离恢复回执。未取得现场回执前，`productionBackupRestored=false`，不进行生产 DDL。完整备份和隔离演练可能需要管理员现场等待，长线区间化仍后置。

本地 `python3 -m unittest discover -s tools/maintenance -p test_maintenance.py` 15/15 PASS；Python 编译及内嵌 ECS Node 检查器语法 PASS。合成测试覆盖握手 TLS 位、同机允许、异机拒绝、TLS 可用时强制连接。它们不代表现场连库或恢复成功。

## 2026-10-17 现场 SSL 回执与优先级

管理员 v3 db-check：DB_CLIENT_BACKEND=local-mysql8，REMOTE_CONFIG_READ 与 SSH_TUNNEL_CREATE 已执行；MYSQL_CONNECT_AND_ENGINE_CHECK 失败 MYSQL_ERROR_2026。官方 MySQL 错误码为 SSL connection error，尚不能据此判定具体 TLS 协议、证书、代理或网络根因。数据库组件未导出，先前六组件保留PARTIAL；隔离恢复及生产覆盖尚未运行。

备份建设在正式发布业务排序中列末位；生产 DDL 前仍须最小可恢复点。当前不继续反复重跑整代备份、不降低TLS模式、不把其他模块交付卡在工具优化上。对应发布待办见docs/handoff/p1-release-open-items-2026-10-17.md。
