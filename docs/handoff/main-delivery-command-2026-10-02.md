# Main delivery command — 2026-10-02

## Current verified baseline

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Integration branch: `p1/foundation`  
Current branch HEAD at command issue: `d0c3aac55e67abdd6e171fbe87aa6a0682edf2fa`  
Latest CI on that HEAD: PASS.  
Current production API release: `e4aa5c12a3e905ad1dba55ac92a26609bb171259`.

Lane A handoff commit `90112a05bd9fb20b45789813af5912316bea362a` is an ancestor of current HEAD.  
Lane C customer-service fix `4cd885d782c56d5d87b8c89bb53925ed045053c5` is also an ancestor of current HEAD.

## Production status

Infrastructure migration is closed. The production path is:

`Mini Program -> https://api.jiuchenedu.com -> NPM -> ECS :3100 -> jiuchen-api.service -> production DB`

Accepted:
- HTTPS / request legal domain
- ECS transport
- WeChat login / jscode2session
- phone login
- profile loading
- public products route
- WeChat/WeCom human customer service
- CloudBase Storage upload/download/delete from ECS

Do not spend delivery time re-validating these without a concrete failure signal.

## Critical product gaps discovered at command review

### 1. Assessment runtime is not commercially complete

The provider adapter exists, but `createAssessmentRuntimeFromEnv()` currently creates:

`new CompositeAssessmentRetriever([])`

Therefore the runtime has **no real case / school / product evidence source**. The assessment output validator requires retrieved evidence for target assessments, so merely buying/configuring an API key is not enough.

### 2. Assessment result UX is unfinished

The mini-program assessment page can save and run a draft, but after success currently says:

`AI 评估已完成。结果页将在下一步接入。`

A real result view/history experience is required before the feature is deliverable.

### 3. Credits / payment are not implemented in current API routes

Current API route inventory has no credits/payment route. If V1 commercial policy remains “free assessment quota, then paid recharge”, this is a commercial-delivery blocker and must be implemented before paid launch.

### 4. Production feature schemas remain gate-based

Do not bulk-run all upgrades. Before first production acceptance of a feature, inspect its required schema and run only the reviewed idempotent upgrade after main-control approval.

Priority gates:
- internal ID/news
- classroom guidance/revisions
- assessment
- product knowledge

### 5. Product knowledge is still serving bundled fallback

`GET /products` can return HTTP 200 from bundled content even without production product-knowledge tables. Database-backed knowledge must be verified/imported before it is relied on for RAG/AI.

### 6. Schedule image AI still needs a real provider

CloudBase Storage stays. Image parsing should use the provider abstraction already created by Lane A and receive separate low-cost vision/OCR credentials.

## Existing private AI data assets

Current manifest records:
- canonical cases: 748
- train: 590
- dev: 66
- frozen evaluation suite: 92
- eval-safe RAG cases: 656
- production RAG cases: 748

The 92-case evaluation suite is already frozen and leakage rules are documented. Do not rebuild a second evaluation system unless the existing one is demonstrably insufficient.

Real case content stays under ignored local `data-source/cases/` and must not enter Git.

## Delivery order

### Gate P0 — Close the core paid product path

1. Wire real AssessmentKnowledgeSource/Retriever to case/product knowledge.
2. Choose one economical assessment API and run the existing evaluation pipeline.
3. Configure assessment provider only after the retrieval path is real.
4. Build assessment result page/history.
5. Verify/run assessment production schema gate.
6. Implement assessment credit ledger + free quota + WeChat payment/recharge if still required by product baseline.

### Gate P1 — Close the learning-service path

1. Verify/run internal ID and classroom schema gates as needed.
2. Real-device test student edit -> pending revision -> teacher approve/reject -> latest view -> last 3 versions.
3. Verify spreadsheet schedule import.
4. Configure low-cost visual/OCR provider and verify image schedule import.

### Gate P2 — Content and support

1. Verify/import product knowledge DB.
2. Verify news production path.
3. Keep WeChat/WeCom human customer-service path as the guaranteed fallback.
4. Add bounded Customer AI FAQ/RAG only after core product P0/P1 is stable; do not let it block initial business acceptance.

## Ownership

- Main control chat: prioritization, release gates, acceptance decisions.
- Lane A / local Codex: backend AI, retrieval, evaluation, assessment runtime, schedule AI, later credits/payment backend.
- Lane B: dormant Production Guardian; only release, schema gate, rollback, or incident.
- Lane C: acceptance/integration support; customer-service and ECS transport are already closed.

Parallelism is by responsibility, not branch count. Keep `p1/foundation` as the integration branch and serialize code commits unless a real conflict requires a temporary worktree/branch.

## Immediate command

Do not start another infrastructure initiative.

The next engineering batch is:

**Assessment Commercial Closure**

It ends only when:
- real evidence retrieval works;
- one provider passes the frozen evaluation gate at acceptable cost;
- an authenticated user can submit an assessment and see a real structured result in the mini-program;
- the production assessment schema is verified;
- failure paths do not consume paid quota.

After that, proceed directly to classroom/ID/schedule device acceptance and commercial payment closure.
