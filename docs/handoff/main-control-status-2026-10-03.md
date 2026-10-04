> **SUPERSEDED FOR CURRENT EXECUTION — 2026-10-04**
>
> This file is retained as history. Current source of truth:
> `docs/handoff/main-control-status-2026-10-04.md`
>
> In particular, the qwen3.5 runtime blocker, missing Assessment production schema, missing production case corpus, and old production release recorded below are no longer current.

# Main control status — 2026-10-03 (refreshed)

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Integration branch: `p1/foundation`

Source-code baseline verified before this status refresh:
`dcad4745596609cc9c031f91b3d33ed1a12c9d4d`

Latest verified CI on that baseline:
- push CI: PASS
- PR CI: PASS

Current production API release remains:
`e4aa5c12a3e905ad1dba55ac92a26609bb171259`

## Executive status

Infrastructure migration is closed. WeChat transport, HTTPS, login/profile/phone auth, CloudBase Storage, and WeCom human customer service are accepted and must not be repeatedly re-tested without a concrete failure signal.

The project is now in **commercial product closure**.

The three previous long-running lanes can be closed as permanent conversations:
- Lane A: model/provider selection complete; only one real runtime parity smoke remains before production gating.
- Lane B: infrastructure migration complete; remains a production/schema guardian only.
- Lane C: WeChat integration and current device-acceptance batch closed; remaining failures/blockers are documented.

Future conversations should be opened by **specific work package**, not by permanent lane identity.

## Assessment AI — selected baseline

Provider/model/mode selection is complete:

- Provider: `aliyun-bailian`
- Region: 华北2（北京）
- Protocol: OpenAI-compatible Chat Completions
- Model: `qwen3.5-27b`
- `enable_thinking=false`
- Temperature: `0`
- JSON mode: `true`

The selected baseline passed live provider evaluation.

Frozen evaluation facts:
- 92 total evaluation cases;
- first 5 Core cases became calibration cases;
- final blind-quality set: 75 Core + 12 Language Extension = 87;
- non-thinking mode had zero provider/parse errors;
- thinking mode did not improve key Exact metrics and materially increased cost/latency.

Decision:
**Provider/model/mode = ACCEPT.**

Do not rerun the same benchmark merely for reassurance.

## Assessment runtime parity — one remaining local gate

The real Assessment runtime path is:

```text
Assessment input
-> eval-safe private case RAG
-> Top 10 case evidence
-> governed product knowledge
-> qwen3.5-27b
-> assessment-output-v1
-> schema/evidence validation
-> at most one bounded repair
```

Observed live runtime failures were not transport failures. The model returned syntactically valid but wrong-shape output (including a JSON numeric scalar).

Runtime hardening already landed:
- `98f2442...` — one bounded repair for malformed model output;
- `68d57a7...` — distinguish valid JSON primitives from object contract, strengthen top-level Assessment object contract;
- current branch is ahead of `68d57a7...`.

Only remaining local parity action:

```powershell
git pull --ff-only origin p1/foundation
npm.cmd --prefix services/api run assessment:smoke:live
```

Run this **once** on the latest branch with the already-configured private provider env.

If it returns `{"ok":true}`:
- stop AI prompt/model tuning;
- enter the Assessment production schema/runtime gate.

If it still returns scalar/wrong top-level output:
- do not continue indefinite prompt tuning;
- keep qwen3.5-27b benchmark status = ACCEPT;
- mark production Agent compatibility = RETEST/FAIL;
- test one focused strict-JSON-Schema challenger.

## Production schema readiness

Readiness report:
`docs/handoff/production-schema-readiness-2026-10-03.md`

Known current gates:

### Missing / blocking
- `assessments` -> `db:upgrade:assessment`
- `coaching_records` -> `db:upgrade:classroom-guidance`
- `product_knowledge_documents` / `product_knowledge_chunks` -> `db:upgrade:product-knowledge`

### Already present / accepted at schema-presence level
- `student_plans`
- `plan_items`
- `plan_revisions`
- `schedule_imports`
- `internal_ids`
- `news_posts`
- native phone-auth fields

No production schema write is authorized by this status document.

Each missing feature gate remains independent; do not batch unrelated migrations.

## Device acceptance — Lane C closed

Current accepted items include:
- WeChat login/session path;
- authenticated-but-unbound user now goes directly to identity binding instead of repeating login;
- internal student ID claim;
- Position dimension edit navigation;
- WeCom human customer-service path;
- Assessment form rendering and provider-unconfigured guard.

Current blockers/failures:
- Assessment Draft/History/persisted Result: blocked by missing production `assessments` schema;
- Classroom plan-card/full guidance path: blocked by missing `coaching_records`;
- image schedule parsing: blocked by missing schedule AI provider;
- one real `.xls` schedule file: parser compatibility FAIL; requires that exact source file;
- Products full device acceptance: not run;
- News full device acceptance: not run;
- Assessment Result real-device long-text/evidence regression: not run after production gate;
- teacher/admin complete device role flows: not run.

Canonical device log:
`docs/testing/wechat-product-device-acceptance-2026-10-03.md`

## Commercial gap — payment/credits

Current core paid-launch gap remains:

- no completed CreditLedger;
- no free Assessment quota closure;
- no WeChat recharge/payment order flow;
- no idempotent payment callback/credit grant closure.

This is the next major engineering package after production Assessment inference is accepted.

## News / Official Account requirement

The News module requirement is formally captured in:
`docs/product/news-official-account-integration.md`

Direction:
- Official Account published articles are the primary content source;
- preserve article URL and open concrete article via WeChat capability;
- stop using title-keyword `inferTag()` as the production classification truth;
- use server-side tags;
- first verify whether WeChat officially exposes stable collection/category metadata;
- otherwise allow admin manual multi-tagging;
- no recommendation algorithm in this phase.

This work is independent from Assessment AI and should not block the P0 commercial path.

## New work-package model

Close the old permanent Lane A/B/C conversations when convenient.

Open a new conversation only when a concrete package is ready to execute.

Recommended next packages:

### Package 1 — Assessment Production Gate
Trigger: local `assessment:smoke:live` returns `ok:true`.

Scope:
- fresh read-only `assessments` shape check;
- approve and run only `db:upgrade:assessment`;
- place Assessment secrets in root-owned production env;
- mount production private case corpus;
- deploy one immutable backend release;
- health/config checks;
- real-device Draft -> History -> Real AI -> Result acceptance.

### Package 2 — Credit + WeChat Pay
Trigger: production Assessment inference accepted.

Scope:
- credit ledger;
- free quota;
- order/recharge model;
- WeChat payment;
- signature verification;
- idempotent callback;
- failed model calls do not consume paid credit;
- end-to-end paid Assessment acceptance.

### Package 3 — Learning service closure
Can run after P0 is stable, with limited parallelism.

Scope:
- `coaching_records` production gate;
- Classroom plans/guidance/review;
- image schedule provider;
- supplied real `.xls` parser regression once the source file is provided;
- teacher/admin device flows.

### Package 4 — Content center
Independent secondary package.

Scope:
- Product Knowledge schema/import;
- News Official Account sync + tags/admin tagging;
- products/news device acceptance.

### Package 5 — Final visual polish
Only after primary flows are stable.

Scope:
- consistent visual system;
- typography, spacing, card hierarchy, states;
- no business-logic redesign;
- final device visual QA.

## Delivery focus

Do not spend another cycle on:
- ECS migration redesign;
- CloudBase AI;
- model benchmark repetition;
- broad architecture refactoring;
- premature customer AI.

The shortest path to delivery is:

```text
one real Assessment runtime smoke
-> Assessment production gate
-> real-device Assessment acceptance
-> Credit/WeChat Pay
-> Classroom/Schedule closure
-> Product/News closure
-> final UI polish
```
