# Main control status — 2026-10-03

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Integration branch: `p1/foundation`  
Verified branch HEAD at status write: `27bc7f4a818cdaa2a5e0fc9b173212b724432b45`

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

1. Production `assessments` schema is **MISSING / NOT READY**. The approved upgrade is `npm run db:upgrade:assessment`, but no production write is authorized by this document.
2. The selected Assessment provider is not yet configured in the root-owned production environment.
3. The private production case corpus is not yet mounted/configured via `ASSESSMENT_CASE_DATA_ROOT`.
4. A new immutable backend release containing the current Assessment closure/failure-path fixes has not yet been promoted.
5. Draft / History / Result / real inference still need real-device acceptance after the production gate.
6. Commercial paid launch still lacks CreditLedger, free quota and WeChat payment/recharge closure.

Separate, non-P0 blockers:
- `coaching_records` is not production-ready for full Classroom guidance acceptance;
- Product Knowledge DB tables are not production-ready, although bundled product fallback remains available;
- Official Account news integration is approved but implementation is a separate content lane.

## Execution policy

Do not reopen ECS migration, NPM, HTTPS, login, phone login, profile, WeCom human customer service, or CloudBase Storage validation without a concrete failure signal.

Keep one integration branch. Parallelism is by responsibility, not by branch count. Before editing shared files, read the latest head and handoff state. Do not duplicate completed checks.

### Lane A — Backend / AI

Current model-selection work is closed.

Next responsibility:
1. maintain the selected provider/runtime contract;
2. do not rerun the same qwen3.5-27b benchmark for reassurance;
3. do not execute production schema writes or deploy production;
4. after main-control approval, hand the exact non-secret runtime contract to Lane B;
5. after production inference acceptance, move on to CreditLedger/free quota/payment backend rather than further model micro-tuning.

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

1. **Assessment production schema/runtime gate.**
2. **Real-device Draft → History → Result → real inference acceptance.**
3. **CreditLedger + free quota + WeChat payment/recharge closure.**
4. Classroom/ID/schedule product acceptance and remaining feature-specific schema gates.
5. Product Knowledge DB/RAG productionization.
6. Official Account News implementation can proceed as an independent content lane when it does not contend with P0.
7. Customer AI only after the paid core flow is stable.

