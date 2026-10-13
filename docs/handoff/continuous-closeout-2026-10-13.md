# 2026-10-13｜后续连续施工现场交接（Release A 已部署）

> 本文为明确施工范围和证据的任务单，不是新的生产变更授权。依据当日用户 ECS 逐项回执与 GitHub `p1/foundation` 代码检查；真实手机功能统一最终验收，自动化测试仍须每批运行。

## 0. 不能重复的工作

- 生产 API active/approved: `8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`；回滚 `b150d2c5c8720aac8d48fbd0395d8db9c408bc63`。
- Release A 已通过 ECS 受限构建、14/14 专项测试、无 DB 隔离冒烟与正式 `PROMOTE_OK`；发布后 `/health/live` 和 `/health` = database ok，`NRestarts=0`、当时 `MemoryCurrent=68567040` / 256MiB；这**不是**完整业务验收。
- 2026-10-13 09:34:27 的新闻任务记录是在新版切流**之前**，不能当作新版分页采集证据。下一次原 timer 运行之后收集日志，不主动重装 timer。
- 原有真机通过：AI 评估完整运行/历史；课表导入与本周；172 张院校图片。回归而非重做。
- 永不直接把整条 `p1/foundation` 发布到 ECS，禁止擅自改动官网 NPM/Harbor/Portainer/Docker/端口/凭据。

## 1. 新核实的管理员工作台缺口

`apps/admin/src/App.vue` 当前仍以 `classroom | identity | products` 三个分区为主（课堂管理/账号与身份/产品资料），`apps/admin/src/lib/api.ts` 只有这些分区的主要读写 API 封装；**不能声称 Web 管理后台已经接入 Release A 新的管理员统计、资讯扫描回执、真实身份投影等所有功能**。

- 先梳理手机管理员页、Web 管理台、API 三者到底哪些入口已存在，避免重复开发/两套数据真相；
- 统一接入真实后端统计、账号状态及新闻管理，不使用演示数据或默认 0；
- 分离读与写；老师/普通学员无权执行管理员写请求，不能因 UI 按钮隐藏就忽略后端权限；
- UI 按用户此前截图目标修复密集信息、对齐和留白，兼容手机，避免无意义大圆角；产品视觉允许鲜明配色，但先保持业务功能准确；
- 每个切片完成真实 API 合约/权限负例/错误状态测试，完成后标记 CODE/TEST/DEPLOY/DEVICE。

## 2. News V2 并行主线

已存在 `services/api/src/db/upgrade-news-v2.ts`、`news-v2-schema-contract.ts`，目标七表：`news_display_states`, `news_favorites`, `news_retirement_batches`, `news_retirement_tasks`, `news_retirement_reads`, `news_task_audit`, `news_sync_runs`。

- 最新20篇正常窗口、72小时缓冲退出、收藏原始公众号地址、管理员一次性退出提醒/读状态/待办反馈、幂等同步/审计是真实产品要求；Release A 扩容扫描200组不是 News V2 上线。
- 先找可以确认证据的**非生产 MySQL**：测试升级执行2次、FK/索引/字符序、旧资讯兼容性、权限负例、40组文章含分类变化、数据保留/回退。
- 任何涉及真实生产 DDL 必须先备份及隔离恢复演练、提交精确 SQL 清单并获得单独批准。无非生产 MySQL 时文档/代码/静态测试可继续，但迁移实跑标 BLOCKED，严禁拿 mock 充当 MySQL 结果。
- API 功能开关默认 OFF；旧版30分钟 timer 不得因 News V2 施工被重复安装或自动替换。代码切流、开关和 timer 各自独立审批。

## 3. Profile 与其他任务

- Release B `user_profiles.enrollment_year` 缺列，`GET /me/profile` 有500历史证据。只准执行经过预检、备份/恢复、独立批准的单列 ALTER；新功能开发不能靠伪数据绕过。
- 客服咨询复制、评估长图/重复斜向水印、管理员手机界面及学校地图，分别对比已有代码与此前实际需求；代码改动可在 GitHub 施工，真机留到用户最后统一验收。
- 首页新/老用户动态评估入口、AI 输入包含我的规划及最近3次历史评估、跨身份只读镜像、Token/微信支付和财务报表均有单独约束；不擅改运行模型/Prompt/RAG、不开支付。
- 生产付款/信用相关表缺失，不得把充值次数和收入错误显示为 0。

## 4. 持续施工与停机条件

每轮先 `git status --short`、拉最新 HEAD、阅读 `CONSTITUTION.md` / `AGENTS.md` / `docs/handoff/CURRENT.md`；在 `p1/foundation` 做**最小独立提交**，CI 检查通过后更新本文真实状态。

不需要用户每项真机复验；只有在生产 DDL、正式 API promote、微信体验版上传/真实设备操作、支付、需要特殊账号/资源或破坏性变更时才停下请求操作。所有剩余功能最终提供统一验收包，任何未实测项写明 PENDING。

## 5. 本轮施工收口（2026-10-13）

- Web 管理后台新增真实数据只读入口，沿用管理员 API 鉴权；旧 `/admin` 编辑路由仅开发模式触发。账号/资讯/统计三路独立显示 HTTP 与来源错误，支付缺表不作 0，发表时间未证实则写来源更新时间。正式 Web 登录未接入，生产 UI 不开放令牌输入。代码 `142eaa5`、合同测试与 CI `8911919`、不完整统计响应拒绝 `a74a1d8`。
- GitHub Actions `38335494470`、`38335497980` 均 PASS；本地管理端依赖缺失，执行了只读适配器 2 项测试，管理端 typecheck/build 使用 GitHub CI 结果。未调用生产管理员私有接口，真实身份/文章/评估样本未在本批重验。
- News V2 七表生产缺失且没有已确认的非生产 MySQL；本批未运行迁移、未开启开关、未触碰现有 30 分钟 timer。Profile 生产缺列、客服/长图/地图新回归仍等待统一手机验收。
- [微信体验版统一验收清单](experience-acceptance-2026-10-13.md) 已备妥。CODE：只读后台候选完成；TEST：CI PASS；DEPLOY：本批未部署；DEVICE：PENDING。Release A 已部署事实维持原记录，不重复发布。下一次生产动作需精确候选/Schema/资源审批，微信体验版上传由本人操作。
