> **SUPERSEDED FOR CURRENT EXECUTION — 2026-10-06**
>
> Current source of truth: `docs/handoff/main-control-status-2026-10-06.md`.
> This 2026-10-04 file is retained for history only.

# Main control status — 2026-10-04

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Integration branch: `p1/foundation`

Verified source HEAD before this status write:
`19149eaf055c670be7e470b2760cb0fd4d51bfc3`

CI on that HEAD:
- push: PASS
- pull_request: PASS

Current production API release:
`8e5a0ffe7869cd3f6ec8c0a8a876247798b65519`

Previous rollback release:
`e4aa5c12a3e905ad1dba55ac92a26609bb171259`

## 1. Executive status

The project is in **delivery sprint / Experience Blueprint Phase 0 released**.

Infrastructure migration is closed. Do not reopen ECS/NPM/HTTPS/CloudBase-AI migration work without a concrete failure signal.

The approved V1 Experience Blueprint is now released for **Phase 0 mapping only**. AI Runtime, business/commercial, and UI pre-Blueprint lanes have completed their bounded closeouts and frozen their shared hot modules. The baseline reset is complete.

Completed closeout order:

1. Assessment / AI Runtime closeout — DONE / frozen pending operator device acceptance;
2. Business / commercial closeout — DONE / frozen;
3. UI / design closeout and freeze — DONE;
4. main-control baseline review — DONE;
5. Codex Experience Blueprint Phase 0 mapping — RELEASED.

Current repository baseline for Phase 0:
`dd4b9d9c56a0fae217fd2861ed56e9b7f54b3974`

CI on that baseline:
- push: PASS
- pull_request: PASS

No other lane may modify shared mini-program navigation/Home/Plan/Opportunity/Mine surfaces while Phase 0 mapping is active. Phase 0 is documentation/mapping only and must not change runtime code.

## 2. Assessment AI — model/runtime decision CLOSED

Selected production runtime:

- provider: Alibaba Bailian;
- region: Beijing;
- protocol: OpenAI-compatible Chat Completions;
- model: `qwen3.8-flash`;
- mode: non-thinking;
- temperature: 0;
- response format: strict `json_schema`;
- downstream: Zod + evidence validation;
- repair budget: at most one bounded repair.

Historical `qwen3.5-27b` remains a model-quality reference only. Do not restart its benchmark or continue prompt tuning.

Real strict-schema runtime smokes passed. Model selection is CLOSED / ACCEPT.

Canonical current AI worklog:
`docs/handoff/ai-runtime-worklog-2026-10-04.md`

## 3. Assessment Production Gate — infrastructure/runtime gates PASS

Production Assessment state is materially ahead of the 2026-10-03 status.

Completed:

- production `assessments` schema: PASS;
- 18-column/index/FK contract verified;
- private 748-case production corpus installed and service-user readable: PASS;
- production qwen3.8-flash env configuration: PASS;
- Assessment-only immutable release promoted: PASS;
- `/health/live`: PASS;
- `/health`: database ok;
- `/health/config`: `assessmentAiConfigured=true`;
- `/assessments/meta`: `providerConfigured=true`;
- `jiuchen-api.service`: active.

A cutover incident occurred because the service account could not traverse/read built release files even though they existed. It was recovered without damaging the prior release. The production release is now healthy.

The promote contract was hardened:
- symlink mode bits are not treated as real writable-file permissions;
- future preflight must verify actual `jiuchen-api` service-user traverse/read access before switching `current`.

Canonical runbook / incident record:
`docs/handoff/assessment-production-gate-2026-10-04.md`

### Remaining Assessment closeout

The remaining customer-visible gate is real-device end-to-end acceptance:

```text
Draft
-> reopen History
-> real AI run on ECS
-> Result
-> return to History
-> reopen persisted result without a second model call
```

Until that is recorded PASS, Assessment is not considered fully delivered to end users.

## 4. Commercial / Credit / Payment state

A deterministic commercial foundation now exists:

- `docs/product/credit-payment-contract.md`;
- credit/payment schema definitions;
- `db:upgrade:credit-payment` foundation;
- credit policy + tests;
- one successful Assessment costs one credit by contract;
- failed terminal model/system execution must not create a settled debit;
- payment/callback idempotency rules are defined.

However this is **foundation, not a completed payment product**.

Still not complete:
- production credit/payment schema gate;
- server routes/services for user balance/order/recharge lifecycle;
- integration of Assessment reservation/debit with the live Assessment route;
- approved free-grant quantity;
- approved production SKU/price;
- WeChat Pay merchant credentials/certificates;
- signed/encrypted callback acceptance;
- real-device payment/recharge acceptance.

Do not enable payment or run the credit/payment production migration merely because the foundation exists.

## 5. Canonical Growth Profile / output state

Implemented foundation now includes:

- Canonical Growth Profile model/projection;
- explicit user confirmation when reusing Assessment-derived facts;
- deterministic resume/application projections;
- deterministic DOCX resume generation;
- mini-program opening of generated DOCX;
- growth/profile/session caching and stale-cache race fixes.

Important boundary:
- Assessment facts are not silently promoted into canonical truth;
- user confirmation remains required;
- new `growth_records` production storage still requires its own production schema gate where applicable.

This capability should be reused by the future Experience Blueprint; do not create another resume/profile fact store.

Canonical documents:
- `docs/product/canonical-growth-profile-projection.md`
- `docs/handoff/growth-profile-output-performance-2026-10-04.md`

## 6. UI / design state

A first `jc-*` primitive/style batch exists, but it is explicitly **exploratory**.

The approved V1 design direction is now square-first / restrained-corner and is defined by:
- `docs/design/jiuchen-v1-experience-blueprint.md`
- `docs/design/jiuchen-v1-design-system.md`

The existing large-radius primitives (for example many 16–22rpx card/input/button radii) must not be spread across more pages as if they were the final system.

UI lane must finish its current bounded work, document what was exploratory, and freeze broad page restyling until Experience Blueprint route/shell mapping is approved.

## 7. Experience Blueprint — APPROVED, PHASE 0 RELEASED

Approved blueprint commit:
`ea7fc72b899e363e4c238dd2dfa2b52034e85e9a`

Product direction is approved:
- Student: Home | Plan | Opportunity | Mine
- Teacher: Workbench | Students | Coaching | Mine
- Admin: Workbench | Users | Business | Mine
- stable top-level navigation per role;
- lifecycle-driven Home;
- Assessment becomes contextual capability rather than permanent top-level destination;
- Classroom becomes Plan;
- News becomes Opportunity source;
- Canonical Growth Profile is reused;
- deterministic priority rules before recommendation algorithms.

**Execution scope:** Phase 0 mapping is released. Broad implementation remains on hold until Phase 0 produces a reviewed route/navigation/contract/conflict map.

Codex Phase 0 must produce:
- current route -> new experience contract;
- all `switchTab` / `navigateTo` / deep-link dependencies;
- role/navigation constraints;
- backend contract requirements;
- file ownership/conflict map;
- keep/rename/merge/demote/new-shell decisions;
- explicit Phase 1 implementation prerequisites.

Phase 0 must not edit runtime code, `app.json`, tabBar, page structure, backend contracts, AI, payment, or visual styles. Its output is a reviewed execution map only.

## 8. Known independent product work after baseline reset

### Learning / Classroom
Known blockers still include:
- `coaching_records` production gate;
- full plan/guidance/review acceptance;
- image schedule provider;
- known real `.xls` parser regression requiring the exact failing file.

### Content Center
Approved requirement remains:
- Official Account article sync as primary News source;
- server-side tags;
- verify official collection/category metadata capability;
- admin manual tagging fallback;
- concrete article opening;
- no recommendation algorithm in this phase.

Product Knowledge DB migration remains independent and must not be bundled into unrelated gates.

### Customer AI
Deferred until core Assessment/commercial flow is stable.
Human WeCom customer-service path is already the guaranteed fallback.

## 9. Documentation source-of-truth order

For current work, prefer:

1. `docs/handoff/main-control-status-2026-10-04.md`
2. feature-specific 2026-10-04 handoff/runbooks;
3. approved product/design documents;
4. older dated handoffs only for history.

Documents dated 2026-10-02/03 may contain historically correct but superseded states. They must not override later accepted gates.

## 10. Baseline reset result

**BASELINE RESET COMPLETE.**

Verified closeouts:
- AI Runtime: `d26f2bc4f0b17f34fb085f64a5cecab5095264aa`
- Business/commercial: `8b1a136d6a98ec03ca8cd16b486a377d3d1200b4`
- UI pre-Blueprint: `dd4b9d9c56a0fae217fd2861ed56e9b7f54b3974`

Phase 0 begins from `dd4b9d9c...`.

Before Phase 1 implementation begins:

Each current work area must report:
- baseline HEAD;
- final HEAD;
- commit(s);
- completed work;
- tests/CI;
- production changes, if any;
- files/modules still considered active;
- unresolved blockers;
- exact status document updated in Git;
- explicit statement that no further edits will be made until main control reassigns work.

Main control will then:
1. fetch/pull current branch;
2. verify CI;
3. inspect overlapping hot files;
4. refresh this status if needed;
5. declare the baseline frozen for Blueprint Phase 0.

