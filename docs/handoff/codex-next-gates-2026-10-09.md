# Codex / main-control next gates after real-device feedback — 2026-10-09

Status: **EXECUTION HANDOFF / distinct approval gates**. Review `CONSTITUTION.md`, `AGENTS.md`, `CURRENT.md`, `docs/design/jiuchen-v1-experience-blueprint.md`, `docs/handoff/ux-device-recovery-2026-10-09.md` before touching code.

## Current actions already edited in `p1/foundation` (GitHub integration, not live)

- Root fix for professional four tabs all showing the same `role-shell` content: renamed reserved WXML `slot` attribute to `view-slot` and component property to `viewSlot`; `mine` never displays the redundant professional intro. Other slots now compact. Test added for each role.
- Right-top stage badge now follows `selectedView`: current week → 本周课表.
- Home normal button inline margins removed, primary full-row CTA, accessible pale caption on deep blue, service links adapted to a compact grid.
- Four-step, skippable role-specific onboarding local to user's device; storage keyed by user ID + role, no auth change.
- Website genuine welcome dialog with tap-to-copy URL and explicit warning WeChat cannot force external default browser. Business `web-view` remains blocked until verified business domain; no fake browser launch.
- Assessment Runtime only received conservative source/no-guarantee wording, existing output schema/case provider/production unchanged.
- Training pack summary and 14-case QA inventory in `docs/design/assessment-human-method-integration-2026-10-09.md`.

**Verify GitHub HEAD/CI before repeating or extending.** Latest UX device verification still NOT RUN. Retain live ECS API release `ea8c9710` and its previous rollback.

## Gate A — 2026-10-09 device retest, no architecture expansion

Test 4 native admin tabs (distinct home/users/business/mine), admin search and ID copy/safe actions, narrow Android 360-ish screen and large font, user profile no double blue hero, classroom stage↔current week and right badge, Home full-row tap geometry, guest first login guide, newly bound first-role guide (skip/no repeat), website dialog copy behavior. On fail report page→tap→expected→actual→screenshot. Do not claim screenshot PASS from GitHub CI.

## Gate B — Scoped read-only role preview (backend/security lane)

Follow `docs/product/readonly-role-preview-contract-2026-10-09.md`. Teacher may **only** inspect assigned students; admin may inspect eligible student/teacher; user session never changes. Explicit server-authorized read models, safe target choice, persistent view-only banner and return; zero writes/AI generation/payment/assessment run/teacher approval while previewing. Denial/relationship-change/audit/foreign-token tests required before production. **Do not implement frontend-only impersonation or mutate auth role**.

## Gate C — Teacher-led groups then group-scoped news (business lane)

A real group has stable ID, one designated teacher as lead, multiple student memberships, admin CRUD and true ownership checks; review teacher assignments migration and whether a student may belong to multiple groups before schema writes. News `visibility=public|custom`; custom has >=1 selected **real group ID**, server filters all list/detail/feed APIs, including direct ID guesses. News classification tags are topic taxonomy, separate from visibility. Proposed A/B/C bootstrap are only human-readable *pending* group display labels, never security groups: if not backed by real group identities no article restriction is implied. Teacher's display name can label UI but cannot be a permission key; renames do not silently change access. Staff/admin visibility needs explicit policy. Concurrent membership move, disabled ID, public/custom toggles, scheduled resync preserving tags and visibility, old link access: mandatory tests.

## Gate D — Official school evidence + incremental Assessment quality (AI lane)

Use `docs/design/assessment-human-method-integration-2026-10-09.md`. Implement approved pluggable official-source retrieval with strict verified school domains, bounded output, source year and citation refs; unknown/failed retrieval must degrade to `insufficient_data`, evidence-backed strategy or conservative directional guidance, **never** claim to have browsed. Do not train on 8 silver labels or treat 14 synthetic adversarial tests as admissions truth. Preserve six-section report, current provider and JSON schema. Run 14 critical behavioral tests and live eval quality/cost before separate API promotion.

## Gate E — Assessment-to-human-customer-service share (separate WeChat lane)

Student selects a **specific owned** saved report; authorizes share to customer service. Verify actual `wx.openCustomerServiceChat` ability to carry a `sendMessageTitle`/`sendMessagePath` card or corresponding authorized native share route before promising “sent”. Tokenized/share-grant link expires, revocable, limits data and logs openings; render optional name/school and 九辰咨询 watermark only after informed consent. No public report URLs, no permanent exposure, and no automatically queued sends. Keep existing direct human chat when share unavailable.

## Operational/legal gates remain open

News systemd timer installation + one successful scheduled run; payment merchant/ledger/refund, privacy/consent, case/license rights and all-role device acceptance require separate evidence. Do not merge main, run schema migration or promote production without operator sign-off.

## Standard stop/report result

For each gate output: exact HEAD/branch, changed files, test counts, Push/PR CI, device tests PASS/FAIL/NOT RUN, backend authority checks, schema/prod operator gate, and rollback. Reject claims that source code existing equals live capability. Avoid parallel edits in `app.json`, `navigation.ts`, `auth.ts`, `assessment-runtime.ts` without conflict coordination.
