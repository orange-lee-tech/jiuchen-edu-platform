# AGENTS.md — Jiuchen local development guardrails

This file applies to Codex and other coding agents working in this repository.

## Current branch authority (2026-10-30)

`main` is the sole authoritative integrated remote source. Current GitHub `main` HEAD is `36aea4bab3e9bc1aa1c46403cc05e3b2208df1d4`; PR #10 has been merged. The latest user-provided ECS receipt reports production API at the same SHA with DEPLOY PASS and API SMOKE PASS, and the academic-stage-mode / plan-item-due-date migrations applied. Treat the ECS details as user-provided evidence; re-read the live host before any new production operation.

A local-only candidate was previously reported:
- branch: `codex/product-closeout-20261030`
- commit: `d3dcfe4eb1bed3cb511aebeaf6bc9f56837e34b1`
- reported base: `102b5c8fb228e9db999c55ea47e469b867c29003`

This branch and commit are not present in the current remote branch list. They may exist only in the user's Windows workspace. Do not assume they are pushed or equivalent to `main`; preserve the original branch and inspect its ancestry and diff before integration.

`docs/handoff/CURRENT.md` is the sole live status page. The 2026-10-30 product scope and execution rules are in `docs/handoff/product-workstream-authoritative-brief-2026-10-30.md`. Read both before code work. The manual backup and backend engineering guides are proposed in PR #12 and are not yet part of `main`.

## Active entry and priority (2026-10-30)

Read in order:
`CONSTITUTION.md` → `AGENTS.md` → `docs/handoff/CURRENT.md` → `docs/handoff/product-workstream-authoritative-brief-2026-10-30.md` → local candidate handoff (if present) → relevant source and tests. Before ECS work also read `ops/ecs/AGENTS.md`.

Current priority:
1. Run the product brief's read-only PowerShell preflight. Confirm repository path, branch, HEAD, staged/unstaged/untracked changes, stashes, local candidate commit, and remote main.
2. Preserve all local-only assets. Compare the reported `d3dcfe4` candidate with `origin/main`; do not blindly reset, rebase, cherry-pick, clean, or overwrite. If state is ambiguous or dirty, stop and report before editing.
3. Reconcile the local candidate against the screenshot-backed requirements. Reuse existing plans, revisions, credit ledger, PIN controls, teacher assignments, assessment usage records, and provider key objects.
4. Implement and test the end-to-end gaps across staff profiles, teacher workspace/planning/templates/custom plans/todos, scoped news tags, admin credit grants, AI service/model/balance controls, draft saving, upcoming tasks, and timetable collapse.
5. Prepare fixed-SHA production release and migration evidence only after code and isolated MySQL validation. New production migrations and API promotion require separate explicit approval for this workstream.

Do not infer production state from source SHA, historical handoff, CI green, or a local candidate. Do not expand production permissions or modify the company website/shared entry.

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
