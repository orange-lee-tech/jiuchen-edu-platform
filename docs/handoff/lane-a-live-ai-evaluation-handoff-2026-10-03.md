# Lane A handoff — Live AI Evaluation & Runtime Parity — 2026-10-03

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Integration branch: `p1/foundation`

## Scope closed in this lane

This lane completed the live provider/model evaluation gate for Assessment and stopped before production deployment.

No ECS deployment, production DB migration, payment work, customer AI implementation, or secret disclosure was performed.

## Selected provider/runtime baseline

- Provider: `aliyun-bailian`
- Region: 华北2（北京）
- Protocol: OpenAI-compatible Chat Completions
- Model: `qwen3.5-27b`
- Selected mode: `enable_thinking=false`
- Temperature: `0`
- JSON mode: `true`

Required Assessment env names only:

```text
ASSESSMENT_AI_PROVIDER
ASSESSMENT_AI_BASE_URL
ASSESSMENT_AI_API_KEY
ASSESSMENT_AI_MODEL
ASSESSMENT_AI_TEMPERATURE
ASSESSMENT_AI_JSON_MODE
ASSESSMENT_AI_EXTRA_BODY_JSON
ASSESSMENT_CASE_DATA_ROOT
```

Expected non-secret values:

```text
ASSESSMENT_AI_PROVIDER=aliyun-bailian
ASSESSMENT_AI_MODEL=qwen3.5-27b
ASSESSMENT_AI_TEMPERATURE=0
ASSESSMENT_AI_JSON_MODE=true
ASSESSMENT_AI_EXTRA_BODY_JSON={"enable_thinking":false}
```

## Live evaluation chronology

Operator run ID:

`2026-10-03T04-25-33-241Z_qwen3.5-27b`

### 5-case smoke

- completed: 5/5
- provider / parse errors: 0
- input tokens: 4,089
- output tokens: 995
- reasoning tokens: 495
- estimated cumulative cost: CNY 0.007229
- mean / p95 latency: 3474.4 / 3963 ms

### 20-case gate

- completed: 20/20
- skipped by resume: 5
- processed in this step: 15
- provider / parse errors: 0
- cumulative input tokens: 15,779
- cumulative output tokens: 4,827
- cumulative reasoning tokens: 2,738
- estimated cumulative cost: CNY 0.032637
- mean / p95 latency: 4361.9 / 5422 ms

### Frozen JC-EVAL-1.0.0 — 92 cases

- completed: 92/92
- skipped by resume: 20
- processed in this step: 72
- provider / parse errors: 0
- usage-missing rows: 0
- total input tokens: 76,018
- total output tokens: 24,364
- reasoning tokens: 16,055
- cached input tokens: 0
- estimated total cost: CNY 0.162558
- mean / p95 latency: 5312.5 / 12809 ms

Core 80:
- discipline Exact: 0.92
- academic Exact: 0.7742; ±1 band: 1.0
- language Exact: 1.0; ±1 band: 1.0
- research Exact: 0.5094; ±1 band: 0.9811
- competition Exact: 0.2093; ±1 band: 0.9302

Language Extension 12:
- discipline Exact: 1.0
- academic Exact: 0.6; ±1 band: 1.0
- language Exact: 1.0; ±1 band: 1.0
- research Exact: 0.5833; ±1 band: 1.0
- competition Exact: 0.2857; ±1 band: 1.0

Important accounting note: 5/20/92 are cumulative checkpoints of one resumed run. Do not add their cumulative costs together. The unique 92-case run cost is CNY 0.162558.

## Controlled blind comparison

The first 5 Core cases were later treated as prompt-calibration cases and excluded from the blind-quality aggregate.

Blind quality set:
- Core: 75
- Language Extension: 12
- Total: 87

The controlled comparison found:
- non-thinking had zero provider/parse errors;
- thinking did not improve the key Exact metrics;
- research / competition Exact declined in thinking mode;
- Language Extension language Exact declined in thinking mode;
- thinking increased estimated cost and latency materially.

Decision:

**ACCEPT `qwen3.5-27b` with `enable_thinking=false` as the provider/model/mode baseline.**

This ACCEPT is for provider/model/mode selection only. It does not authorize production deployment.

Detailed metrics are in:
`docs/architecture/ai-provider-evaluation-log.md`

## Billing interpretation

The runner's cost fields are estimated from the configured token prices. They are not proof that Alibaba Cloud actually charged that amount.

For the operator's account, the Alibaba console still showed monthly consumption of CNY 0.00 after these calls. Treat:
- runner `estimated_cost_*` as a comparable theoretical cost at the configured unit price;
- Alibaba billing/usage records as the source of truth for actual charged amount;
- free quota or other account-side offsets as possible reasons why actual payable cost remains zero.

Do not add theoretical runner cost to the cloud invoice as if both were charged.

## Production-runtime parity smoke — current state

Command:

```powershell
npm.cmd --prefix services/api run assessment:smoke:live
```

Status: **BLOCKED / RETEST — provider connectivity works, but the real Assessment Agent has not yet produced a valid `assessment-output-v1` object.**

Observed operator attempts include:

### Attempt A — before malformed-JSON repair

```text
HTTP status: 200
finishReason: stop
contentType: string
contentLength: 301
startsWithObject: false
endsWithObject: false
reasoningContentLength: 0
prompt_tokens: 11276
completion_tokens: 301
latency: 26491 ms
runtime error: ai_provider_invalid_json
```

This ruled out a transport/API failure, output-token truncation, and leaked thinking content.

### Attempt B — after `98f2442...`

After pulling the one-bounded-repair implementation, the real runtime smoke was rerun.

Final observed provider call:

```text
HTTP status: 200
finishReason: stop
contentType: string
contentLength: 466
startsWithObject: false
endsWithObject: false
reasoningContentLength: 0
prompt_tokens: 11610
completion_tokens: 466
total_tokens: 12076
latency: 29865 ms
runtime error: ai_provider_invalid_json
```

The raw final content was a long JSON numeric scalar beginning with `0.999999...`.

Important interpretation:
- `0.999...` is syntactically valid JSON, but it is not the required top-level Assessment object;
- Alibaba's JSON Object mode guarantees JSON formatting but not the Jiuchen business schema, so downstream schema validation and bounded repair are still required;
- Qwen3.5 open-source models are documented as supporting JSON Object in non-thinking mode;
- the production runtime therefore must distinguish “invalid JSON syntax” from “valid JSON with the wrong top-level/business type”.

## Runtime hardening already landed

### `98f2442daf9d3b933c3be1b5081f45cae3a9c0bf`

`fix(ai): repair malformed assessment JSON once`

- preserves malformed response text;
- routes initial invalid-JSON output into the existing single repair budget;
- prevents unlimited repair loops;
- removes the Assessment `max_tokens` cap in line with structured-output guidance;
- CI: PASS.

### `68d57a7429843b17ed3c1339f822b3c7d7f46616`

`fix(ai): harden assessment output contract`

- parses any syntactically valid JSON value first, so a scalar such as `0.999` reaches `assessment-output-v1` schema validation instead of being mislabeled as invalid JSON;
- preserves prose-wrapped JSON-object fallback parsing;
- strengthens the real Assessment prompt with an explicit top-level object rule and nested field/type skeleton;
- explicitly forbids scalar/array/null top-level output;
- keeps exactly one bounded repair budget;
- adds regressions for valid JSON primitives and scalar-to-object repair;
- records the parity blocker in the evaluation log and main-control status;
- GitHub CI (push): **PASS**.

## Current repository handoff commits

Evaluation / model-selection:
- `ab3e973dda2450d6b178f4c1cd959446e4f2359f` — docs(ai): record live 5-20-92 evaluation gate
- `8eb80caf96660853f4baac3a721457d7a38d0764` — docs(ai): fix evaluation decision formatting

Runtime parity:
- `98f2442daf9d3b933c3be1b5081f45cae3a9c0bf` — fix(ai): repair malformed assessment JSON once
- `68d57a7429843b17ed3c1339f822b3c7d7f46616` — fix(ai): harden assessment output contract

Handoff/accounting docs after that commit may advance the shared branch; preserve them and pull latest before any new edit.

## Only remaining Lane A parity action

Pull the latest shared branch so the local checkout contains `68d57a...` or later, retain the existing private env values, and rerun the real runtime smoke **once**:

```powershell
git pull --ff-only origin p1/foundation
git rev-parse HEAD
npm.cmd --prefix services/api run assessment:smoke:live
```

Expected gate:
- real `assessment-output-v1` path executes;
- eval-safe private case corpus is used;
- no production DB write;
- malformed/wrong-shape first response may consume at most one bounded repair;
- final output must pass schema and evidence validation.

If this smoke returns `ok: true`:
- Lane A stops;
- hand the runtime contract to Lane B;
- main control may then consider the separate Assessment production schema/runtime gate.

If it still returns a JSON scalar or repeatedly fails the object contract:
- do **not** keep prompt-tuning indefinitely;
- record qwen3.5-27b as provider/model benchmark ACCEPT but real-Agent structured-output compatibility RETEST/FAIL;
- consider a focused challenger that supports strict JSON Schema for the production Agent, then subject any model change to the required quality/cost evaluation before deployment.

Do not deploy production or execute production schema writes from this lane.

## Case-data runtime contract

`ASSESSMENT_CASE_DATA_ROOT` points to the private case root, with:

```text
data-source/cases/
└─ ai/
   └─ rag/
      └─ v1.0.0/
         ├─ rag_reference_eval_safe_train_dev.jsonl
         └─ rag_reference_production_all.jsonl
```

Environment split:
- development/test/evaluation -> eval-safe RAG only;
- production -> production-all RAG;
- frozen Eval cases must never be inserted into Eval-time RAG;
- Eval outcomes must not be training/few-shot/RAG input.

## Do not reopen

- do not rerun the same 92-case benchmark merely for reassurance;
- do not tune expected labels against the evaluated model;
- do not commit API keys;
- do not commit private case text;
- do not deploy ECS from this lane;
- do not execute production DB migration from this lane;
- do not begin customer AI or payment work from this lane.
