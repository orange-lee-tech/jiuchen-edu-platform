# Parallel workstream handoffs — 2026-10-01

Use these texts to open parallel ChatGPT/Codex conversations. Each lane must return: branch, commit SHA, changed files, tests, and unresolved risks.

## Shared baseline

Repository: `orange-lee-tech/jiuchen-edu-platform`
Active integration branch: `p1/foundation`
Read first:
- `CONSTITUTION.md`
- `AGENTS.md`
- `docs/architecture/ecs-migration-log.md`

Do not merge to `main`. Do not expose secrets. Preserve unrelated untracked/local files.

---

## Lane A — Backend / AI architecture

You are responsible only for the Jiuchen API portability/AI architecture closure.

Known facts:
- ECS smoke/resource/database validation passed.
- ECS -> CloudBase Storage upload/download/delete passed with dedicated CAM identity.
- CloudBase AI returned HTTP 429 for both qwen3.5-plus and hy3; do not keep debugging it as a core dependency.
- CloudBase Storage may remain temporarily.
- `schedule-parser.ts` currently mixes CloudBase file access, spreadsheet parsing, and image-AI parsing.
- `assessment-runtime.ts` already defines `AssessmentModelProvider`, but production routes still default to an unconfigured runtime.
- `env.ts` and `/health/config` do not yet correctly represent CAM SecretId/SecretKey external configuration.

Objectives:
1. Separate schedule Storage from schedule Image-AI provider.
2. Keep CloudBase Storage adapter working.
3. Add replaceable assessment and schedule-AI runtime configuration without hard-binding a vendor.
4. Correct CAM env/config health reporting without leaking secrets.
5. Preserve strict Schema validation, evidence constraints, cleanup behavior, and failure-without-credit semantics.
6. Prepare separate assessment/customer-service AI credentials/budgets, but do not build a general chat system.
7. Add focused tests and run API typecheck/tests/build.

Do not deploy to ECS or alter mini-program transport in this lane.

Return a concise handoff with commit SHA, changed files, tests, migration/env notes, and remaining blockers.

---

## Lane B — ECS production / DevOps

You are responsible only for production deployment design/execution on the shared Alibaba ECS.

Start in **read-only planning/preflight mode**. Do not perform ECS write operations until a least-privilege deployment user and command boundary have been established and the main control chat explicitly approves writes.

Read `ops/ecs/AGENTS.md`. A copy may live at `/opt/jiuchen-api/AGENTS.md` as an operational contract, but it is **not** a security boundary and must not be counted as one. Codex must not receive unrestricted root access for routine deployment work.

Known facts:
- Existing company website path must not be changed.
- Existing Nginx Proxy Manager owns 80/443.
- host nginx website listener is 8088.
- Jiuchen API private port is 3100.
- smoke service passed MemoryMax=256M, CPUQuota=50%, Node heap 160 MiB.
- production target is Node 22 LTS.
- database connectivity/schema passed.
- formal deployment path should be `/opt/jiuchen-api`.

Objectives:
1. First design and verify a dedicated unprivileged deployment user (for example `jiuchen-deploy`) and a narrowly allowlisted sudo/command boundary for Jiuchen-only operations.
2. Create isolated immutable release layout under `/opt/jiuchen-api`.
3. Pin an isolated Node 22 runtime without replacing global Node/system Python.
4. Create permanent `jiuchen-api.service` with resource limits, root-only env, restart/health/rollback discipline.
5. Produce preflight/deploy/rollback procedure.
6. Do not touch NPM/HTTPS until API release itself is healthy.
7. After explicit approval, add only a new `api.jiuchenedu.com` proxy/HTTPS entry; never modify the existing website proxy host.

Do not modify application business logic in this lane.

Return active release commit, files/unit changed, health/resource results, rollback target, and anything still requiring human approval.

---

## Lane C — WeChat / mini-program integration

You are responsible only for the WeChat-facing transport and acceptance path.

Known facts:
- Current mini-program defaults to CloudBase CloudRun via `wx.cloud.callContainer`.
- target core API is HTTPS `api.jiuchenedu.com` on ECS.
- CloudBase Storage may remain because `wx.cloud.uploadFile` is useful and its ECS access is verified.
- official WeChat/WeCom capabilities are preferred for login, payment, customer service, human handoff, file/platform functions.
- do not rebuild an unnecessary generic chat/customer-service platform.

Objectives:
1. Design/implement environment-safe switch from CloudRun transport to HTTPS ECS transport.
2. Keep CloudBase initialization only where CloudBase Storage is still needed.
3. Identify/request only the WeChat legal request/upload/download domains actually required.
4. Preserve auth/session behavior.
5. Plan V1 customer service around official WeChat/WeCom entry + simple AI FAQ/RAG + immediate human handoff.
6. Define real-device acceptance checklist: login, profile, internal ID, classroom editing/review, spreadsheet schedule, image schedule, news, AI assessment, customer service.
7. Do not change ECS/NPM/server configuration in this lane.

Return commit SHA (if code changed), changed files, required console configuration, device-test checklist, and blockers.
