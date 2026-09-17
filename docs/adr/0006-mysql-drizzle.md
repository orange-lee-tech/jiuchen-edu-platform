# ADR-0006：V1 使用 MySQL + Drizzle

- 状态：Accepted
- 日期：2026-09-17

## 决策

线上唯一真实数据源使用 MySQL。Node API 使用 Drizzle 管理 Schema、查询与 Migration。

本地 XLSX / CSV 只作为公司员工整理、导入和备份数据的载体，不直接作为线上数据库。

## 原因

九辰 V1 的学生、阶段、规划、导师、案例、院校、评估记录、额度流水和支付订单都是清晰的关系型数据。MySQL 足够成熟，也与托管基础设施契合。

Drizzle 保持较薄的抽象层，Schema 和 SQL 关系容易理解；不为 V1 引入复杂数据访问框架。

## 暂不引入

- Redis
- Elasticsearch
- 向量数据库
- 数据仓库
- CQRS / Event Sourcing

只有业务规模或真实查询需求证明必要时再增加。
