# 2026-10-10 Branch cleanup audit (post mainline integration)

## Heads and CI
- Development: `p1/foundation` = `8e08271a04774342226321fdc5440719fea1b768` (both latest workflows SUCCESS).
- API RC: `p1/rc-api-ea8c-readonly-date-2026-10-10` = `5b048de30d3592d0d61fcd4a9af8fee5f37f09e3` (CI PASS; still NOT deployed).
- Production base: `ea8c971008a9efd042ec43fdc62398e136262259`, ancestor of API RC, retained via `p1/release-identity-bootstrap-v2-20261008`.
- GitHub `main` remains historical default. Do not fast-forward/rebase it blindly.

## Deletion-ready refs (all reachable from retained branches)
- `p1/rc-wechat-2026-10-10` — merged into `p1/foundation`, zero unique commits.
- `p1/assessment-import-classroom-ui-20261006` — ancestor of `p1/foundation`, zero unique commits.
- `p1/assessment-502-hotfix-20261006`, `p1/assessment-evidence-boundary-hotfix-20261006`, `p1/production-api-candidate-20261006`, `release/production-api-candidate-20261006`, `p1/release-api-core-currentbase-20261007`, `p1/release-api-import-fix-20261007` — ancestors of retained API RC, zero unique commits.
- `p1/release-identity-bootstrap-v2-20261008` also is ancestor of API RC, but **retain** it as the exact operator-confirmed production baseline until the next production release is fully audited and rollback validated.

## Keep — unique commits vs BOTH retained development and API branches
- `hotfix/read-only-schedule-2026-10-10`, `p1/release-readonly-schedule-2026-10-10`, `p1/assessment-background-client-gate-20261006`, `p1/release-api-core-closeout-20261007`, `p1/release-identity-bootstrap-20261008`.
- `p2/prototype-shell` and `p2/v1-shell`: historically divergent, preserve pending explicit archival decision.
- `main`, `p1/foundation`, API RC and deployed-base ref: keep.

## Safe operator procedure
The connected GitHub API does not currently expose deletion of branch refs. No remote branches have been deleted by this assistant.
Before deleting, `git fetch origin --prune`, confirm each named ref's HEAD, and test `git merge-base --is-ancestor refs/remotes/origin/<candidate> refs/remotes/origin/<retained-parent>` returns exit code 0. Then run `git push origin --delete <candidate>` using a curated static list. Do not delete the production base anchor or any ref with unique commits.

Do not touch ECS, NPM, official website, Docker or schema during Git branch housekeeping.
