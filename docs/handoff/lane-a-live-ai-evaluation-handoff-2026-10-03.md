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

## Production-runtime parity smoke — current state

The operator ran the real Assessment runtime smoke on local commit:

`3bd7abf367349a2690b2e5fa37960d5d4ac819d2`

Command:

```powershell
npm.cmd --prefix services/api run assessment:smoke:live
```

Result: **FAILED on the old local head**.

Observed provider diagnostic:

```text
HTTP status: 200
finishReason: stop
contentType: string
contentLength: 316
startsWithObject: false
endsWithObject: false
reasoningContentLength: 0
prompt_tokens: 12194
completion_tokens: 316
total_tokens: 12510
latency: 34744 ms
runtime error: ai_provider_invalid_json
```

The raw model content was a long decimal beginning with `0.999999...`, not a JSON object.

This was not an API connectivity failure. It was a malformed model-output shape that the old runtime did not spend its existing single repair budget on.

## Existing fix already landed remotely

After local commit `3bd7abf...`, another parallel lane landed:

`98f2442daf9d3b933c3be1b5081f45cae3a9c0bf — fix(ai): repair malformed assessment JSON once`

That fix:
- adds `JsonModelProviderInvalidJsonError` and preserves the raw malformed text;
- routes initial invalid-JSON output into the existing one-repair budget;
- prevents a second repair after that budget is consumed;
- adds tests for this exact malformed-JSON path;
- does not create a second retry/repair architecture.

GitHub CI for `98f2442...`: **PASS**.

Therefore the failure above must not be treated as an unresolved code defect until the smoke is rerun after syncing past `98f2442...`.

## Current repository handoff commits

Live-evaluation chronology/logging:
- `ab3e973dda2450d6b178f4c1cd959446e4f2359f` — docs(ai): record live 5-20-92 evaluation gate
- `8eb80caf96660853f4baac3a721457d7a38d0764` — docs(ai): fix evaluation decision formatting

Runtime malformed-JSON repair from the parallel lane:
- `98f2442daf9d3b933c3be1b5081f45cae3a9c0bf`

## Only remaining Lane A parity action

Sync the local `p1/foundation` so it contains `98f2442...` or later, retain the already-configured private env values, and rerun:

```powershell
git pull
git rev-parse HEAD
npm.cmd --prefix services/api run assessment:smoke:live
```

Expected gate:
- real `assessment-output-v1` path executes;
- eval-safe case corpus is used;
- no production DB write;
- malformed first response may consume at most the one bounded repair;
- final output must pass schema/evidence validation.

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
