# PR #6 生产预检｜2026-10-24

## 固定对象

- 已通过合并后 CI 的应用代码：`1b6bce08860a4521771c194097f477a1621b333f`。
- 当前 main `9093c5d9bb67f2875adeedf5e3091ea1c65c4332` 仅有后续文档更新，应用源码与绿灯提交一致。
- 最近记录的生产 API：`dbd7d9a818523cc3b007afe47a03519510415652`；GitHub compare 证明候选为其后代。该 SHA 仍须 ECS 现场确认。

## A. ECS 只读现场回执

通过现有受限运维账号执行；不 SSH root、不读取/打印任何密钥，不改文件、不重启服务、不触碰官网。

```bash
set -eu
date -Is
printf 'CURRENT_PATH='; readlink -f /opt/jiuchen-api/current
printf 'CURRENT_COMMIT='; cat /opt/jiuchen-api/current/COMMIT_SHA 2>/dev/null || echo UNKNOWN
if [ -r /opt/jiuchen-api/shared/previous-release ]; then printf 'PREVIOUS_COMMIT='; cat /opt/jiuchen-api/shared/previous-release; else echo 'PREVIOUS_COMMIT=NOT_READABLE_AS_DEPLOY_USER'; fi
printf 'SERVICE_STATE='; systemctl is-active jiuchen-api.service
systemctl show jiuchen-api.service --no-pager --property=MainPID,NRestarts,MemoryCurrent,MemoryMax,CPUQuotaPerSecUSec,TasksMax,User
printf 'HEALTH_LIVE='
curl -fsS --max-time 3 http://172.25.80.203:3100/health/live
printf '\nHEALTH_READY='
curl -fsS --max-time 5 http://172.25.80.203:3100/health
printf '\nHEALTH_CONFIG='
curl -fsS --max-time 5 http://172.25.80.203:3100/health/config
printf '\nDISK='
df -h /opt/jiuchen-api
printf '\nMEMORY='
free -h
printf '\nWEBSITE_ROOT='
readlink -f /www/wwwroot/jiuchen-current
```

必须确认：current 与现场记录一致、previous release 真实存在、服务 active、live/health 通过且 database=ok、内存/磁盘仍有余量、官网根目录保持 `/www/wwwroot/jiuchen-current`。若受限账号无法读取 root-only 的 `previous-release`，不要修改文件权限；由现有授权的 ECS 控制台运维入口只读核对该 SHA 和目录存在性（不使用 root SSH）。若失败，停留在只读诊断，不继续 DDL 或 promote。

另由有权限读取生产环境文件的授权操作人员只输出布尔状态，不输出值：
```bash
if grep -Eq '^ADMIN_AI_KEY_ENCRYPTION_KEY=.{40,}$' /etc/production.env; then echo ADMIN_AI_KEY_ENCRYPTION_KEY=PRESENT; else echo ADMIN_AI_KEY_ENCRYPTION_KEY=MISSING_OR_INVALID; fi
```
此项必须在切流前确认。密钥应为 32-byte key 的 Base64 编码，权限受限，并在服务器外的受控加密位置保有可恢复副本。不要把值贴到终端回执、GitHub、聊天或日志；不要为了检查而扩大 `jiuchen-deploy` 的 sudo 权限。

## B. CloudBase SQL 控制台只读检查

先执行表/引擎清单：

```sql
SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'users','assessments','internal_ids',
    'payment_orders','credit_ledger_entries','credit_reservations','payment_notifications',
    'admin_control_boxes','admin_control_audit','admin_control_drafts',
    'assessment_key_objects','assessment_key_head','assessment_key_events',
    'credit_plan_objects','credit_plan_head','credit_plan_events',
    'identity_events','identity_admin_guard'
  )
ORDER BY TABLE_NAME;
```

核对订单快照列、身份表字段与父表外键字段：

```sql
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLLATION_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME='payment_orders' AND COLUMN_NAME IN (
      'id','user_id','status','amount_fen','credit_amount',
      'virtual_delivery_confirmed_at','virtual_reconcile_checked_at',
      'sku_key','plan_id','plan_version','pay_environment','wechat_product_id'
    ))
    OR (TABLE_NAME='internal_ids' AND COLUMN_NAME IN (
      'id','business_id','type','claim_mode','status','user_id'
    ))
    OR (TABLE_NAME='users' AND COLUMN_NAME IN ('id','role','status'))
    OR (TABLE_NAME='assessments' AND COLUMN_NAME IN ('id','user_id'))
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;
```

核对 `internal_ids` 当前索引与重复组：

```sql
SELECT INDEX_NAME, NON_UNIQUE,
       GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS indexed_columns
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'internal_ids'
GROUP BY INDEX_NAME, NON_UNIQUE
ORDER BY INDEX_NAME;

SELECT COUNT(*) AS duplicate_user_type_groups
FROM (
  SELECT user_id, type
  FROM internal_ids
  WHERE user_id IS NOT NULL
  GROUP BY user_id, type
  HAVING COUNT(*) > 1
) AS d;

SELECT COUNT(*) AS active_admins_missing_admin_binding
FROM users u
LEFT JOIN internal_ids i ON i.user_id = u.id AND i.type = 'admin'
WHERE u.role = 'admin' AND u.status = 'active' AND i.id IS NULL;
```

只有表清单确认 `admin_control_boxes` 已存在后，再执行此查询；表不存在时不要创建它来“方便检查”：

```sql
SELECT box, version,
       (encrypted_secret IS NOT NULL) AS has_encrypted_secret,
       (payload_json IS NOT NULL) AS has_payload
FROM admin_control_boxes
WHERE box IN ('settings','assessment_key')
ORDER BY box;
```

回传只需表名、字段/索引、重复组数量、管理员缺绑定数量、两个布尔值；不要导出个人记录、订单明细或秘密。

## C. 恢复点和迁移闸门

已知备份 `/home/orangelee-tech/jiuchen-backups/20261016-134131-cf772f`：加密下载和校验已记录，隔离导入 17 张表通过；旧迁移演练曾达到 28 表。它距当前 8 天，且没有覆盖 PR #6 三项新迁移，因此不能单独作为本轮生产 DDL 的最终恢复证明。

生产 DDL 前须：
1. 从当前生产数据库取得一份新鲜加密备份；不使用旧 root-SSH 备份命令绕过既有限权。
2. 在隔离 MySQL 中导入该份备份，核对关键表存在、表行数/业务账本抽样或等价校验，并保存 checksum 与恢复回执。
3. 在这份真实结构副本按顺序执行上述五个候选迁移各两次，运行 `verify-commercial-controls-mysql.ts` 和 `verify-closed-loop-mysql.ts` 的适配版/已验证门禁；确认第二次运行无重复副作用、旧订单快照不变、现有评估与账本不丢失。
4. 确认 `ADMIN_AI_KEY_ENCRYPTION_KEY` 可用且已受控备份；若旧控制盒密文存在，确认能解密。
5. 核验旧 `db:upgrade:credit-payment` 四表已经存在；若缺失，停止并单独评估，不在本轮盲目重跑。

PR #6 迁移的潜在业务影响：
- `virtual-delivery` 为 `payment_orders` 增加两个回执列。
- `admin-controls` 创建控制盒/审计/个人草稿表。
- `assessment-keys` 创建密钥对象/生效指针/事件表；旧控制盒若有密文会被迁移到生效指针，主密钥不可用可能阻断 AI。
- `credit-plans` 创建方案对象/指针/事件表，并为订单添加 nullable 快照字段。旧设置盒若存在，会迁移一个待核实的默认次数方案（JC000/JC001/JC002/JC003 = 2/1/5/10）；不要未经真机核对就启用。旧订单金额和次数不重算。
- `dual-identity` 会调整 `internal_ids` 唯一索引并为缺少 admin 绑定的活跃管理员创建绑定；先确认无重复组并在真实结构副本验证旧 API 回退兼容性。

## D. 当前授权边界

用户已授权生产上线准备、只读恢复点/迁移条件核验、准备部署与真机验收。**本文件不授权现在执行生产 DDL、切换 ECS current、重启 API、写入主密钥、启用支付或发布微信版本。** 完成 A/B/C 并回报证据后，再按独立变更顺序实施。
