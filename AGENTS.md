# AGENTS.md — Jiuchen local development guardrails

This file applies to Codex and other coding agents working in this repository.

## Current branch authority (2026-10-27)

`main` is the sole authoritative integrated source. PR #9 is merged at `8778fde63cfaa74170bfb50090fbac7c623278d9` from PR head `b6318c748e26c868374a7fdd92c345da8317ed44`; both the PR-head CI and the main-push CI passed. These checks establish repository validation only, not current production deployment, database migration, WeChat formal publication, or payment-switch state.

`docs/handoff/CURRENT.md` is the sole live status page. Use `docs/handoff/README.md` for navigation. Historical handoff documents remain evidence; do not promote old SHA values or dated “pending” statements into current facts. `p1/foundation` and other candidate branches are historical and must not be treated as a competing source of truth.

## Active entry and priority (2026-10-27)

Read in order:
`CONSTITUTION.md` → `AGENTS.md` → `docs/handoff/CURRENT.md` → relevant module contract/source. Before ECS work also read `ops/ecs/AGENTS.md`.

Current priority:
1. Complete GitHub branch and local worktree cleanup without deleting Git history or unreviewed local data.
2. Synchronize the Windows UI workspace to the latest `origin/main`.
3. Begin the approved blue-gold warm UI/UX revision, prioritizing the Today workbench, today/tomorrow timetable, planning summary and semester switcher.

Production DDL, ECS release promotion, service cutover, timer enabling, WeChat publishing, AI/payment configuration changes and broadening read-only role powers remain separate approved actions. Do not infer production state from a source SHA, historical handoff, CI green, or the existence of a migration script.

## Authority and scope

1. Read `CONSTITUTION.md` before changing code.
2. `main` is the authoritative integrated source. Use an existing task branch when practical; create another only when the user asks or isolation is needed. Do not revive `p1/foundation` as a competing authority.
3. Do not merge to `main`, force-push, rewrite history, or delete branches unless the human explicitly approves that exact action.
4. Preserve all untracked and locally modified files. Never use `git reset --hard`, `git clean -fd`, or equivalent destructive cleanup without explicit human approval.
5. Work only inside this repository unless the task explicitly authorizes another path.

## Secrets and production data

Never print, copy, commit, upload, or expose:
- `.env` values;
- database URLs/passwords;
- Tencent CAM SecretId/SecretKey;
- WeChat AppSecret/payment keys;
- AI API keys;
- SSH private keys/passphrases;
- real student private data.

Only show secret *names* or redacted presence/length checks.

## Architecture boundaries

- Alibaba ECS is the core API runtime.
- MySQL is the online source of truth.
- CloudBase Storage may remain as a temporary WeChat-integrated upload adapter.
- CloudBase AI is not a required core dependency.
- AI providers must remain replaceable behind explicit adapters.
- Prefer official WeChat ecosystem capabilities for login, payment, customer service, upload and other platform concerns when they meet the business need.
- Do not introduce microservices, queues, Kubernetes, new databases, or a second backend unless an approved requirement justifies them.

## Parallel-work safety

When working as one parallel lane:
- modify only the files needed for the assigned lane;
- do not opportunistically refactor adjacent modules;
- do not change another lane's deployment, WeChat, or AI-provider files unless necessary and explicitly stated;
- before editing, run `git status --short` and preserve unrelated work;
- at handoff, report changed files, commit SHA, tests run, and remaining risks.

## Validation before commit/push

For `services/api` changes, run the relevant tests plus:
- `npm run typecheck`
- `npm test`
- `npm run build`

For mini-program changes, run the repository's available checks and ensure TypeScript/build validation where available.

Do not claim success from code inspection alone when a runnable test exists.

## Git publishing

A completed, verified batch may be committed and pushed to its assigned non-main branch when the human task asks for implementation. Use a focused commit message. Never push secrets or generated production credentials.

## Stop conditions

Stop and ask/report instead of guessing when:
- an operation may destroy data or overwrite unrelated work;
- a production credential or payment action is required;
- a schema/data migration would write production data;
- an infrastructure change affects the existing company website;
- the requested action conflicts with `CONSTITUTION.md` or this file.
