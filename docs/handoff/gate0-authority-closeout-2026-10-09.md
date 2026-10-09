# Gate 0 authority reconciliation — 2026-10-09

**Status: completed as docs-only authority cleanup; Phase 1a prepared for separate Codex code execution.** This closeout does not itself change the mini-program, API, production infrastructure, database or a single business record.

## Evidence class

- GitHub `p1/foundation` baseline HEAD before Gate 0: `7d9db7bbf55007232815184fa36539a7c8ef8924`; latest Push/PR CI before docs update PASS; `app.json` still five tabs; `profile.ts` treats staff as teacher-like while preserving role; Phase 0 inventory is dated.
- User-supplied ECS terminal + real-device evidence (not a fresh ECS probe by this gate): production immutable API `ea8c971008a9efd042ec43fdc62398e136262259`, prior/rollback `b9993dfe1e4c1c4be70cf75d8a48873d8bc8166c`, `PROMOTE_OK`, three public health responses success; valid available JCA claimed into first admin role, admin workspace opened; admin pause/revoke/restore reported PASS.
- Other user-reported production acceptance: Assessment background submit/history/success/reopen, import PDF/DOCX/image and schedule XLS/save/reopen. Do not infer every negative/security edge case from these passes.
- News timer: last ECS check (2026-10-08) found its service/timer **not installed**; source script and unit files are not installation evidence.
- Commercial/growth/coaching/privacy: production business and legal gates remain open where not verified.

## Reconciled contradictions

| Source | Gate 0 decision |
| --- | --- |
| `docs/handoff/CURRENT.md` had old production SHA and conflicting admin instructions | Rewrite as short operational status + acceptance matrix and priority |
| `docs/product/v1-baseline.md` forbade administrator self-claim | Replace with approved first-admin JCA one-time bearer enrollment and pause/revoke/restore contract |
| `docs/testing/PENDING-INTEGRATION-TESTS.md` forbade JCA self-claim in DB-02/ID-04/ADMIN-01 | Correct test contracts and evidence granularity; retain distinct negative/security scenarios |
| Blueprint header still said "Phase 0 only" | State bounded Phase 1a authorization; keep Phase 1b read-model gate |
| `docs/architecture/construction-map.md` called 2026-09-22 map the one current source | Mark historical and point to CURRENT |
| `docs/handoff/main-control-status-2026-10-06.md` old order and SHA | Mark historical without rewriting its original incident log |
| `AGENTS.md` lacked actionable Phase 1 entry | Specify read order and explicit active execution file |

## Assumptions NOT promoted to facts

- `staff`: no newly approved independent business UX; Phase 1a uses already established teacher-like four-slot navigation for compatibility, but still displays staff identity honestly and honors backend role restrictions; **never** gives admin actions.
- `HomeExperienceSnapshot`: Phase 0 found this read-only contract missing; design only until reviewed. No fake lifecycle progress or duplicate growth fact model.
- Client tests/CI cannot prove production timer, Pay merchant readiness, privacy approval or actual real-device navigation. These remain separate.
- PC Vue admin is present, but `services/api/src/routes/admin.ts` has development-only access checks, so do not advertise it as live production admin console.

## Scope validation

This Gate 0 modifies only Markdown documentation and source-of-truth pointers. No `.ts`, `.js`, `app.json`, WXML, WXSS, SQL, scripts, deployment, or production data changed. Read and validate this note with `docs/handoff/phase1-codex-execution-2026-10-09.md` before beginning Phase 1a.
