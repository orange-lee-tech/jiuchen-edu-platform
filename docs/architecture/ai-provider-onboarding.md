# AI Provider 购买与接入｜Jiuchen V1

## 当前最短路径

生产后端已经实现 OpenAI-compatible Chat Completions Provider：

- `ASSESSMENT_AI_BASE_URL / API_KEY / MODEL`
- `SCHEDULE_AI_BASE_URL / API_KEY / MODEL`
- `CUSTOMER_AI_BASE_URL / API_KEY / MODEL`

因此第一阶段不需要安装某家厂商 SDK，也不要让小程序直接持有模型 Key。

推荐先用 **阿里云百炼按量付费** 跑 Evaluation，再决定生产模型。原因：
1. ECS 已在阿里云，账号/计费链路最短；
2. 百炼提供 OpenAI-compatible endpoint；
3. 同一平台可测试千问、DeepSeek、GLM 等标准模型，减少多家充值和密钥管理；
4. 模型可随时通过环境变量替换。

## 购买/开通步骤

1. 登录阿里云控制台，进入 **大模型服务平台百炼 / Model Studio**。
2. 选择 **华北2（北京）** 作为第一阶段区域。
3. 开通模型服务和按量付费。开发阶段先小额充值即可，不建议一开始买大套餐。
4. 新建业务空间，建议至少：
   - `jiuchen-assessment`
   - 后续再建 `jiuchen-customer`
   - 后续再建 `jiuchen-schedule`
5. 在 assessment 业务空间创建 API Key。完整 Key 只在安全位置保存，不提交 Git。
6. 记录该业务空间的 WorkspaceId。
7. OpenAI-compatible Base URL 使用：
   `https://<WorkspaceId>.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`

不要把 Token Plan 的 Key/Base URL 与普通按量 API Key 混用；它们是两套独立入口。

## 当前已选模型

2026-10-03 的真实 Evaluation 已完成。

当前 Assessment 生产集成基线：

- Provider：阿里云百炼
- Region：华北2（北京）
- Model：`qwen3.5-27b`
- Mode：`enable_thinking=false`
- Protocol：OpenAI-compatible Chat Completions

Thinking challenger（`thinking_budget=4096`）已经完成同一批盲测，但没有改善关键 Exact 指标，同时显著增加延迟和输出 Token，因此**不作为默认生产模式**。

不要再按旧计划优先测试 `qwen3.8-flash`；除非未来明确启动“新模型 challenger”任务，否则当前工作应从模型选择转向生产 Assessment gate。

完整结果见：
`docs/architecture/ai-provider-evaluation-log.md`

## 本地评测

在 PowerShell 当前窗口设置。当前本地已验证北京共享 OpenAI-compatible Base URL；生产可继续使用经过批准的北京 endpoint，并保持 Key 只在私有环境：

```powershell
$env:EVAL_AI_PROVIDER="aliyun-bailian"
$env:EVAL_AI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
$env:EVAL_AI_API_KEY="<只在你本机填写>"
$env:EVAL_AI_MODEL="qwen3.5-27b"

$env:EVAL_PRICE_INPUT_PER_MILLION="0.6"
$env:EVAL_PRICE_OUTPUT_PER_MILLION="4.8"
$env:EVAL_PRICE_CURRENCY="CNY"

node tools/evaluation/runner.mjs inspect
node tools/evaluation/runner.mjs run --dry-run
$env:EVAL_AI_EXTRA_BODY_JSON='{"enable_thinking":false}'
$env:EVAL_JSON_MODE="true"

node tools/evaluation/runner.mjs inspect
node tools/evaluation/runner.mjs run --dry-run

# 已完成的正式基线不要为“确认一下”重复重跑。
# 只有模型 / Prompt / rubric / dataset materially changes 时才启动新 run-id。
```

5 条无报错后，再扩到 20 条和 92 条。Runner 会记录 usage、延迟、错误和可选费用估算。

## 评测通过后接 ECS

不要改小程序 Key，也不要把 API Key 放到微信后台。

在 ECS 的 Jiuchen API 私有环境变量中配置：

```text
ASSESSMENT_AI_PROVIDER=aliyun-bailian
ASSESSMENT_AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
ASSESSMENT_AI_API_KEY=<server secret>
ASSESSMENT_AI_MODEL=qwen3.5-27b
ASSESSMENT_CASE_DATA_ROOT=/path/to/private/data-source/cases
```

`ASSESSMENT_CASE_DATA_ROOT` 只指向私有案例根目录，不把案例打入 Git 或镜像。
运行时按环境硬分流：`NODE_ENV=production` 只读取
`rag_reference_production_all.jsonl`；development/test/evaluation 只读取
`rag_reference_eval_safe_train_dev.jsonl`。不能用环境变量把正式评测切到 production-all。

每次评估先对本地案例库做确定性轻量打分，只把 Top 10 case evidence 与
Top 3 经过治理的产品知识 chunk 发送给模型。产品知识不能作为目标项目的
录取判断证据；目标判断至少需要一条 school/program/case evidence。

然后只需要重启 Jiuchen API 服务并检查：
- `GET /health/config` -> `assessmentAiConfigured: true`
- `GET /assessments/meta` -> `providerConfigured: true`

生产调用链保持：

```text
微信小程序
  -> https://api.jiuchenedu.com
  -> ECS Jiuchen API
  -> AssessmentModelProvider
  -> 百炼 OpenAI-compatible API
```

Key 永远只在 ECS。

## 三类 AI 不共用密钥/预算

Assessment、客服、课表图像解析分别使用独立业务空间或至少独立凭证：
- Assessment：质量优先，调用次数有限；
- Customer：便宜、短回复、严格限流；
- Schedule：需要视觉能力。

这样客服被刷也不会耗尽评估额度。

## 当前不做

- 不直接在小程序调用模型；
- 不把 Eval outcome 当训练输入；
- 不立即微调；
- 不让 92 条 Eval 进入训练或评测时 RAG；
- 不为了接某一家供应商重写 Runtime。
