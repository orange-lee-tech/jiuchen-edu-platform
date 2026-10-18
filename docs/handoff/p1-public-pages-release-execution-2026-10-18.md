# P1 十月资讯候选：现场执行与验收（2026-10-18）

本页覆盖新候选 `858aa6a5bebbdb88346c6282f691b4976886b935`。旧 `50e7fe3d` 的 ECS release 虽已准备，但不能切换为本候选。事实状态以 [CURRENT](CURRENT.md) 页首为准。

## 固定对象

| 对象 | 固定值或状态 |
| --- | --- |
| 前端 | `51ea8775de74581289617cf1428ba4165775c1e0`；此前 96/96 与固定 Runner Gate PASS，仍缺本轮体验版 |
| API | `858aa6a5bebbdb88346c6282f691b4976886b935`；源自生产 `8cc4bb85` 的隔离后代 |
| API Gate | [固定候选自托管运行](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39141950531)；verify、commercial、mysql、profile 四项 PASS；不从旧云端红灯推断代码失败 |
| 只读归档 | [运行及下载](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39141950607/artifacts/12142425584)，内层 tar.gz SHA-256 `0c316a8582a56c61c89bc8081b0669167b31baee85e0b5f1361bcda7bc089180`；manifest/Git blob 162 文件复核 PASS |
| ECS staging 脚本 | [固定只读验收](../../ops/ecs/verify-public-pages-staging-20261018.sh)，SHA-256 `f4936b0466748523366e9236b940eed13ee64cbec0ab8c7261cd4168d8c3aed9` |
| ECS release 准备脚本 | [固定准备](../../ops/ecs/prepare-public-pages-release-20261018.sh)，SHA-256 `bacad470d98ede2f51d00c05bb22d41484d74cef39797b4043de55b509f461d7`；只构建新目录，不切流 |
| 现役 API | 最后核实 `8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`，现场必须重新读 `current` |
| 前一候选 | `50e7fe3d7f93a347dfdc4af0675992690eb01e6f` 的 staging/release 准备 PASS 只是历史证据 |

## 现场回执（2026-10-19 00:09 CST）

- ECS staging：固定归档/脚本哈希、manifest/Git blobs、Node 22 typecheck/build、256 MiB/50% CPU/64 tasks 无数据库 30 次健康检查通过；cgroup 内存峰值 77,303,808 bytes、failcnt 0；`ECS_STAGING_GATE_PASS`。
- ECS release：固定准备脚本与归档哈希、manifest/Git blobs、typecheck/build、链接边界及服务用户访问检查通过；`RELEASE_PREPARED=/opt/jiuchen-api/releases/858aa6a5bebbdb88346c6282f691b4976886b935`；现役仍为 `8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`。未写 READY/approved-release、未切流、未写库。本表下方第 1–3 步为已通过流程，不再重跑。
- 精确 API 差异相对现役 5 个提交：包含 AI assessment-agent-v3 的规则/校验调整、跨身份只读授权，以及资讯 V2 可选路径；前两项随 API promote 生效，后者需独立开关。生产切换、V2 预热/启用、四篇入库为分项审批；商户接线与实际交易另行验收。

## 四页内容边界

用户于 23:35 CST 上传的匿名公开页面 ZIP SHA-256 为 `173e2e75f860549d5a01bfa30af6aa4d9b55ab8b36931c49bbe1c08e98018704`。四页同服务号 biz `MzY5MTM2ODk5NA==`；发表秒数 `ori_send_time` 与页面 `create_time` 对应。公开页面内容提取器 [prepare-public-pages.py](../../tools/news/prepare-public-pages.py) 只读生成私有 JSON，实测图文 2/3 张图、贴图 7/1 张图，原次序相符。生成结果 SHA-256 `61a208d3396e0136279ed843a587da0ed1a290f0d7bf1f01746f67a34a651f92`；原 HTML、全文与私有 JSON 不进 Git、Actions 或普通日志。

这四条与用户提到的 10 月 12 日《中南大学保研看什么？》是不同对象。后者尚无原文 URL。官方 `freepublish/batchget` 仍未自动列出这四条短链；本次解决四条已知 URL 的站内内容生成和域名适配，**不宣称整月自动发现恢复**。正式小程序仍需图片加载、完整阅读、收藏跳原文的真机记录。

## 一次现场施工顺序

1. 核对新候选 Gate 的 verify、commercial、mysql、profile 全部最终成功；前端固定 Gate 仍对应 `51ea8775`。核对现役 API、服务健康、官网源站、恢复点和目录权限。旧云端额度失败不计作候选代码失败。
2. 下载上表的只读归档，另取得固定 staging 脚本。仅在 `/opt/jiuchen-api/staging/incoming/858aa6a5...` 上传并执行；脚本核 manifest/Git blobs，独立安装、构建、在 256 MiB／50% CPU／64 tasks 下作**无数据库**冒烟。失败保留现役并停止。
3. staging PASS 后执行固定 release 准备脚本，核 root 所有、服务用户可读、`COMMIT_SHA`、`current` 未变。它不写 READY 或 approved-release，不重启。不要把旧 `50e7` 目录当成新候选。
4. 对精确 API SHA 和范围取得独立上线确认。候选包括 AI quality v3 与跨身份只读；News V2 开关、四篇生产资讯写入、虚拟支付和额度强制也是独立范围。只有获得各自批准，才用既有 `jiuchen-promote` 执行切流/健康/回滚；不手改 symlink，不碰官网和共享代理。
5. 批量内容工具 [submit-public-pages.py](../../tools/news/submit-public-pages.py) 默认只读预览；仅在生产 API 已切换、管理员会话可用、资讯生产写入获批后使用 `--apply`，在管理员本机终端私密输入 Bearer token。脚本固定生产 HTTPS 地址、拒绝重定向、核私有负载哈希，逐篇调用现有管理员 API；重试按原文 URL 幂等，失败即停止，不能把四个 HTTP 200 当成真机阅读通过。
6. 一次微信体验版会话同时核四篇正文和 13 张图的顺序/加载、收藏原文，所有客服入口实际收信，游客/学员/老师/管理员与只读写入负例，资料保存重开、课表/评估，商户真实充值/赠送/扣次/退款及周月年统计。支付配置仅在受限生产环境填写，先核 OfferID、AppKey、两档商品和回调后再启用。官网与 API 均健康、真机通过后再提审。

长期区间备份、视觉微调与 CI 治理仍在发布后。生产 DDL 前的最小加密备份、17 表隔离导入、真实结构迁移和三组 DDL 已有独立回执；不要重复这些已通过步骤，也不要把它们当作生产业务验收。
