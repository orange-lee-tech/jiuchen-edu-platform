# AI 保研评估接口契约（V1）

> 状态：Draft / 可施工  
> 更新时间：2026-09-20  
> 目标：先冻结输入、输出、证据和运行边界，再接案例库与具体大模型。

## 1. 总体链路

```text
用户资料 / 本次补充信息
        ↓
AssessmentInput v1
        ↓
Retriever
  ├─ 院校/项目事实
  ├─ 九辰案例
  └─ 外部案例
        ↓
Evidence Snapshot
        ↓
Model Provider Adapter
        ↓
AssessmentOutput v1
        ↓
Schema + Evidence Reference Validation
        ↓
Assessment Record
        ↓
小程序展示
```

V1 不把模型训练作为前置条件。

## 2. AssessmentInput v1

核心结构：

```json
{
  "profile": {
    "university": "本科院校",
    "major": "专业",
    "currentGrade": "年级",
    "gpaText": "绩点/均分",
    "rankText": "排名",
    "backgroundNote": "其它背景说明"
  },
  "english": [],
  "research": [],
  "competitions": [],
  "targets": [],
  "preferences": {}
}
```

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

支持：
- CET-4
- CET-6
- IELTS
- TOEFL
- GRE
- other

每条包含：
- type
- score
- note

### research

最多 12 条。

支持：
- project
- paper
- patent
- lab
- other

字段：
- title
- type
- role
- organization
- level
- description
- output

### competitions

最多 12 条。

字段：
- name
- level
- award
- role
- description

### targets

1–5 个目标。

字段：
- schoolName
- programName
- researchDirection
- note

## 3. AssessmentOutput v1

必须为结构化 JSON，不允许直接保存一整段自由文本作为唯一结果。

输出至少包含：

- profileSummary
- strengths
- risks
- targetAssessments
- recommendedActions
- similarCases
- uncertainties
- disclaimer

### targetAssessments

每个目标院校/项目采用定性分层：

- reach
- match
- conservative
- insufficient_data

不输出精确录取概率。

每个目标结果至少包含：
- schoolName
- programName
- tier
- rationale
- gapItems
- actions
- evidenceRefs

## 4. 证据约束

模型不能自行发明案例 ID 或数据来源。

每次运行先产生 Evidence Snapshot，证据项包含：

- ref
- kind
- sourceType
- sourceId
- title
- sourceLabel
- sourceUrl
- year
- excerpt

sourceType 至少区分：
- jiuchen
- external
- official
- internal

允许用户输入证据使用 `input:...` 形式引用。

目标院校分析必须至少引用一条 Retriever 实际返回的证据；仅引用用户输入不足以形成“目标项目判断”。

相似案例必须引用真实存在于 Evidence Snapshot 中的 case evidence。

当前运行时进一步约束：
- `input:` 引用必须来自服务端为本次结构化输入生成的白名单，模型不能自由拼接；
- `similarCases.caseId/sourceType` 必须与所引 case evidence 完全一致；
- 产品知识只用于解释九辰服务与行动建议，不能支撑目标项目的录取层级；
- Schema 或 evidence 校验失败时最多允许一次修复调用，第二次失败即整次失败且不扣额度。

### V1 案例检索

- Eval/development/test：只读 eval-safe 656 条 train/dev RAG；
- Production：只读 production-all 748 条 RAG；
- 全库只在服务端做确定性候选打分，模型每次最多接收 10 条案例 evidence；
- evidence ref 使用数据中的稳定 `doc_id` 派生，不由模型生成；
- 外部历史案例明确标注为“非九辰自有成功案例”。

## 5. 版本追踪

每条 Assessment 固化：

- inputSchemaVersion
- outputSchemaVersion
- agentVersion
- knowledgeVersion
- provider
- model

这样后续换模型、换 Prompt、换案例库后，旧评估仍然可以解释。

## 6. 运行状态

Assessment 状态：

- draft
- running
- succeeded
- failed

Provider 未配置时：
- 不生成假结果；
- `run` 返回明确的 provider_not_configured；
- draft 保持可重试。

模型调用失败时：
- status = failed；
- 记录 failureCode；
- 不消耗评估额度。

## 7. API

### GET /assessments/meta

无需登录。

返回：
- 当前 Input/Output/Agent 版本；
- 数组长度限制；
- provider 是否配置；
- 输出政策。

### POST /me/assessments

登录后创建 Draft。

请求：
```json
{
  "input": {}
}
```

### PUT /me/assessments/:id

仅允许当前 User 更新自己的 `draft`。

更新时：
- 重新执行 AssessmentInput v1 校验；
- 覆盖本次 input 快照；
- 清空旧 evidence / output / provider / model / knowledgeVersion；
- 不允许直接编辑 running / succeeded / failed 记录。

### GET /me/assessments

只返回当前 User 自己的历史评估。

### GET /me/assessments/:id

只能读取当前 User 自己的评估。

### POST /me/assessments/:id/run

执行评估。

当前 Provider 未配置时必须安全失败，不生成模拟 AI 内容。

## 8. 额度策略

当前 Assessment 表已有 `creditConsumed` 字段，但 V1 AI 骨架阶段保持 false。

以后接 CreditLedger 时原则：
- Provider/检索失败不扣额度；
- Schema 校验失败不扣额度；
- 只有达到业务定义的“成功评估”后才记账；
- 额度变化必须存在 Ledger 记录，不能只改一个整数。

## 9. 暂不冻结的内容

等案例预处理样本回来后再决定：

- Case 的最终数据库字段；
- 院校/项目数据表结构；
- Retriever 相似度算法；
- 是否需要向量检索；
- Prompt 具体内容；
- 模型供应商；
- 模型名称；
- 后续是否微调。

这些都不应阻塞当前接口契约。
