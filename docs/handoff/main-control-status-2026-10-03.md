# Main control status — 2026-10-03

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Integration branch: `p1/foundation`  
Verified branch HEAD at status write: `8eb80caf96660853f4baac3a721457d7a38d0764`

## Executive status

Infrastructure migration is closed. Product work is now in commercial-closure and real-device acceptance.

Assessment implementation baseline:
- implementation commit: `529e2cd190177b1b4116cebd0c862b1c0770a424`;
- real case retrieval and governed product knowledge retrieval are wired;
- eval/test uses the 656-case eval-safe RAG set;
- production runtime is designed for the 748-case production RAG set;
- stable evidence refs, schema/evidence validation and one bounded repair call are implemented;
- failed inference does not consume assessment credit;
- Assessment result/history UI exists;
- draft/result/history device acceptance remains gated by production schema/runtime readiness.

Latest integration head also contains:
- wrapped Drizzle/mysql2 missing-table recognition for Assessment: `8a640e63177e73187c3aa1c3212fde5382c97b2b`;
- mini-program blocked-state / device-acceptance hardening;
- Official Account news integration requirement captured as a separate product lane.

## Live AI provider evaluation — CLOSED for current model/mode selection

Provider: Alibaba Bailian  
Region: 华北2（北京）  
Model: `qwen3.5-27b`  
Protocol: OpenAI-compatible Chat Completions  
Selected mode: **non-thinking**

Evaluation integrity:
- frozen suite: 92 total;
- 5 Core cases were used for calibration and are not counted as blind quality results;
- blind quality aggregate: 75 Core + 12 Language Extension = 87;
- both non-thinking and thinking runs completed with zero provider / JSON parse errors.

Non-thinking blind 87:
- estimated cost: CNY 0.093304;
- Core mean / p95 latency: 2391.9 / 3896 ms;
- Core discipline Exact: 0.9429;
- Core academic Exact: 0.7586, ±1 = 1.0;
- Core research Exact: 0.4902, ±1 = 1.0;
- Core competition Exact: 0.2308, ±1 = 0.9231;
- Language Extension language Exact: 1.0.

Thinking challenger:
- estimated cost: CNY 0.144660;
- Core mean / p95 latency: 4947.8 / 8121 ms;
- did not improve the key Exact metrics;
- research / competition Exact declined;
- Language Extension language Exact declined to 0.9167.

Decision:
- use `qwen3.5-27b` with `enable_thinking=false` as the next production-integration baseline;
- do not continue tuning or rerunning the same model/mode without a material contract change;
- do not treat research/competition raw scores as authoritative expert ground truth; preserve evidence, deterministic constraints, uncertainty and reviewability.

Full metrics live in `docs/architecture/ai-provider-evaluation-log.md`.

## Current hard blockers

1. **Local real Assessment runtime parity smoke is BLOCKED / RETEST.** Provider/model selection passed, but two live Agent-runtime attempts returned non-object model content; the latest final response was a valid JSON numeric scalar rather than `assessment-output-v1`. Do not promote the production Assessment gate until `assessment:smoke:live` returns `ok: true`.
2. Production `assessments` schema is **MISSING / NOT READY**. The approved upgrade is `npm run db:upgrade:assessment`, but no production write is authorized by this document.
3. The selected Assessment provider is not yet configured in the root-owned production environment.
4. The private production case corpus is not yet mounted/configured via `ASSESSMENT_CASE_DATA_ROOT`.
5. A new immutable backend release containing the current Assessment closure/failure-path fixes has not yet been promoted.
6. Draft / History / Result / real inference still need real-device acceptance after the production gate.
7. Commercial paid launch still lacks CreditLedger, free quota and WeChat payment/recharge closure.

Separate, non-P0 blockers:
- `coaching_records` is not production-ready for full Classroom guidance acceptance;
- Product Knowledge DB tables are not production-ready, although bundled product fallback remains available;
- Official Account news integration is approved but implementation is a separate content lane.

## Execution policy

Do not reopen ECS migration, NPM, HTTPS, login, phone login, profile, WeCom human customer service, or CloudBase Storage validation without a concrete failure signal.

Keep one integration branch. Parallelism is by responsibility, not by branch count. Before editing shared files, read the latest head and handoff state. Do not duplicate completed checks.

### Lane A — Backend / AI

Current model-selection work is closed. The only remaining Lane A gate is the local real Assessment runtime parity smoke.

Next responsibility:
1. pull the latest runtime-contract hardening and rerun `assessment:smoke:live` once;
2. do not rerun the 87-case benchmark for reassurance;
3. if the real runtime smoke passes, stop AI micro-tuning and hand the exact non-secret runtime contract to Lane B;
4. if it still fails, fix only the concrete `assessment-output-v1` / provider-contract defect shown by that smoke;
5. do not execute production schema writes or deploy production in Lane A;
6. after production inference acceptance, move on to CreditLedger/free quota/payment backend.

Selected production-integration contract:
- provider: `aliyun-bailian`;
- model: `qwen3.5-27b`;
- mode: `enable_thinking=false`;
- secrets remain outside Git;
- production case data remains outside Git.

### Lane B — Production Guardian

Infrastructure migration remains closed.

Re-enter only after explicit main-control approval for the Assessment production gate:
1. perform a fresh read-only `assessments` shape check;
2. review the exact idempotent `db:upgrade:assessment`;
3. execute that single approved schema write;
4. place approved Assessment provider secrets in the root-owned env;
5. mount/copy the approved private case runtime data;
6. build/promote one reviewed immutable backend release;
7. health-check and rollback on failure.

Do not batch unrelated Classroom or Product Knowledge schema writes into the Assessment gate.

### Lane C — WeChat acceptance

Continue only acceptance work that is not blocked.

After Lane B completes the Assessment gate:
1. save draft;
2. reopen/edit draft;
3. run real AI Assessment;
4. inspect result/evidence/similar cases/uncertainty/disclaimer;
5. reopen succeeded result from history without triggering new inference.

Do not claim production real-AI PASS before those checks.

## Parallel product lanes

- Official Account News: requirement is captured in `docs/product/news-official-account-integration.md`; implementation pending, independent of Assessment.
- Classroom: full guidance path waits on the `coaching_records` production gate.
- Product Knowledge: database-backed RAG productionization waits on its own schema/data gate; bundled catalog fallback is not evidence of DB readiness.
- Customer service: official WeChat/WeCom human service path is already accepted and must not be rebuilt as a blocker.

## Delivery order

1. **Pass the local real Assessment runtime parity smoke** (no production write).
2. **Assessment production schema/runtime gate.**
3. **Real-device Draft → History → Result → real inference acceptance.**
4. **CreditLedger + free quota + WeChat payment/recharge closure.**
5. Classroom/ID/schedule product acceptance and remaining feature-specific schema gates.
6. Product Knowledge DB/RAG productionization.
7. Official Account News implementation can proceed as an independent content lane when it does not contend with P0.
8. Customer AI only after the paid core flow is stable.

