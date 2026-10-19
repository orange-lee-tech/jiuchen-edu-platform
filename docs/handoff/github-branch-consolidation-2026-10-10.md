# GitHub branch consolidation / 2026-10-10

## Confirmed states
- `p1/foundation` was fast-forwarded from `18bfab53ba5c11372355a768ad56591fa0035095` to `ea35f917b73c1c65a8247d58dd5133d58325c381` after the exact-head client CI succeeded (run 38043883776).
- The client homepage WXML/WXSS change and its static regression test correction were incorporated. This does not mean the UI was re-accepted on device.
- `p1/rc-wechat-2026-10-10` equals the above commit and is redundant after the integration. It may be deleted after this receipt.
- `p1/rc-api-ea8c-readonly-date-2026-10-10` is an intentionally **separate** backend release candidate at `5b048de30d3592d0d61fcd4a9af8fee5f37f09e3`. It is based on live `ea8c971008a9efd042ec43fdc62398e136262259` and passes Actions run 38041562711.
- Production ECS last operator-confirmed active/approved/COMMIT remains `ea8c971008a9efd042ec43fdc62398e136262259`. There is no evidence of deployment of the candidate.
- Live database read-only audit found missing `coaching_records` and `growth_records`; RC API includes targeted missing-table graceful degradation. Database migrations have NOT been performed.

## Rules for future ECS delivery
1. Source for **WeChat frontend**: `p1/foundation` with the precise commit pinned in the release ticket. Do not use the default branch `main` as an unstated proxy.
2. Source for **production API**: the separately reviewed `p1/rc-api-ea8c-readonly-date-2026-10-10`. Never deploy all of `p1/foundation` to the existing API release, because its code includes as-yet-unapproved payment, AI and other changes.
3. Gate API deployment on isolated staging authorization tests (admin/teacher assigned/unassigned, revoked assignment, no writes), Monday date-save roundtrip and preservation of the user's 13 courses, runtime schema compatibility, approved immutable promotion + rollback plan.
4. Both frontend and backend have device/runtime checks outstanding: CI green does not replace these.
5. Do NOT change the company's public website, Nginx Proxy Manager, Harbor, Portainer, Docker or ports 80/443/8088 on the shared ECS. No database schema writes without a separate reviewed approval.

## Branch retention / cleanup classification
- KEEP: `main` (existing default stable base), `p1/foundation` (development integration), `p1/rc-api-ea8c-readonly-date-2026-10-10` (candidate), `p1/release-identity-bootstrap-v2-20261008` (points to deployed ECS rollback/base snapshot).
- DELETE ELIGIBLE NOW (identical to integrated foundation): `p1/rc-wechat-2026-10-10`. Deleting the ref does not remove the commits because they are ancestors of `p1/foundation`.
- RETAIN PENDING AUDIT: `p1/production-api-candidate-20261006`, `release/production-api-candidate-20261006`, `p1/release-readonly-schedule-2026-10-10`, `hotfix/read-only-schedule-2026-10-10`, all historical `p1/assessment-*`, `p1/release-api-*`, and `p2/*`; these refs may have unique commits and must not be bulk-deleted based only on name.
- Do not merge unrelated/historical release branches into `p1/foundation` to simulate a unified source. The release is intentionally two SHA-pinned tracks.

## Outstanding housekeeping
Current connector access supports fast-forwarding refs but not deleting branch refs. Therefore this ledger records deletion eligibility, not completed deletion. Use GitHub branch management UI or authorized local Git command only after verifying refs and ownership.
