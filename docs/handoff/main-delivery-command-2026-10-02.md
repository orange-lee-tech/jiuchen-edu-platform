# Main delivery command — 2026-10-02

> **Historical document / superseded for current execution.**
>
> This file records the 2026-10-02 delivery state. Several blockers listed below
> (case retrieval, provider selection, Assessment result/history UI) have since
> been completed.
>
> For current execution, use:
> `docs/handoff/main-control-status-2026-10-03.md`
>
> Do not use this historical file as the active task list.

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

## Historical critical product gaps at 2026-10-02

At the time of this command, Assessment retrieval/result UI/provider evaluation were unfinished. Those items have since advanced and must be read from the current main-control status.

The commercial/payment gap remains current:
- CreditLedger
- free quota
- WeChat payment/recharge
- idempotent callback/credit grant

The independent production schema gates also remain feature-specific and must not be bulk-applied.

## Historical delivery order

This section is retained for audit only.

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
4. Add bounded Customer AI FAQ/RAG only after core product P0/P1 is stable.

## Current pointer

Use:
`docs/handoff/main-control-status-2026-10-03.md`

for the live blocker list, next work packages, and production gate order.
