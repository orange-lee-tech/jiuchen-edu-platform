# Jiuchen Evaluation Runner

这是九辰案例评测的本地 CLI。它只读 `data-source/cases/ai/evaluation/v1.0.0/`，结果写到被 Git 忽略的 `data-source/cases/ai/evaluation/runs/`，不修改生产 API、不触碰小程序。

## 各部分作用

- **inspect**：检查 92 条 Eval 文件是否齐全、标签覆盖是否符合清单。
- **run**：调用任意 OpenAI-compatible `/chat/completions` 模型并保存预测。
- **score**：不再调用模型，重新对已有预测计分，适合调整评分器后重算。
- **predictions.jsonl**：逐条模型输出，可断点续跑；失败记录会在恢复时重试，评分只取每个 eval_id 的最后一次结果。
- **score_summary.json / report.md**：Exact、±1 档、无参考时克制率。
- **run_config.json**：记录模型、参数、数据路径，不保存 API Key。
- **errors.jsonl**：单独收集最终仍失败的请求；429/5xx/超时/常见网络瞬断会按有限重试策略处理。
- **run_summary.json**：汇总当前选择集的总 token、缓存命中 token、reasoning token、mean/p95 延迟、错误类型和费用；断点续跑后仍按完整结果重算。

## 推荐执行顺序

```powershell
node tools/evaluation/runner.mjs inspect
node tools/evaluation/runner.mjs run --dry-run
node tools/evaluation/runner.mjs run --subset core_representative --limit 5 --concurrency 1
node tools/evaluation/runner.mjs run --subset core_representative --limit 20 --concurrency 2
node tools/evaluation/runner.mjs run --concurrency 2
```

默认会断点续跑；换 Prompt 时建议显式指定新的 `--run-id`。

## 调试余地

可调：
- `--subset core_representative|language_extension|all`
- `--limit / --offset / --case-id`
- `--concurrency / --timeout-ms / --retries`
- `--temperature / --max-tokens / --json-mode`
- `--system-prompt <path>`
- `--model <name>`
- `EVAL_AI_EXTRA_BODY_JSON` 追加供应商特有参数；不能覆盖 runner 冻结的 model/messages/temperature/max_tokens/stream 核心请求字段。
- 若供应商对缓存命中输入单独计价，可设置 `EVAL_PRICE_CACHED_INPUT_PER_MILLION`；未设置时按普通输入单价保守估算。

因此 Runner 不绑定千问；只要服务兼容 OpenAI Chat Completions，就可以用同一套 Eval 对比。

## 安全

不要把 API Key 写进 Git、截图或聊天。建议只在当前 PowerShell 会话或服务器 root-only env 中设置。

正式模型评测期间，生产 Assessment Runtime 以外的本地环境固定使用
`rag_reference_eval_safe_train_dev.jsonl`；现有标签 runner 本身不会读取任何 RAG
或 outcome 文件，只向模型发送 `eval_inputs.jsonl`。不得把 production-all 或
`eval_outcomes_retrospective.jsonl` 追加到 system prompt/few-shot。
