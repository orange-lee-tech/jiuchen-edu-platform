# P1 基础骨架验收标准

P1 的目标不是完成业务页面，而是证明三端、身份和数据层能够以最简单方式稳定工作。

## P1 完成条件

1. 微信开发者工具可以正常导入 `apps/miniprogram`，并显示基础页面；
2. `services/api` 可以本地启动，`GET /health` 返回稳定的结构化结果；
3. `apps/admin` 可以本地启动并完成构建；
4. API 接入 Test MySQL，并完成受控 Schema 升级；
5. 小程序可以通过可替换请求适配层访问 API；
6. 完成最小微信用户身份链路，服务端把微信身份映射到 User；
7. 游客、Student、Teacher、Admin 的业务身份模型可运行；
8. 后台能够读取并维护虚构/脱敏测试学员；
9. Secret、真实学生数据和本地私有配置均不进入 Git。

## 当前施工状态

截至 2026-09-20：

### 已完成 / 已验证
- 小程序、管理后台、API 三个工程骨架；
- GitHub CI 覆盖小程序 TypeScript、后台构建、API 类型检查/测试/构建；
- Test MySQL 可连接；
- Auth/Identity V2 Schema 已完成受控升级；
- 10 个测试 Student ID、10 个 Teacher ID、5 个 Admin ID 已生成且 seed 幂等；
- 服务端会话、用户协议记录、统一登录、游客模型、内部ID认领、注销账号的代码已实现；
- 学员课堂阶段规则、课堂 API 和后台编辑第一版已实现；
- 九辰教育服务号 AppID/AppSecret 接入；
- 官方 access_token 和 `freepublish/batchget` 已验证，可读取九辰真实已发布文章；
- 资讯同步入库与小程序读取代码框架已建立。

### 尚未人工验收
- 微信首次登录 / 再次登录；
- 游客状态；
- Student / Teacher ID 认领；
- Admin 首次绑定；
- 角色权限隔离；
- 退出与注销；
- 手机管理员工作台；
- 老师仅访问已分配学员；
- 课堂后台修改后的小程序一致性；
- 服务号文章真正写入 `news_posts` 后的小程序展示；
- 跨模块回归。

这些项目统一记录在 `docs/testing/PENDING-INTEGRATION-TESTS.md`，不再靠零散聊天记录维护。

## 当前基础设施判断

CloudBase 免费 Test 云托管到 MySQL 的网络能力曾出现限制，因此：
- 本地 API + Test MySQL 是当前主要开发联调链路；
- CloudBase 仍可作为 Test/过渡能力；
- Production 不再默认绑定 CloudBase；
- Production 方向为公司阿里云主机上的隔离运行单元，详见 Proposed ADR-0008。

## 明确不属于 P1

- 完整 AIFORCE/外部原型视觉还原；
- 完整 AI Agent；
- 微信支付；
- 完整 CMS；
- Production 阿里云迁移；
- 全量性能与安全加固。

## 通过原则

P1 只有一个判断标准：**最小身份、API、数据库与后台闭环是否真实可运行并可恢复**。

在集中测试清单中的 AUTH / ID / ADMIN 基础链完成前，P1 保持“代码基本完成、人工验收未完成”，不提前宣布完全结束。
