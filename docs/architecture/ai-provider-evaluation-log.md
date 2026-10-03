# AI provider evaluation log

This file records only non-secret provider/model decisions. Append one section per tested model.

## Template

### YYYY-MM-DD — <provider> / <model>

- Purpose: assessment | schedule | customer
- Region:
- Protocol:
- Model ID:
- Pricing snapshot date:
- Input price:
- Output price:
- Relevant limits:
- Structured output:
- Tool calling:
- Vision:
- Eval dataset: JC-EVAL-1.0.0 (92 frozen) or other explicit version
- Smoke 5:
- Smoke 20:
- Full 92:
- Mean / p95 latency:
- Total input tokens:
- Total output tokens:
- Estimated CNY cost:
- Critical failures:
- Decision: ACCEPT | REJECT | RETEST
- Reason:
- Follow-up:

## 2026-10-03 — Alibaba Bailian / qwen3.5-27b

- Purpose: assessment
- Region: 华北2（北京）
- Protocol: OpenAI-compatible Chat Completions
- Model ID: `qwen3.5-27b`
- Structured output: JSON mode validated
- Evaluation data: JC-EVAL-1.0.0
- Evaluation integrity: 5 Core cases were used for prompt calibration and are excluded from the blind-quality aggregate. Blind-quality set = 75 Core + 12 Language Extension = 87 cases.
- Calibration prompt: `tools/evaluation/prompts/jc-label-v1.1.txt`
- Pricing inputs used by the local runner: CNY 0.6 / million input tokens, CNY 4.8 / million output tokens. Treat this as the evaluation snapshot, not a permanent billing contract.

### Non-thinking baseline

Runtime option:

```json
{"enable_thinking":false}
```

Core blind 75:
- provider / parse errors: 0
- discipline Exact: 0.9429 (n=70)
- academic: Exact 0.7586; ±1 band 1.0; no-reference abstention 0.4783
- language: Exact 1.0; ±1 band 1.0; no-reference abstention 1.0
- research: Exact 0.4902; ±1 band 1.0; no-reference abstention 0.4167
- competition: Exact 0.2308; ±1 band 0.9231; no-reference abstention 0.3056
- practice: no scored references; abstention 1.0
- mean latency: 2391.9 ms
- p95 latency: 3896 ms
- input tokens: 98,515
- output tokens: 4,410
- estimated cost: CNY 0.080277

Language Extension 12:
- provider / parse errors: 0
- discipline Exact: 1.0
- language Exact: 1.0; ±1 band 1.0
- academic: Exact 0.6; ±1 band 0.8
- research: Exact 0.25; ±1 band 1.0
- competition: Exact 0.1429; ±1 band 1.0
- mean latency: 2242.9 ms
- p95 latency: 3658 ms
- input tokens: 16,392
- output tokens: 665
- estimated cost: CNY 0.013027

Blind 87 total:
- input tokens: 114,907
- output tokens: 5,075
- estimated cost: CNY 0.093304
- provider / parse errors: 0

### Thinking challenger

Runtime option used:

```json
{"enable_thinking":true,"thinking_budget":4096}
```

Core blind 75:
- provider / parse errors: 0
- discipline Exact: 0.9429
- academic: Exact 0.7586; ±1 band 1.0; no-reference abstention 0.5435
- language: Exact 1.0; ±1 band 1.0; no-reference abstention 0.9855
- research: Exact 0.4706; ±1 band 1.0; no-reference abstention 0.3333
- competition: Exact 0.1795; ±1 band 0.9231; no-reference abstention 0.4722
- mean latency: 4947.8 ms
- p95 latency: 8121 ms
- input tokens: 98,365
- output tokens: 13,968
- reasoning tokens: 7,533
- estimated cost: CNY 0.126065

Language Extension 12:
- provider / parse errors: 0
- discipline Exact: 1.0
- language Exact: 0.9167; ±1 band 1.0
- academic: Exact 0.6; ±1 band 0.8
- research: Exact 0.25; ±1 band 1.0
- competition: Exact 0.0; ±1 band 1.0
- mean latency: 4183.9 ms
- p95 latency: 4777 ms
- input tokens: 16,368
- output tokens: 1,828
- reasoning tokens: 908
- estimated cost: CNY 0.018595

Blind 87 total:
- input tokens: 114,733
- output tokens: 15,796
- reasoning tokens: 8,441
- estimated cost: CNY 0.144660
- provider / parse errors: 0

### Decision

**Selected runtime baseline: qwen3.5-27b, non-thinking.**

The thinking challenger is not selected as the default:
- it did not improve the key Exact metrics;
- research Exact declined from 0.4902 to 0.4706;
- competition Exact declined from 0.2308 to 0.1795;
- Language Extension Exact declined from 1.0 to 0.9167;
- blind-run estimated cost increased by about 55%;
- Core mean latency increased by about 2.07x.

This evaluation supports provider/mode selection and engineering readiness. It does **not** turn rule-derived labels into human expert ground truth. Research and competition remain the weakest subjective dimensions, so production must retain bounded evidence, deterministic rule constraints where available, uncertainty, and reviewability rather than treating raw model scores as authoritative expert truth.

Follow-up:
1. Do not rerun this same model/mode merely for reassurance.
2. Move to the production Assessment schema/runtime gate.
3. Configure the selected model only in the ECS private environment.
4. Mount the approved private case corpus.
5. Re-enter real-device Assessment acceptance after the production gate.
6. Re-evaluate only if the model, rubric, prompt contract, or evaluation data materially changes.

## Secret policy

Do not commit API keys, secret-bearing URLs, Workspace credentials, or private case text. Use environment-variable names and generic endpoint patterns only.
