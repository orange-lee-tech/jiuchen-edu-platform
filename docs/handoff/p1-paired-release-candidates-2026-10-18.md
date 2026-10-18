# P1 配对发布候选与门禁回执（2026-10-18）

本页记录**固定前端与隔离 API 两条源码线**。生产部署、生产 DDL、付费开关、微信公众号来源自动覆盖和微信正式发布尚未发生；旧运行与新候选不能相互代替。现役 API 最后有证据的 SHA 为 `8cc4bb85ffdf3e86e7a13a89d119f1b110491e48`。

| 对象 | 固定 SHA / 制品 | 证据与界限 |
| --- | --- | --- |
| 小程序前端 | `283aaf15fc0047f100028eee547a5581c3f8c047` | [39031514964](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39031514964)：typecheck、96/96 回归 PASS；本轮尚无微信上传及真机回执 |
| API 发布源码 | `1b8ae8b3c5a1285b84ab6b5f573ca9db5d93d0a7` | 现役 `8cc4` 的后代；较旧隔离候选 e590 仅修复商业 schema checker。固定 Gate [39083488661](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39083488661)：verify、mysql-gate、profile-gate、commercial-gate 全部 PASS：Node22 typecheck、215/215 测试、build，News 七表混合字符集、Profile 单列、商业四表双次迁移/约束/合成恢复 |
| API 审查归档 | [39083622604 Artifact 12120032514](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39083622604/artifacts/12120032514) | 归档器校验生产祖先、固定 SHA、Git blob、路径和文件清单；内层 `jiuchen-api-1b8ae8b3c5a1285b84ab6b5f573ca9db5d93d0a7-readonly.tar.gz` 的 SHA-256 为 `98279923d783889caa87deb815d3828d53266a84a7be081714188a71f1fc1fb8`；外层 GitHub ZIP digest 为 `5a74ed7f6f2e86cfa06ec33e3048c1bf311a90a58e438dc5e0c118a0508ae5f8`，用途不同。制品状态 `REVIEW_ARTIFACT_ONLY_NOT_PRODUCTION_APPROVED`；GitHub 7 天保留至 2026-10-25 00:45 UTC |
| 10-17 集成 API 测试 | `283aaf15fc0047f100028eee547a5581c3f8c047` | [39031514966](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39031514966) 代码测试通过，但 [39032218889](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/39032218889) 归档失败：集成提交不满足生产祖先约束。绝不以它作 API 发布包 |

2026-10-18 逐文件比较两候选的 `services/api` Git blob：**运行文件完全一致**，隔离 API 额外保有 `services/api/src/routes/mobile-admin.release-a.test.ts` 测试文件。此事实说明配对源码关系，不代替在生产配置下的兼容与真机验收。

## 发布前仍需完成

1. 根据确定的首发业务边界，明确 AI quality v3、News V2、跨身份只读、充值与次数/统计是否在同批范围；完成商户虚拟支付资格、官方合同和退款/发货/对账验证。代码存在不等于商户可用。
2. 修复最小业务库可恢复点：10-17 本地备份工具 SSH 隧道后的 MySQL 客户端报 2026，数据库组件未备份/恢复。生产 DDL 前先获得经验证的隔离恢复证据；增量封存与三代轮换仍作为后续维护事项。
3. 按现役真实表结构复刻并分别审查 Profile 单列、News 七表、商业四表；生产只读证据确认这些对象缺失。分别取得范围审批后才执行各自 DDL、核对 schema/数据。
4. 在 ECS 既有限额 Node 22、256 MiB、50% CPU、64 tasks 下，用本 API 固定制品做只读 staging 和真实 DB/AI 负载验证。旧 e590 的无 DB 冒烟及生产 `8cc4` 的健康不能回填 `1b8`。
5. 单次体验版会话按[统一真机清单](p1-unified-device-acceptance-2026-10-14.md)验证四角色、公众号原文/客服、Profile、课表/评估/导出、充值次数与真实统计（后两项须商户和表可用）。固定前后端 SHA、微信版本和脱敏结果；缺真实角色样本写 DATA PENDING。
6. 仅在各独立审批与回执齐备时按既有发布器切流、观察健康/回退，提交微信审核并正式发布。官网/共享入口不属于小程序发布包。

两条自托管运行均在首次执行完成且结果 success；临时测试库恢复不能回填为生产备份恢复、生产 DDL 或商户实付通过。交接主索引：[CURRENT](CURRENT.md)；业务施工图：[整包发布](p1-integrated-release-package-2026-10-17.md)。
