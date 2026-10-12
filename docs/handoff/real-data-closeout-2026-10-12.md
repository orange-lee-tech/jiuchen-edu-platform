# 真实数据接管与资讯 V2｜阶段性交接（2026-10-12）

**总体 Gate：BLOCKED。** 代码已提交 `p1/foundation`，生产仍运行旧 release；生产 DDL、API promotion、systemd timer 安装、微信体验版/真机均未执行。本页是可核对的阶段结果，不把代码测试当生产或真机 PASS。先前 Profile、客服上下文复制、评估长图/水印仍在原专项范围内。

| 查询项 | 真实来源及接口状态 | 脱敏样本与结论 | 代码/测试与未过门槛 |
| --- | --- | --- | --- |
| 公众号资讯 | ECS 凭生产服务号凭据只读调 `freepublish/batchget`，40/40 组；公开 `GET /news` HTTP 200，旧库21篇，18篇未分类、3篇标“测试” | 源端最前文章“月满中秋，清辉相伴｜九辰教育祝您中秋安康”与库 sourceKey/标题相符；旧 `published_at=2026-09-25T01:00:02Z` 对应源 `update_time`，并无可验证的发表字段。不得宣称这是真发表日期 | 分页至200组、有界正文、真实回执及失败/截断、后端分类限制、日期“待核实”；生命周期20篇/72小时在 flag 下。需生产部署后核对最新来源、列表与详情及真机原文跳转 |
| AI 评估 | 生产 `assessments` 只读 SQL OK；无凭据的 `/me/admin/assessment-analytics` HTTP 401，未运行生产管理员登录统计接口 | 成功9、失败5、草稿1；9条成功皆有 `completed_at`，账本消费不可核对。部分完成/更新时间相差整8小时，日期归桶需三方校验 | 评估与支付/账本来源隔离，成功评估不因商业表缺失归零；本地契约测试 PASS。需生产 API promotion、真实管理员接口核对与午夜样本验证 |
| 充值/额度 | 生产 `payment_orders`、`credit_ledger_entries`、`credit_reservations` 均 `ER_NO_SUCH_TABLE` | 充值金额、免费/付费使用和实际消费次数为“来源不可用”，**不是0**；绝不补造历史账本 | 分/元、订单 paid、缺口与供应商人工观察值已在代码区分。商业 Schema 另案审批，真实金额/扣减/API成本不能验收 |
| 身份 | 生产 `internal_ids` 只读 SQL OK；无凭据的管理员账号接口 HTTP 401 | 32编号；找到未认领学员、已认领未分配学员、已认领管理员；缺已认领已分配学员与已认领老师样本。测试命名未核实实名 | 只读投影与筛选已提交，不自动认领/删除/改名；尚需生产管理员 API、真实姓名/学校授权后台核对及缺失角色样本 |
| Profile | `information_schema` 只读 OK；`user_profiles.enrollment_year` 不存在，生产 GET 曾500 | 单列可空迁移脚本已存在，未执行 | 单独备份/恢复验证与精确 DDL 批准后再修复；客服复制及长图/水印仍待微信真机 |

上述资讯采样只能证明源端列表与库中标题相符，不能证明公众号后台的真正发表时刻；没有源端 `publish_time` 与正式发布回调验证，也不能把 `update_time` 改名为发表时间。未分类审核仍由服务端保护。历史成功评估数来自只读 SQL，不推导出已消费额度。部分样本缺失与来源错误在 UI 明示。

代码分批：资讯同步 `fbf7fda`；统计/客户端口径 `9bda1b5`；身份 `47bc3bc` 与回归修正 `4a91cbc`；资讯 V2 核心 `b2622e9`、客户端 `14da4ca`、部署/迁移方案 `5af578b`、UTC 与截断修正 `a2f4a7f`。此前三个真实数据模块保持独立提交。最新 GitHub CI 必须按 HEAD 单独核验，不能以较早绿色覆盖新提交。

本地 API typecheck/build 与190项测试、小程序 typecheck及82项回归通过。`npm test` 的 `tsx` CLI 在当前受限容器因 `/tmp/tsx-0/*.pipe` 监听 EPERM 不能启动；等价测试入口 `node --import tsx --test 'src/**/*.test.ts'` 190/190 PASS。非生产 MySQL 的七表迁移与数据读写、生产 API 权限负例、公众号同步 POST、真实付费订单、微信真机全部 **NOT RUN**。News V2 迁移、备份、启停与回退细节见 [独立方案](news-v2-schema-and-release-2026-10-12.md)。
