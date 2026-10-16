# 2026-10-16 生产只读预检事实

来源：用户10:39执行日志，诊断源码236781b27b2cc94578c8094c921d4aaab57c1774；桌面原日志jiuchen-preflight-20261016-103656/ecs-preflight.log。本轮已重读原文件；未重新SSH。

- active 8cc4bb85ffdf3e86e7a13a89d119f1b110491e48；previous b150d2c5c8720aac8d48fbd0395d8db9c408bc63。
- 实际监听172.25.80.203:3100；两个健康端点成功、数据库ok。127.0.0.1拒绝连接已解释为地址不匹配。
- API active，NRestarts0，MemoryCurrent88322048 bytes，MemoryMax268435456，CPUQuota50%，TasksMax64，User jiuchen-api。
- 可用内存969MiB；根盘可用22GiB。只证明现役采样，不证明候选资源关口通过。
- Profile enrollment_year缺列；News V2七表和支付三表缺失。coaching_records、growth_records亦缺失，不能遗漏其功能依赖审计。
- users.id / user_profiles相关字段为utf8mb3_general_ci；news_posts.id为utf8mb4_unicode_ci。临时MySQL最小同字符集fixture不是生产结构复刻；后续须按这个混合字符集结构验证。
- MySQL8.0.30-cynos-3.1.19.002，时区+08:00；临时标准MySQL8.0容器不等于同一引擎版本。
- productionBackupRestored=false，生产备份/隔离恢复关口未通过。
- 公众号getarticlesummary两次47009；永久图文素材0组。来源适配未批准；脚本退出0仅代表执行完成，不代表来源验证PASS。

继续使用此日志；不要求用户重跑已成功的三项预检。本轮没有DDL、promote、开关、timer或官网改动。
