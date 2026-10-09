# AGENTS.md — Jiuchen local development guardrails

This file applies to Codex and other coding agents working in this repository.

## Active Phase 1 code entry (2026-10-09 Gate 0)

Before changing UI/navigation read, in this order: `CONSTITUTION.md` → `docs/product/v1-baseline.md` → `docs/handoff/CURRENT.md` → `docs/design/jiuchen-v1-experience-blueprint.md` → **`docs/handoff/phase1-codex-execution-2026-10-09.md`** → `docs/design/jiuchen-v1-design-system.md` → dated Phase 0 map for historical route inventory.

The older "only Phase 0" execution header and 2026-09-22 construction map are **historical**, not active stop signs. Phase 1a is approved as a **separate, bounded code batch**; Gate 0 itself is docs-only. Do not treat this as approval to touch AI providers, payment, ECS production, database migrations or to fake missing read models.

For Phase 1a, verify current Git SHA and `git status --short` before editing; preserve all local files. Client currently has five tabs and must atomically migrate to four native static paths with compatible legacy navigation. `staff` keeps existing teacher-workspace capability without admin elevation. Apply mobile layout/interaction quality gates in each batch, not only at final visual polish.

## Authority and scope

1. Read `CONSTITUTION.md` before changing code.
2. Active engineering branch is `p1/foundation` unless the human explicitly assigns another branch.
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
