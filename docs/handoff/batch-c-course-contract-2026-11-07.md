# Batch C 课程身份与学业事实合同（2026-11-07）

状态：本地功能分支施工合同。Batch A/B 已由人类真机验收并冻结；本文件不证明生产数据库已迁移或 Batch C 已发布。

## 唯一身份与旧课表

- `schedule_imports.parsed_json.courses[].courseKey?: string` 是一门课在一个实际学期内的 UUID。多个上课时段可共用同一键；课程名、教师、星期、节次、数组位置均不是身份。
- 解析器仍只提取时间安排，不推断学分或成绩。旧 JSON 无键可读；GET 不随机补键。本人明确保存课表时，服务端给缺键时段分配新键并读回。编辑时段保持原键；改名、换教室、改教师、改时间不换键。显式关联同课或拆分课程才换关联。
- 重新导入得到独立时段和待确认关联。旧确认事实留在 `growth_records`；仅同学期且唯一可靠的原键可复用，歧义须学员选择。跨学期同名课程永不自动共用键。关联选择只改变当前课表键，不覆盖事实。

## 唯一权威事实

- `growth_records(type='course')` 承载确认后的学分与总评；`metadata_json` 是 `course-academic-fact-v1`，字段为 `stageCode`、`courseKey`、`credits`、`gradeScale`、`gradeValue`。课表 JSON 不存成绩。
- `source_key` 由服务端生成：`course:<authenticated userId>:<stageCode>:<courseKey>`。既有全局唯一索引使重复或并发 PUT 落到同一记录。生产是否已有该索引需发布前独立核查；此施工不运行 DDL。
- 学分为 null 或 0–30 且至多两位小数。计分制为 `unset / percentage / four_point / five_point / letter / pass_fail / other`；未填写成绩可为 null。百分制 0–100，四分制 0–4，五分制 0–5，均至多两位小数；字母与通过情况使用受控枚举；其他制保留文字并明确非官方换算。系统不推算 GPA。
- 只有学员主动保存才设 `user_confirmed=true`。自动解析、重新导入和旧课表读出均不创建确认成绩。

## 接口与错误语义

- `GET /me/course-academic-facts?stageCode=...`：一次返回当前登录账号、该学期已确认的课程事实；无记录返回空数组。401 未登录、400 学期错误、503 成长档案结构不可用。
- `PUT /me/course-academic-facts/:courseKey`：请求 `{stageCode,credits,gradeScale,gradeValue}`；服务端验证当前账号拥有该键的课表时段或已拥有同键事实，再按唯一 `source_key` 幂等保存并返回读回记录。400 字段错误、404 键不属于本人、409 关联冲突、503 结构不可用。客户端不得传 `userId/sourceKey/metadata`。
- `PUT /me/classroom/schedule-imports/:id/schedule` 仍只保存时段；成功回包包含补齐的课程键。课程事实独立保存。时段成功而事实失败时 UI 明示两项结果并保留失败草稿；重试 PUT 不新增账本或课程事实。
- 通用 `PUT/DELETE /me/growth-records/:id` 对 `course-academic-fact-v1` 记录拒绝修改，防止普通成长编辑抹去元数据；专用事实端点负责成绩修改。其他成长记录合同保持原样。

## 读取与验收边界

- 成长档案读取现有确认记录；课程成绩展示由结构化元数据提供。评估账户上下文从确认的同一事实源读取，提供有限文字证据且注明非学校官方规则；空成绩不进入强推断。
- 所有写接口按服务端会话限定用户。只读客户端不发写请求；服务端拒绝无授权请求及他人课表 ID/课程键。旧记录、重导入与账号切换不得覆盖事实。
- 未修改数据库表或支付。微信开发者工具、真机、生产索引检查与部署另行验收。
