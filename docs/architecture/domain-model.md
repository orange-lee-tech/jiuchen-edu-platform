# 核心领域模型（初稿）

本文件用于在写业务代码前统一概念。字段级数据库 Schema 会在 P1 进一步设计。

## 1. User

微信小程序用户。

核心关系：

- 一个 User 可拥有评估额度；
- 一个 User 可产生多次 AI Assessment；
- 签约后可关联 Student 学员档案。

## 2. Student

签约学员的业务档案。

可能包含：

- 基础身份信息（最小化保存）；
- 本科院校、专业等保研相关背景；
- 当前培养阶段；
- 保研目标；
- 规划时间轴；
- 关联导师；
- 辅导记录。

User 与 Student 不应强行视为同一实体：普通用户可以使用 AI 评估但不是签约学员。

## 3. AcademicStage

学员时间轴中的阶段，例如：

- 大一上；
- 大一寒假；
- 大一下；
- 大一暑假；
- ……
- 大四上；
- 大四寒假；
- 大四下。

Stage 本身不复制页面，而是通过规则决定可展示哪些 PlanningType。

## 4. PlanningType

规划类型：

- `GPA`：绩点规划；
- `ENGLISH`：英语规划；
- `COMPETITION`：竞赛规划；
- `RESEARCH`：科研规划；
- `INTERNSHIP`：实习规划。

已确认展示规则：

| 阶段 | 可展示规划 |
| --- | --- |
| 大一至大三正常学期 | GPA / ENGLISH / COMPETITION / RESEARCH |
| 大三暑假前的假期 | ENGLISH / COMPETITION |
| 大四 | INTERNSHIP |
| 大四寒假 | INTERNSHIP |

`INTERNSHIP` 不关联辅导老师和辅导记录展示。

## 5. Plan

某个 Student 在某个 AcademicStage 下的一类具体规划。

示例：

`张同学 -> 大二上 -> 英语规划`

Plan 保存该规划的目标、内容、状态和必要扩展数据。

## 6. CourseTarget

仅用于 GPA 规划的课程级目标。

典型字段概念：

- 课程名称；
- 课程属性/学分（如数据源提供）；
- 课程难度或规划备注；
- 目标分数；
- 实际分数（后续如需要）；
- 备注。

目标分数由辅导业务逻辑确定，不在前端写死。

## 7. Mentor

辅导老师信息。

可供小程序查看老师介绍，并与需要导师信息的规划关联。

实习规划不展示 Mentor。

## 8. CoachingRecord

由后台员工录入的辅导记录。

关联：

- Student；
- Stage/Plan（按最终交互决定粒度）；
- Mentor（如适用）；
- 时间；
- 内容摘要。

实习规划不展示 CoachingRecord。

## 9. School / Program

保研相关院校及项目信息，是 AI 检索和用户浏览的重要数据源。

School 与 Program 分离，避免把一所学校的多个项目压在单一文本字段中。

## 10. Case

真实保研案例。

至少需要区分：

- 来源；
- 是否九辰服务案例；
- 是否允许公开；
- 匿名化状态；
- 学生背景；
- 最终结果。

未经确认不得把外部案例展示为九辰成功案例。

## 11. Assessment

一次 AI 保研评估记录。

概念上保存：

- User；
- 输入快照；
- 使用的数据/知识版本；
- Agent/Prompt 版本；
- 模型标识；
- 结构化结果；
- 调用状态；
- 是否消耗评估额度。

## 12. CreditAccount / CreditLedger

评估额度账户与流水。

不要只在 User 表放一个可任意修改的 `balance` 而没有流水依据。

流水事件可能包括：

- 免费额度发放；
- 微信支付充值；
- AI 评估消费；
- 调用失败退款/回滚；
- 后台人工补偿。

## 13. Payment

只服务于 AI 评估额度充值，不用于课程购买。

需要保存微信侧订单标识、内部订单号、金额、状态、回调处理状态等，并保证回调幂等。

## 14. AdminUser

九辰内部管理后台账号。

P1/P3 至少支持公司员工安全登录并维护学员课堂数据。权限是否进一步拆分为管理员/辅导老师等角色，在进入后台权限实现前冻结。


## 15. UserProfile

用户自行填写的保研相关基础背景。

与 `Student` 区分：

- `UserProfile`：任何学员侧登录用户可以形成的自填背景，用于 AI 定位与个人资料；
- `Student`：九辰正式服务学员的内部业务档案，由后台维护并可关联课堂、老师和辅导记录。

首批字段：本科院校、专业、当前年级、绩点文本、排名文本。

## 16. Teacher

小程序老师端身份与展示资料。

典型字段：

- 关联 User；
- 姓名；
- 职称/角色说明；
- 对学员展示的简介；
- 启用状态。

`Teacher` 与后台 `staff/admin` 不等价。

## 17. StudentTeacherAssignment

控制老师可以访问哪些学员的授权关系。

至少包含：

- Student；
- Teacher；
- 可选 Stage；
- 主辅导 / 协助关系。

老师端查询必须通过该关系过滤，不允许只因角色为 teacher 就遍历所有学员。

## 18. UserAgreement

保存用户对协议的同意证据。

字段概念：

- User；
- 协议类型；
- 协议版本；
- 同意时间。

开发阶段可使用 `placeholder-v0`，正式上线必须替换为正式文本对应版本。

## 19. UserSession

服务端登录会话。

微信 OpenID 仅用于建立身份，会话令牌用于后续 API 鉴权。数据库只保存令牌哈希，不保存可直接使用的明文令牌，并记录有效期与撤销时间。

该设计保证未来 API 从 CloudBase 迁到公司服务器时，业务鉴权不依赖 CloudBase 专属请求头。


## 20. InternalIdentity

九辰内部业务ID，用于把普通 User 绑定为 Student / Teacher / Admin。

典型字段：
- 业务ID（如 JCS / JCT / JCA 前缀）；
- 类型；
- 认领模式；
- 状态（available / claimed / disabled）；
- 关联 User；
- 关联 Student / Teacher 业务实体；
- 认领时间。

约束：
- 普通用户首次登录不自动获得业务ID；
- Student / Teacher 可按受控规则自助认领；
- Admin 不允许通过个人资料自助提权；
- 一个 User 最多绑定一个内部业务ID。

## 21. NewsPost

小程序资讯数据库记录。

来源至少区分：
- 九辰教育微信服务号；
- 后续必要时的内部手工内容。

典型字段：
- source；
- sourceKey；
- 标题；
- 摘要；
- 封面；
- 原文链接；
- 发布时间；
- 展示状态。

`sourceKey` 用于官方内容重复同步时做幂等 upsert。

## 22. AssessmentEvidence / KnowledgeVersion

AI 评估需要记录“为什么得到这个结论”，不能只有最终文本。

概念上应保存：
- 检索到的院校/项目记录；
- 检索到的案例记录；
- 数据来源；
- 数据版本或快照标识；
- 评估时实际使用的证据集合。

V1 可以先把这些内容作为 Assessment 的结构化证据快照保存，不要求立即拆成复杂独立系统。

## 23. AI Provider / Agent Version

这不是用户业务实体，但属于评估可追溯元数据。

每次 Assessment 应能够追踪：
- provider；
- model；
- agent/prompt version；
- input schema version；
- output schema version。

模型供应商属于可替换基础设施，不应成为 Student / Case / School 等领域模型的一部分。
