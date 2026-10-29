# 学期校准：代码修复与生产核验边界

2026-10-29，只读 HTTPS 检查：`/health/live`、`/health` 均为 HTTP 200；未携带登录凭据访问 `/me/classroom/stage-suggestion` 为 HTTP 404。

已确认现役公开入口没有提供可用的新版建议路由。尚未取得真实学员手动 PUT 请求的响应，不能将其具体失败归因为缺列、权限或并发冲突；现役 API SHA 和生产 `students.current_stage_mode` 状态均待核验。

源码合同：`PUT /me/classroom/current-stage` 接受 `stageCode`、`mode`、可选 `expectedCurrentStage`／`expectedMode`，自动模式另需相应确认；响应必须包含 `ok=true`、已保存的 `currentStage` 和 `mode`。客户端随后 GET 建议接口复核阶段和模式，再重新读取正式规划。读取失败不会提示保存成功，也不会自动重发 PUT。

后端最低要求是包含 PR #10 学期接口的版本（PR head `d2ead9ae09c64cd47375cfb30b5b2516cf64af99`，已合并提交 `36aea4bab3e9bc1aa1c46403cc05e3b2208df1d4`）。发布前核对新增列；若发布完整 PR #10 API，还需核对其读取的 `plan_items.due_date`，不能仅执行学期列迁移就假定整包可用。

## 经单独授权后可执行的只读核验

- 沿用现有 SSH 登录，执行 `readlink -f /opt/jiuchen-api/current`、`systemctl is-active jiuchen-api.service`。不输出环境文件、密钥或学生资料。
- 在既有授权数据库连接中仅执行下列元数据查询，不读取业务数据：

```sql
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND ((TABLE_NAME = 'students' AND COLUMN_NAME = 'current_stage_mode')
    OR (TABLE_NAME = 'plan_items' AND COLUMN_NAME = 'due_date'));
```

- 学期列预期为可空 `enum('auto','manual')`；日期列预期为可空 `date`。缺失时分别核对 `db:upgrade:academic-stage-mode`、`db:upgrade:plan-item-due-date`。脚本存在不是已执行证据，生产 DDL 与部署仍须单独批准。
- 本人登录后记录校准请求的 HTTP 状态码和应用错误代码即可；不要分享 Token、完整请求头、学生资料或数据库错误正文。

本轮仅修改客户端确认与诊断，不执行生产迁移、部署或微信发布。自动化回归不等于生产或手机验收。
