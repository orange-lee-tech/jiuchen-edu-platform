# 2026-10-10 WeChat Experience Release Candidate | release train 2026.10.10-rc1

STATE: frozen CODE snapshot; NOT real-device acceptance or public release.

## Paired candidate SHAs
- WeChat: this branch starts from p1/foundation 18bfab53ba5c11372355a768ad56591fa0035095 with only this docs-only release note added.
- API: p1/rc-api-ea8c-readonly-date-2026-10-10 at 0bcca876edd6e0dda575274777661c1c0be07adb, based on active production ea8c971008a9efd042ec43fdc62398e136262259, preserving five production fixes. API RC CI PASS at https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38038569787. This SHA includes the nested classroom.student userId privacy fix, new route/date regression tests, and graceful missing-growth_records handling; the current CI must be independently checked before any release.
- Actual ECS remains on ea8c971008a9efd042ec43fdc62398e136262259. No ECS rollout has been executed.
- Train label: 2026.10.10-rc1 (not official WeChat version number).

## Scope
- WeChat UI: home four action cards, admin navigation, vertical term selector, 172-entry school directory, school source/photo/map views, customer-service identity verifier, read-only mirror, Monday-only schedule save.
- School maps: 316 reference points/172 catalog entries, 95 with multiple points. Many are third-party/approximate, not exact campus gates. Only five schools have source-licensed real photo metadata; legal image domain and domestic WeChat performance NOT tested.
- Role mirror is a GET-only independent data view, NOT all original TabBar screens.

## Mandatory gates
1. Verify two pinned SHA GitHub CI; then run actual WeChat Developer Tools compile and Android six-screenshot regression.
2. API RC undergoes read-only production schema readiness and isolated staging role matrix (admin teacher student staff unauthenticated; assigned/unassigned and revoked teacher).
3. Validate Monday-only import date saved/read back, 13 imported courses identical; prior active SHA unchanged until approved immutable ECS promote.
4. Real WeChat accounts verify admin/teacher mirror, consultation confirmation and operator manual receipt, photo source attribution, markers/openLocation and small-screen layout.
5. Payment/credit merchant gates, new AI context/schema and bulk photo collection are OUTSIDE this release approval; do not switch on by publishing client or backend.
6. WeChat experience upload follows validated device test. Official/public release requires separate acceptance.

## No-go restrictions
- Never deploy this complete p1/foundation-derived branch to ECS: it contains nonapproved payment/AI/identity code.
- Never deploy old b751-based hotfix onto live ea8c.
- Do not alter NPM, shared website, ports 80/443/8088, Harbor, Portainer, Docker or production schema. Secrets stay outside Git.

## Parallel school media pack
- Independently gather legal-source campus photos, correct coordinate system GCJ-02, per-campus source URLs/quality and deterministic catalog IDs. Hand to local Codex as a separately audited batch import, not a prerequisite for critical API bugs.

- The API RC growth fallback initially failed typecheck due to closure nullability; repaired in 0bcca876edd6e0dda575274777661c1c0be07adb. Its exact commit CI is the acceptance gate, not previous CI runs.
