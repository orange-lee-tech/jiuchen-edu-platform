# 2026-10-13 新对话交接：连续施工与甲方可移交数据库备份

## 当前真实状态
- 开发分支 `p1/foundation`；生产 API Release A **已部署** `8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`，回滚版本 `b150d2c5c8720aac8d48fbd0395d8db9c408bc63`，生产健康/DB PASS；新版自动新闻同步及业务仍待回归。不要重复部署 Release A。
- 管理员 Web 工作台最新 Work 提交 `b559e248f5d8635542aaabb931a2a57e38241eac`：真实统计/身份/资讯只读接线及测试通过，**Web 正式登录未接入，未部署/未真机**。手机管理员 UI、完整统计/资讯任务还有统一验收。
- News V2：20篇窗口/72h退出/收藏/退役任务等代码存在；临时 GitHub Actions MySQL 8 两次七表迁移、外键/基础关系写入 PASS；引擎字段别名错误已修复；逻辑边界测试加入。生产七表**未执行**、flag未开启、现役30min timer不得重复安装。
- Release B: `user_profiles.enrollment_year` 生产缺列导致 Profile 500 的历史证据；临时 MySQL 8 中双次单列迁移、旧数据保留、新年份往返 PASS；生产单列 DDL**未执行**。
- 真实验收过 AI 草稿→运行→结果→历史、课表导入→本周、172院校图。客服复制、长图/水印、院校地图、首页新老用户入口、AI规划/3次历史输入、支付和额度均须分别对账。
- CloudBase SQL MySQL 8、0.5vCPU/1GiB、自动休眠；免费/个人版不包含云端回档，标准版每月优惠报价119.40（199原价），甲方反对为了备份长期购买付费套餐。个人版19.90（首次连续包月4.90）未确认包括备份。TDSQL-C独立页面看不到该托管实例。CloudBase DB 自身风险横幅“数据库回档能力未开启”。
- ECS：2vCPU/1.8GiB RAM /2GiB swap /40GiB磁盘，先前约20GiB可用，官网和 API 同机**独立隔离**；仅 API 256MiB 内存上限。当前实际磁盘占用须重测。不可触碰官网/NPM/Harbor/Portainer/Docker/端口。
- GitHub 工程提交：`e01a956f` News V2 MySQL CI、`1b214d63` 修 MySQL ENGINE 别名、`75430b3e` 外键业务关系、`c42a5bf1` 72h测试、`4b27dd09` Profile MySQL CI、`e3ec11c7` B/C 生产 gate、`3e03b1f8` 状态；最近提交须重新读取 HEAD/CI，切忌以旧 SHA 当最新。
- 施工前读 `CONSTITUTION.md`、`AGENTS.md`、`docs/handoff/CURRENT.md`、`docs/handoff/continuous-closeout-2026-10-13.md`、`ops/ecs/AGENTS.md`(碰 ECS 时)；新增备份方案见本页。

## 用户刚确认的备份方向（待工程验证，不是已实施）
- 不绑定开发者私人 Mac mini，更不为甲方专门买新硬件/订每月119.40元 CloudBase 标准版。
- 甲方负责人可在 **Windows PowerShell 或 macOS 终端**执行一条封装好的取回命令；备份文件默认先在 ECS 独立受限目录生成，再拉到甲方电脑的明确目录。甲方设备不必常驻运行 MySQL。避免在聊天/脚本输入或打印生产 DB 密钥。
- 建议 **ECS 每日自动执行受限 MySQL 一致性备份 + 本地短周期轮换（例如7天）**，**甲方每周一导出到甲方设备**并检查文件 hash / 时间戳。用户提出每周一执行一次也可行，但如果只有每周备份，最大数据丢失约7天，风险高。即使每天 ECS 备份，整个 ECS 被毁仍可能丢失距离上周甲方取回期间的数据。需明确 RPO/RTO 与取回漏做告警。
- 备份不得包含 .env/Secret；SQL 备份中有真实学员个人资料，应加密，权限仅负责人，异地/独立设备至少一份，禁止 GitHub、公众号、微信群随意转发。
- 甲方交付两套命令：日常“每周一键下载+校验”及事故“先冻结相关写入/记录现状、判断事故类型、选择经过验证的备份、恢复到隔离库、核实后再由授权人员决定生产切换”。**事故发生不能盲目重新备份覆盖好备份，也不能默认直接将 SQL 灌回生产**。需要灾前/灾后备份语义清晰区分。
- 自动备份必须验证 CloudBase 经 ECS 现有受限 DB 账号是否允许执行 `mysqldump --single-transaction --quick --skip-lock-tables` 等（视权限/版本/存储引擎调整），连接冷启动超时、cron/systemd可靠性、资源上限、备份大小、日志脱敏、失败通知、磁盘余量熔断、备份可恢复性。禁止未审查就给 root cron 塞生产密码；备份独立账户/受控凭证，审批 systemd timer。
- 生产备份方案与自动 timer 新建需要明确批准，不可由用户“方向认可”推定生产操作权限。

## 下一步施工主线（避免备份喧宾夺主）
1. 继续 GitHub 本地独立切片：管理员工作台真实入口和登录、资讯生命周期 API+UI、授权负例、客服复制/评估长图/地图、首页等。每批跑 typecheck/test/build、修 CI、提交 `p1/foundation`。
2. 并行制作备份脚本、Windows/macOS 甲方一键操作、事故恢复手册与**隔离环境的端到端模拟演练**；生产 ECS 安装客户端、设置凭据和 timer、生产库备份需要单独权限审批。
3. 验证真实生产 DB 备份/异地副本/隔离恢复后，才申请 Release B 单列 DDL、Release C 七表 DDL，各自独立。微信体验版统一验收；不准把代码完成当真机通过。
4. GitHub 历史版本长期归档、ECS只保留现役/上一版/待发布候选；不要在当前恢复窗口清理旧 release。
5. 报告严格区分 CODE/TEST/DEPLOY/DEVICE；缺证据就写 PENDING/PARKED。
