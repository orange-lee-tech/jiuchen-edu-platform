# Parallel workstreams — 2026-10-01

> **Historical organization note.**
>
> The original permanent Lane A/B/C conversations have completed their main
> purpose and may now be closed. Future work should be opened by concrete work
> package, not by maintaining permanent parallel lanes.
>
> Current plan:
> `docs/handoff/main-control-status-2026-10-03.md`

## What remains useful from this document

Parallelism is by responsibility, not by branch count.

Do **not** create a new Git branch merely because a work package exists. Only create
a temporary branch/worktree when two active code packages truly need concurrent
edits and main control explicitly approves it. Otherwise keep `p1/foundation` as
the integration branch and serialize commits.

All work still obeys:
- `CONSTITUTION.md`
- `AGENTS.md`
- secret/privacy restrictions
- production schema-write approval
- protected ECS/website boundaries

## Legacy lane mapping

### Former Lane A — Backend / AI
Closed as a permanent lane after provider/model evaluation and Assessment runtime
hardening. Re-open only as a specific package such as:
- Assessment runtime parity;
- Credit/Payment backend;
- Schedule AI provider.

### Former Lane B — Production Guardian
Infrastructure migration is complete. Re-enter only for:
- an approved production schema gate;
- reviewed immutable release deployment;
- rollback/incident;
- approved production secret/runtime configuration.

### Former Lane C — WeChat / device acceptance
Transport/customer-service integration is complete. Re-enter only for:
- a defined real-device acceptance package;
- a concrete mini-program UI/interaction defect;
- News/Products acceptance.

## Preferred new conversation model

Open only the conversation needed for the next executable package:

1. Assessment Production Gate
2. Credit + WeChat Pay
3. Learning Service Closure
4. Content Center
5. Final UI Polish

Do not maintain idle lanes or duplicate already-closed checks.
