# 保研案例预处理交付契约（Draft）

> 用于 AI 分析评估的案例资料预处理。  
> 当前只冻结“交付格式”，不冻结最终数据库表结构。

## 1. 目标

对话分支或人工预处理后，案例应从“PDF/Word/Excel/图片中的叙述材料”转换为可检索的结构化记录。

要求：
- 一条记录代表一个可独立引用的案例；
- 不把宣传文案当成事实字段；
- 保留来源与年份；
- 能明确区分九辰自有案例与外部案例；
- 隐私信息先匿名化；
- 不为了填满字段而猜测缺失数据。

## 2. 推荐交付格式

优先：
- CSV
- XLSX
- JSONL

若来源复杂，可同时提供：
- 结构化主表；
- source_notes.md；
- 原始资料索引。

## 3. 每条案例建议字段

### 3.1 来源与治理

必需：
- case_id
- source_type：`jiuchen` / `external`
- source_label
- source_year
- raw_source_ref
- anonymized：true/false
- public_allowed：true/false/unknown

建议：
- source_owner
- verification_status
- notes

### 3.2 本科背景

建议：
- undergraduate_university
- undergraduate_university_tier
- major
- grade
- gpa
- average_score
- rank
- cohort_size
- rank_percentile

原文只有“前10%”时不要反推具体排名。

### 3.3 英语

可重复字段建议拆成数组/子表：
- exam_type
- score
- exam_date
- note

### 3.4 科研

可重复：
- type
- title
- role
- organization
- level
- output
- description

### 3.5 竞赛/荣誉

可重复：
- name
- level
- award
- role
- year

### 3.6 申请过程

建议：
- target_school
- target_program
- target_direction
- application_stage
- summer_camp_result
- pre_admission_result
- final_result
- offer_status

### 3.7 最终结果

建议：
- admitted_school
- admitted_program
- admitted_direction
- result_type
- result_year

## 4. 缺失值原则

允许：
- null
- unknown

禁止：
- 根据学校名猜专业；
- 根据“优秀”猜排名；
- 根据“通过”猜 Offer 类型；
- 根据年份推测学生年级；
- 根据宣传语补充不存在的科研成果。

## 5. 隐私处理

进入 Test/Production 数据库前：
- 姓名匿名化；
- 手机号删除；
- 微信号删除；
- 身份证号删除；
- 邮箱按业务需要删除/匿名；
- 学号删除；
- 任何能直接定位个人的自由文本需复核。

原始材料如必须保留，应存放于受控文件系统，不进入 Git。

## 6. AI 检索需要的最小可用案例

一条案例至少需要：

- case_id
- source_type
- source_label
- source_year
- undergraduate_university
- major
- 至少一个可比较背景指标（排名/绩点/英语/科研/竞赛）
- 至少一个申请或录取结果字段

达不到最小条件的记录可以保留为资料，但不进入“相似案例” Retriever。

## 7. 九辰产品手册预处理

产品手册不要混进案例表。

建议另行输出“知识条目”：

- knowledge_id
- product_name
- category
- audience
- stage
- problem_solved
- service_scope
- key_deliverables
- limitations
- source_file
- source_page
- excerpt

这些条目以后可用于：
- AI 建议行动路径；
- 咨询人员辅助；
- 产品推荐解释。

但 AI 不应因为用户背景而自动做强制销售推荐。先给规划建议，再在有明确适配关系时展示对应九辰服务。

## 8. 预处理交付后主线要做什么

收到首批结构化数据后，主线将依次：

1. 字段审计；
2. 重复案例检测；
3. 来源/隐私检查；
4. 冻结 Case Schema v1；
5. 建立导入器；
6. 建立 Retriever v1；
7. 用 Mock Provider 做检索/证据链测试；
8. 最后才接真实大模型 API。

不需要现在训练模型。
