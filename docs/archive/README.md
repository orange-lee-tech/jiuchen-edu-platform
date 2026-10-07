# Archive policy

Historical work is retained for auditability, but it must not compete with the active delivery line.

Rules:

- `docs/handoff/CURRENT.md` is the active pointer.
- Dated handoff/incident/closeout documents are immutable historical evidence unless a factual correction is necessary.
- Do not copy old status text forward as if it were current. Link to the historical document instead.
- Release-candidate branches are frozen after rollout; client development and WeChat preview return to `p1/foundation`.
- Generated `jiuchen-api-*.tar.gz` bundles stay local/staging only and are ignored by Git.
- Production truth is the active immutable release on ECS plus health/acceptance evidence, not an old handoff SHA.
- When a package closes, record the final commit/release and move the next action into `docs/handoff/CURRENT.md`; do not leave multiple “current” files competing for authority.
