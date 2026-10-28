# UI Closeout: Two-Pass Execution Order (2026-10-28)

> Purpose: finish the approved Jiuchen mini-program UI blueprint efficiently without drifting from the original product. This is a compact execution note for Codex, not a replacement for `CONSTITUTION.md`, `AGENTS.md`, the experience blueprint, the user-provided acceptance matrix, or the current local progress matrix.

## Ground truth and caution

- Repo: `orange-lee-tech/jiuchen-edu-platform`
- Active local work branch: `codex/ui-redesign-20261028`
- GitHub reference SHA when this note was prepared: `f1729b086cb8e2b55d8bbf974b5958504033faff`.
- The user's current UI worktree has uncommitted, unpushed changes beyond this GitHub snapshot. **Inspect local `git status`, the local progress matrix and actual diff first. Never overwrite local work with this older remote snapshot.**
- User-reported latest work: today/opportunity/profile/teacher/admin UI cleanup; growth-profile integration with existing create/edit endpoints; stale request/cache isolation across account switching. Reported checks: mini-program typecheck PASS, previous regression 78/78 PASS, targeted cache tests 3/3 PASS, `git diff --check` PASS. The latest combined 79-test set was not rerun. Treat these as user-reported local evidence until independently inspectable.
- No ECS deployment, production DB migration, WeChat upload, or publication is authorized.

## Product invariants — no drift

1. This is a UI/UX closeout, not a rewrite of completed core features.
2. Reuse existing components, APIs, domain models and service contracts. Change only layout, hierarchy, labels, visibility, input presentation, honest state feedback and required references/bindings.
3. Preserve student four-tab navigation: 今天 / 规划 / 机会 / 我的. Preserve existing role navigation and permissions.
4. Preserve formal-plan direct-save behavior and current teacher/student authorization. Never restore the retired plan-approval workflow.
5. Preserve AI assessment, reports/history/drafts, credits, payment, news, schools, favorites, customer service, account and admin functions. No fake data or new business rules.
6. No schema/API/payment/AI-provider/ECS changes unless an existing UI contract is genuinely impossible; record the exact dependency instead of faking it.
7. No production operations, main merge, forced reset, clean, history rewrite, or destructive cleanup. Preserve `project.config.json` and all unrelated/untracked local assets.

## Closeout estimate

The implementation is estimated at about **67% (roughly 65–70%)** from the blueprint and the latest user-reported local work. This is a planning estimate, not measured test coverage. Phase 6 device QA and full tests are separate and must not be used to inflate or reduce implementation coverage.

## Pass 1 — Finish the remaining major surfaces

Inspect the local acceptance matrix and progress matrix first; do not repeat completed work. Complete the highest-value remaining blueprint items:

- Phase 2: existing grade/rank, language-exam and growth-record flows; reuse existing data and endpoints; no duplicate collection.
- Phase 3: current stage/current action emphasis, semester context, teacher guidance, historical/version presentation; preserve direct-save semantics.
- Phase 4: teacher and admin workbenches; real assignments/status only, clear next action, useful empty/loading/error/retry states.
- Phase 5: remaining stable pages that still visually diverge, prioritizing position, growth profile, assessment input/history/result, profile edit, school library and admin pages.
- Update component paths, `usingComponents`, route references, WXML bindings, TS handlers and WXSS selectors as part of the relevant change.

Use parallel tasks only for non-overlapping page modules. One integrator owns shared files (`app.json`, `app.wxss`, shared components, navigation contract and progress matrix). If a module is blocked, record it and continue other independent work.

## Pass 2 — Integrate and declare implementation freeze

- Scan all stable top-level and subpackage pages against the acceptance matrix.
- Fix major cross-page inconsistencies, broken references, duplicate/obsolete entry points, incorrect role visibility, stale account data and misleading states.
- Confirm each in-scope P0/P1 item is implemented or has an explicit, justified blocker. Defer minor visual polish and device-only details to the later issue list.
- Update the local progress matrix and `docs/handoff/CURRENT.md` concisely. Do not emit large code dumps or long explanations; report counts, changed files, blockers and next action.
- Do not call a page `VERIFIED` just because it was edited. Distinguish implementation from testing.

## Test gate — only after implementation reaches 100%

Do not run the full ~300-test suite repeatedly during construction. Once Pass 1 and Pass 2 close all in-scope implementation items, freeze the UI implementation and run the existing project checks in one consolidated round: mini-program typecheck, the full available regression suite (including the latest 79-case set), API typecheck/tests/build where relevant, route/reference checks and `git diff --check`. Repair failures with targeted tests; rerun the full suite only if fixes affect broad/shared behavior.

Do not invent package scripts: the mini-program package currently defines `typecheck` but no standalone `build` script. Do not use production MySQL. Real isolated-DB, narrow-screen and identity/device checks remain separate; the user will perform real-phone verification after the code/test closeout.

## Definition of done

Implementation = 100% only when every in-scope Phase 0–5 P0/P1 acceptance item is implemented or has a specific documented external blocker, all stable pages/routes/components have been covered, and core behavior remains intact. Full test PASS and real-device PASS are separate statuses.

Keep the work moving. No per-page approval pauses, no full-suite test loops, no token-heavy source dumps, no unrelated refactors. At most two further Codex construction passes: Pass 1 major surfaces, Pass 2 integration/freeze. Then consolidate tests and hand off for human phone validation.
