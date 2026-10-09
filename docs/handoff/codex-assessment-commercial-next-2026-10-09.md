# Codex next execution — commercial + role security closeout

Active: `p1/foundation`. ALWAYS read `CONSTITUTION.md`, `AGENTS.md`, `docs/handoff/CURRENT.md`, `docs/product/assessment-only-commercial-policy-2026-10-09.md`, `docs/handoff/codex-next-gates-2026-10-09.md` before work.

## Immutable boundaries

Never merge main, force push, discard local working files, write production schema, change ECS or website resources, expose payment secrets, silently enable charging, or claim fake data. Keep chart JS/css native and honor 256 MiB runtime resource ceiling.

## Immediate gate order

1. Check GitHub Push + PR CI for latest HEAD. Fix real failing steps; do not claim green from earlier commits. Device/DevTools acceptance is NOT RUN in this GitHub editing session.
2. Validate assessment `user_profiles` academic source-of-truth and old-draft recovery, material-import no canonical changes, Position no autosave. Test 409 response for forged create/update/run with live DB, and account change while form open.
3. In official WeChat tools validate 3-way commercial role path: guest free 1 -> use -> bind student -> bonus 4; student directly gets 5, no duplicate grants via repeated requests, no sixth credit. Exhaustion yields 402 before provider. Persistent successful report consumes exactly once; provider failure, reread, retry, unknown process outcomes do not charge twice.
4. Payment SKU single ¥1.90 / ten ¥16.90, merchant `description=小程序AI评估费用`, server rejects course SKU/price forgery, JSAPI canceled and delayed notifications never grant early, duplicate callbacks settle once; verify approved merchant and iOS policy. No real payment until operator explicit approval.
5. Admin analytics: test true succeeded evaluations, paid (not pending/refunded) orders, week/month/year at day/month/year boundary, labels on every point/bar, no PII/full-table transfer, 20 maximum rankings, no real records => genuine zero/empty data. Database timezone/index and refund rule require validation.
6. Prior unresolved: read-only teacher-assigned student and admin eligible student/teacher server authorization + audit; school official-domain retriever, human case quality eval, grouping and group-restricted news, website web-view business domain, all-role first login guides, four native role tabs and week badge real-device replay. Each has independent separate gates in `docs/handoff/codex-next-gates-2026-10-09.md`.

## Reporting format

HEAD; changed files; relevant local checks/Push/PR CI; DevTools/device PASS/FAIL/NOT RUN; schema/ECS changes (should be NONE); rollback commit(s); open blockers and human operations. Do not say 'production enabled' because an API route exists.
