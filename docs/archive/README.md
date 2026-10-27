# Archive policy

Historical work is retained for auditability, but it must not compete with the active delivery line.

Rules:

- `docs/handoff/CURRENT.md` is the active pointer.
- Dated handoff/incident/closeout documents are immutable historical evidence unless a factual correction is necessary.
- Do not copy old status text forward as if it were current. Link to the historical document instead.
- `main` is the only integrated source authority. `p1/foundation` is a legacy integration branch, not a development entry point. Before pruning any branch, verify its exact current SHA and ancestry; retain historical commits and evidence.
- Generated `jiuchen-api-*.tar.gz` bundles stay local/staging only and are ignored by Git.
- Production truth is the active immutable release on ECS plus health/acceptance evidence, not an old handoff SHA.
- When a package closes, record the final commit/release and move the next action into `docs/handoff/CURRENT.md`; do not leave multiple “current” files competing for authority.
