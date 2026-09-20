# AI 保研评估 API 契约

> 状态：Foundation  
> 更新时间：2026-09-20

本文件定义 V1 AI 保研评估的稳定边界。案例库、模型供应商和额度系统可以后续替换/补充，但不得随意破坏这里的输入输出契约。

## 1. 设计目标

评估链路拆成：

```text
小程序结构化输入
  -> Assessment Draft
  -> Retriever
  -> Evidence Context
  -> Model Provider
  -> Strict Output Schema
  -> Assessment Result
```

当前阶段只实现：
- 输入 Schema；
- 输出 Schema；
- Evidence Schema；
- Draft / History / Run API；
- 可替换 Retriever / Provider 接口；
- Assessment 持久化。

当前阶段不实现：
- 真实 Case Retriever；
- 真实模型 Provider；
- CreditLedger 扣减；
- 训练/微调。

因此当前 `run` 在 Provider 未配置时必须返回明确错误，不得生成假报告。

## 2. 输入版本

当前：
- `assessment-input-v1`

### profile
必填：
- university
- major
- currentGrade

可选：
- gpaText
- rankText
- backgroundNote

### english
最多 6 条。

类型：
- CET-4
- CET-6
- IELTS
- TOEFL
- GRE
- other

### research
最多 12 条。

每条可记录：
- title
- type
- role
- organization
- level
- description
- output

### competitions
最多 12 条。

### targets
1–5 个目标。

每个目标：
- schoolName
- programName
- researchDirection
- note

### preferences
可选：
- preferredRegions
- researchDirection
- note

## 3. 输出版本

当前：
- `assessment-output-v1`

结果至少包含：
- profileSummary
- strengths
- risks
- targetAssessments
- recommendedActions
- similarCases
- uncertainties
- disclaimer

### targetAssessments.tier

只允许：
- `reach`
- `match`
- `conservative`
- `insufficient_data`

不提供精确录取概率字段。

输出 Schema 使用 strict 模式。模型如果输出类似：

```json
{
  "admissionProbability": 0.72
}
```

将被 Schema 拒绝。

## 4. Evidence

每条关键判断可以引用 evidenceRef。

Evidence 类型：
- school
- program
- case
- policy
- other

来源类型：
- jiuchen
- external
- official
- internal

每次成功 Assessment 将保存实际使用的 Evidence 快照，而不是只保存最终文字。

## 5. API

### GET /assessments/meta

无需登录。

返回：
- input/output/agent 版本；
- 输入数量限制；
- Provider 是否配置；
- 输出政策。

### POST /me/assessments

需要 UserSession。

角色：
- 游客 user：允许；
- student：允许；
- teacher / staff / admin：默认不作为用户侧 AI 评估入口。

Body：

```json
{
  "input": {
    "profile": {},
    "english": [],
    "research": [],
    "competitions": [],
    "targets": []
  }
}
```

行为：
- 只创建 Draft；
- 校验并保存完整输入快照；
- 不调用模型；
- 不消耗额度。

### GET /me/assessments

读取当前用户最近 50 条评估。

### GET /me/assessments/:id

只能读取自己的评估记录。

### POST /me/assessments/:id/run

未来真正执行：
1. Retriever 检索事实/案例；
2. Model Provider 分析；
3. Output Schema 校验；
4. 保存 Evidence 与输出；
5. 成功后再交给 CreditLedger 处理额度。

当前 Provider 未配置时返回：

```text
503 assessment_provider_not_configured
```

不得把未运行的 Draft 标记成失败，也不得扣额度。

## 6. 状态机

```text
draft
  -> running
      -> succeeded
      -> failed

failed
  -> 可以重新 run

succeeded
  -> 默认不重复 run
```

## 7. 可追溯字段

Assessment 保存：
- inputSchemaVersion
- outputSchemaVersion
- agentVersion
- provider
- model
- knowledgeVersion
- inputJson
- evidenceJson
- outputJson
- failureCode
- creditConsumed
- timestamps

这样即使半年后 Prompt、案例库或模型变化，历史报告仍能知道当时使用的版本。

## 8. Case Schema 暂不冻结

九辰已准备 AI 案例数据，但原始数据尚在独立分支预处理。

当前不根据截图或猜测强行设计 Case 生产表。

Case Schema 必须等预处理结果出来后，根据真实字段完成：
- 字段覆盖审计；
- 来源/版权/公开状态；
- 匿名化；
- 结果口径；
- 去重；
- 年份；
- 九辰案例 vs 外部案例。

之后再连接 AssessmentRetriever。

## 9. 训练边界

当前 Assessment API 与是否训练模型无关。

未来可以替换：

```text
API 商用模型
-> RAG + API 模型
-> 微调模型
-> 自有专用模型
```

只要 Provider Adapter 仍返回同一 Output Schema，小程序与历史记录层无需重写。
