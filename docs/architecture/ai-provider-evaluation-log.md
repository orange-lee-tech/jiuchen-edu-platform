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

### Initial live gate chronology — 5 → 20 → 92

This chronology records the first operator-run live-provider gate for `qwen3.5-27b`.
It proves request/usage/error/cost/latency stability, but it is **not** the blind-quality
aggregate used for the final model/mode decision below: the first 5 Core cases were
later treated as prompt-calibration cases, and this run used the provider's default
thinking behavior rather than the selected explicit non-thinking contract.

Run ID: `2026-10-03T04-25-33-241Z_qwen3.5-27b`

Smoke 5:
- completed: 5/5
- provider / parse errors: 0
- input tokens: 4,089
- output tokens: 995
- reasoning tokens: 495
- estimated cumulative cost: CNY 0.007229
- mean / p95 latency: 3474.4 / 3963 ms

Smoke 20 (resumed from the same run):
- completed: 20/20
- skipped by resume: 5
- newly processed: 15
- provider / parse errors: 0
- cumulative input tokens: 15,779
- cumulative output tokens: 4,827
- cumulative reasoning tokens: 2,738
- estimated cumulative cost: CNY 0.032637
- mean / p95 latency: 4361.9 / 5422 ms
- Core 20 discipline Exact: 0.9474 (n=19)
- academic: Exact 0.6; ±1 band 1.0
- language: Exact 1.0; ±1 band 1.0
- research: Exact 0.5714; ±1 band 1.0
- competition: Exact 0.2143; ±1 band 1.0

Full 92 (resumed from the same run):
- completed: 92/92
- skipped by resume: 20
- newly processed: 72
- provider / parse errors: 0
- usage-missing rows: 0
- total input tokens: 76,018
- total output tokens: 24,364
- reasoning tokens: 16,055
- cached input tokens: 0
- estimated total cost: CNY 0.162558
- mean / p95 latency: 5312.5 / 12809 ms

Core 80:
- discipline Exact: 0.92 (n=75)
- academic: Exact 0.7742; ±1 band 1.0
- language: Exact 1.0; ±1 band 1.0
- research: Exact 0.5094; ±1 band 0.9811
- competition: Exact 0.2093; ±1 band 0.9302
- practice: no scored references; abstention 1.0

Language Extension 12:
- discipline Exact: 1.0
- academic: Exact 0.6; ±1 band 1.0
- language: Exact 1.0; ±1 band 1.0
- research: Exact 0.5833; ±1 band 1.0
- competition: Exact 0.2857; ±1 band 1.0
- practice: no scored references; abstention 1.0

Cost accounting:
- the 5-, 20-, and 92-case values above are cumulative checkpoints of one resumed run;
- do **not** add CNY 0.007229 + 0.032637 + 0.162558;
- the total unique 92-case cost is CNY 0.162558;
- the incremental 15-case step cost CNY 0.025408 and the incremental 72-case step cost CNY 0.129921.

Gate result:
- live provider/runtime-request gate: **PASS**;
- final model/mode selection: use the controlled blind comparison below, not this
  calibration-contaminated/default-thinking run.

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

### Production-runtime parity smoke — BLOCKED / handoff

The provider/model/mode selection above is complete, but the real Assessment Agent
runtime has **not** passed its local live smoke yet. Do not promote the Assessment
production gate solely from the benchmark result.

Observed 2026-10-03 local live-runtime attempts, using eval-safe private RAG and the
real `assessment-output-v1` path:

1. First live runtime attempt:
   - HTTP status: 200
   - finish reason: `stop`
   - content type: string
   - content length: 301
   - top-level object markers: absent
   - reasoning content length: 0
   - prompt / completion tokens: 11,276 / 301
   - end-to-end smoke latency: 26,491 ms
   - result: `ai_provider_invalid_json`

2. Second attempt after removing the Assessment `max_tokens` cap and adding one
   bounded malformed-JSON repair:
   - final observed provider call returned HTTP 200 / `finish_reason=stop`
   - content length: 466
   - reasoning content length: 0
   - prompt / completion tokens: 11,610 / 466
   - returned content was a syntactically valid JSON numeric scalar
     (`0.999...`), not an `assessment-output-v1` object
   - end-to-end smoke latency: 29,865 ms
   - result remained blocked

Interpretation:
- this is not a truncation signal and not a leaked thinking response;
- Alibaba documentation says JSON Object mode guarantees JSON formatting but does
  not guarantee the required business structure, so downstream schema validation
  and bounded repair remain mandatory;
- `qwen3.5` open-source series is documented as supporting JSON Object in
  non-thinking mode;
- the provider parser previously conflated “valid JSON scalar” with “invalid JSON”;
  the handoff code now preserves valid JSON values for business-schema validation
  and strengthens the Assessment prompt with an explicit top-level object/type
  skeleton.

Gate rule:
- keep provider/model selection = ACCEPT;
- keep **production Assessment runtime = BLOCKED / RETEST** until
  `npm --prefix services/api run assessment:smoke:live` returns `ok: true`;
- do not execute the production Assessment schema/runtime deployment merely to
  discover this same Agent-contract failure in production.

### Decision

**Decision: ACCEPT — selected runtime baseline is qwen3.5-27b, non-thinking.**

This ACCEPT decision covers provider/model/mode selection only. It does not authorize production deployment; the production-runtime parity smoke and separate production schema/runtime gate still apply.

The thinking challenger is not selected as the default:
- it did not improve the key Exact metrics;
- research Exact declined from 0.4902 to 0.4706;
- competition Exact declined from 0.2308 to 0.1795;
- Language Extension Exact declined from 1.0 to 0.9167;
- blind-run estimated cost increased by about 55%;
- Core mean latency increased by about 2.07x.

This evaluation supports provider/mode selection and engineering readiness. It does **not** turn rule-derived labels into human expert ground truth. Research and competition remain the weakest subjective dimensions, so production must retain bounded evidence, deterministic rule constraints where available, uncertainty, and reviewability rather than treating raw model scores as authoritative expert truth.

Follow-up:
1. Do not rerun the 87-case benchmark merely for reassurance.
2. Re-run only the local real Assessment runtime smoke after pulling the latest runtime-contract hardening; this is a different gate from the frozen benchmark.
3. Proceed to the production Assessment schema/runtime gate only after that smoke returns `ok: true`.
4. Configure the selected model only in the ECS private environment and mount the approved private case corpus.
5. Re-enter real-device Assessment acceptance after the production gate.
6. Re-run the frozen benchmark only if the model, rubric, evaluation prompt contract, or evaluation data materially changes.

## Secret policy

Do not commit API keys, secret-bearing URLs, Workspace credentials, or private case text. Use environment-variable names and generic endpoint patterns only.
