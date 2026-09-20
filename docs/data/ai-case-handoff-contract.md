# AI 案例数据预处理交接契约

> 状态：Handoff Contract  
> 目的：规定独立预处理分支完成后向主项目交付什么，不提前冻结最终 Case 数据库 Schema。

## 1. 不直接交什么

主项目不要求把所有原始大 PDF、截图、聊天记录直接提交到 Git。

禁止：
- 未脱敏的姓名、手机号、微信号、学号、身份证等个人标识进入仓库；
- 把来源不明或无法确认真实性的内容标为“九辰真实案例”；
- 为了补齐字段而推测、编造缺失数据；
- 把原文全部复制进数据库而没有来源定位。

原始大文件可以保存在受控业务存储中，主项目只保存可追溯引用。

## 2. 推荐交付物

预处理分支最终建议交付：

### data_dictionary.md
解释所有规范化字段：
- 字段名；
- 含义；
- 类型；
- 可空；
- 原始来源；
- 清洗规则。

### source_manifest.csv
每个原始数据源一条记录，至少包括：
- source_id；
- source_type；
- source_name；
- source_file；
- year / date（如有）；
- ownership / permission；
- public_allowed；
- notes。

### cases.normalized.jsonl
每行一个规范化案例。

### quality_report.md
至少报告：
- 总案例数；
- 去重前/后数量；
- 关键字段缺失率；
- 年份分布；
- 来源分布；
- 九辰自有案例 / 外部案例数量；
- 异常和无法判断的口径；
- 仍需人工确认的问题。

## 3. 每个案例希望保留的语义

以下只是“希望预处理时尽量保留的信息”，不是最终数据库列定义。

### provenance
- case_source_id；
- source_type；
- source_label；
- source_file / page / row / record locator；
- year；
- is_jiuchen_case；
- public_allowed；
- anonymized；
- verification_note。

### undergraduate_background
- university；
- university_tier（仅当原始数据明确或后续有统一规则）；
- major；
- grade/year；
- gpa / average_score（如有）；
- rank；
- rank_total；
- rank_percentile（仅在可由明确数字计算时生成）。

### english
允许多条：
- type；
- score；
- date（如有）。

### research
允许多条：
- type；
- title/theme；
- role；
- organization/lab；
- level；
- result/output；
- description。

### competitions
允许多条：
- name；
- level；
- award；
- role；
- year。

### applications_and_results
尽量保留：
- target school；
- target program；
- stage（夏令营/预推免/正式推免等）；
- application result；
- final result；
- offer/录取口径；
- notes。

## 4. 缺失值规则

- 原始资料没有写：null；
- 原始资料语义模糊：null + quality note；
- 不从学校名称自动推断“985/211/双一流”等标签，除非后续主项目统一维护院校事实表；
- 不从文字描述自行推断精确 GPA、排名或概率；
- 不把“入营”“优秀营员”“预录取”“候补”“最终录取”混成同一个 result。

## 5. 九辰案例与外部案例

必须显式区分：

```text
is_jiuchen_case = true
只有在能够确认该案例来自九辰自身服务记录时使用

is_jiuchen_case = false
来自其它可靠来源的真实案例
```

外部真实案例可以用于检索和分析，但对用户展示时不能写成“九辰成功案例”。

## 6. 可追溯性

未来 AI 返回：

```text
“与你相似的案例……”
```

必须能够从：
- Assessment Evidence Ref
- Case ID
- source_id
- 原始 locator

一路追溯到实际数据来源。

因此预处理时不要只保留“整理后的漂亮文本”，还要保留来源定位。

## 7. 去重

重复案例可能来自：
- 同一案例多个版本；
- 表格 + PDF 重复；
- 不同文档引用同一案例。

预处理分支需要：
- 给出 dedupe key / 判断依据；
- 不确定是否重复时不要强行合并；
- 在 quality_report 中列出疑似重复集合。

## 8. 面向检索，而不是面向训练

当前主线首先用于 RAG / 相似案例检索。

因此数据优先保证：
- 结构准确；
- 来源可靠；
- 缺失透明；
- 可筛选；
- 可比较；
- 可追溯。

不要求现在就：
- 转成问答对；
- 生成 instruction tuning 数据；
- 生成模型偏好对；
- 切训练/验证集。

这些只有未来真的进入微调阶段时再单独生成。

## 9. 主线收到数据后的下一步

主线会依次：

1. 审计真实字段覆盖；
2. 冻结 Case Schema v1；
3. 写导入校验器；
4. 建 Test MySQL Case 表；
5. 实现结构化 Retriever；
6. 接入 Assessment Evidence；
7. 做离线相似案例检索评测；
8. 最后再接真实模型 Provider。

因此预处理分支不需要自行设计生产数据库。
