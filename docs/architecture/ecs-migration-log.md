# ECS Migration Log

> Working log for migrating the Jiuchen Education mini-program backend from Tencent CloudBase CloudRun to the existing Alibaba Cloud ECS.
>
> This file intentionally excludes secrets, public IPs, passwords, API keys, SSH private keys, and other sensitive credentials.

## Baseline

- Repository: `orange-lee-tech/jiuchen-edu-platform`
- Active development branch: `p1/foundation`
- Migration baseline commit: `ba552c91ffd6fd0e24e5733fe8dcd7e0f1bb01ea`
- Existing CloudBase environment: `cloud1-d3geim00r03edb212`
- Existing CloudRun service: `jiuchen-api`
- API release observed during smoke test: `0.3.0-experience`

## Migration policy

1. Do not rewrite the application merely for migration.
2. Keep CloudBase available as rollback / WeChat ecosystem integration until the ECS path is proven.
3. Do not alter the existing `jiuchenedu.com` website, host nginx on port `8088`, or the Nginx Proxy Manager listeners on `80/443` during smoke validation.
4. New API runtime uses port `3100`.
5. Core business API / database access moves to ECS first; CloudBase-only capabilities are isolated and replaced later only when justified.
6. Uploaded spreadsheet/image source files are temporary binary inputs, not durable business records.

## Confirmed ECS topology

- OS: Alibaba Cloud Linux 3, x86_64
- Capacity: 2 vCPU, ~1.8 GiB RAM, 2 GiB swap, 40 GB disk
- Existing website path: Nginx Proxy Manager -> host nginx `:8088` -> website files
- New API path under test: Node/Fastify -> `172.25.80.203:3100`
- Smoke directory: `/opt/jiuchen-api-smoke`
- Planned production directory: `/opt/jiuchen-api`

## Gate 10: 256 MiB ECS smoke test

Status: **PASSED**

Validated on 2026-10-01:

- Node runtime used for smoke: `v24.16.0` (production target remains Node 22 LTS)
- npm: `11.13.0`
- `npm install`: success
- Typecheck with `NODE_OPTIONS=--max-old-space-size=256`: success
- Tests: `55/55` passed
- Build with 256 MiB heap cap: success
- Transient systemd limits:
  - `MemoryMax=256M`
  - `CPUQuota=50%`
  - Node heap `--max-old-space-size=160`
- API listening on `172.25.80.203:3100`
- Sequential live checks: `200/200` HTTP 200
- Concurrent checks:
  - `/health/live`: `400/400` HTTP 200
  - `/health/config`: `100/100` HTTP 200
  - `/health`: `100/100` HTTP 200 while database intentionally unconfigured
- cgroup peak memory observed: ~80.8 MiB
- Node high-water RSS observed: ~134 MiB
- `VmSwap=0`
- cgroup `memory.failcnt=0`
- CPU quota verified as `50000/100000 = 50%`
- Existing Nginx Proxy Manager container remained running
- Existing ports `80/443/8088` remained untouched
- No recent warning/error entries from the smoke unit

## Database connectivity

Status: **PASSED**

Validated on 2026-10-01:

- ECS DNS resolution for the configured database endpoint: success
- ECS TCP connection to database port: success
- Direct `mysql2` connection: success (~83 ms observed)
- `SELECT 1`: success
- API `/health` with real database configuration: HTTP 200
- Five consecutive API health checks returned `database: ok`
- Required schema checks passed, including core auth/profile/student/teacher/planning/schedule tables
- One earlier `ETIMEDOUT` was transient and was not reproducible after direct protocol and pool validation
- No database whitelist change was required during validation

## CloudBase plan / lifecycle observations

Observed in Tencent Cloud console on 2026-10-01:

- Environment type: **微信体验版**
- Environment state: active
- Environment expiry: **2027-03-17 23:59:59**
- Free experience edition does not support automatic renewal
- Current displayed paid upgrade option: Cloud Development Personal Edition, promotional price shown as `¥19.90/month`
- Current environment resource usage is extremely low
- Token usage page is locked for this experience tier and suggests upgrading to resource-point-based token accounting

Governance decision:

- Do **not** upgrade merely to inspect token usage.
- Do **not** remove CloudBase merely to avoid a low monthly fee.
- Move core business runtime and data access to ECS.
- Keep CloudBase temporarily as a thin WeChat ecosystem adapter where it still provides practical value.
- CloudBase Storage / AI must remain replaceable providers rather than permanent core dependencies.

## CloudBase dependencies still present

Current known dependencies:

1. Schedule-import temporary files:
   - mini-program uploads to CloudBase Storage
   - backend downloads the `cloud://` file
   - parses to canonical JSON
   - deletes temporary source file
2. Schedule image parsing:
   - backend currently calls CloudBase AI
   - model configured in current code: `qwen3.5-plus`

### ECS -> CloudBase validation

Validated on 2026-10-01 with the dedicated `jiuchen-ecs` CAM identity:

- CloudBase Storage upload: **PASSED**
- CloudBase Storage download: **PASSED**
- CloudBase Storage delete: **PASSED**
- CloudBase AI call from ECS using `qwen3.5-plus`: **BLOCKED**
- CloudBase AI call from ECS using current recommended `hy3`: **BLOCKED**
- Both AI attempts returned HTTP `429`

Interpretation:

- CAM credentials and environment-scoped access are confirmed working because Storage upload/download/delete succeeds.
- The AI failure is no longer treated as a CAM authentication failure because Storage operations using the same identity succeed.
- Repeating the AI test with `hy3` also returned HTTP `429`, so the blocker is not specific to the retired `qwen3.5-plus` model name.
- The current WeChat experience-tier environment is therefore not accepted as a production dependency for ECS-side AI inference without an explicit paid-plan decision.
- Do not upgrade the CloudBase plan merely to make this smoke test green.
- Migration decision: keep CloudBase Storage temporarily, but replace schedule-image AI with a provider abstraction callable directly from ECS. CloudBase AI may remain an optional provider later, not a hard dependency.

## CloudBase machine identity

Status: **CREATED**

Validated on 2026-10-01:

- CAM sub-user: `jiuchen-ecs`
- Purpose: programmatic access from Jiuchen ECS to required CloudBase resources
- Console login: disabled
- Programmatic/API access: enabled
- Phone/email: intentionally not bound because this is a machine identity
- Attached custom policy: `JiuchenEcsCloudBaseEnvAccess`
- Policy scope: CloudBase environment `cloud1-d3geim00r03edb212`
- SecretId/SecretKey were created and stored outside Git/chat
- Production credentials should ultimately be controlled by Jiuchen, with development credentials rotated/revoked during handover

Security note:

- The environment-scoped policy currently allows `tcb:*` for this single CloudBase environment to unblock migration validation.
- After Storage/AI calls are verified, narrow the policy to only the actions actually required by the ECS adapter.

## Production cutover — completed 2026-10-01 / accepted 2026-10-02

Status: **PRODUCTION CHAIN COMPLETE**

Current production facts:

- Active API release: `e4aa5c12a3e905ad1dba55ac92a26609bb171259`
- Formal layout:
  - `/opt/jiuchen-api/releases/<commit>`
  - `/opt/jiuchen-api/current` -> active immutable release
  - `/etc/jiuchen-api/approved-release` records the approved release
- Runtime:
  - isolated Node `22.23.3`
  - `jiuchen-api.service` enabled and active
  - private bind `172.25.80.203:3100`
  - `MemoryMax=256M`
  - `CPUQuota=50%`
  - `TasksMax=64`
  - `NODE_OPTIONS=--max-old-space-size=160`
  - `Restart=on-failure`
- Production environment file:
  - `/etc/jiuchen-api/production.env`
  - root-owned, mode `0600`
- Routine deployment boundary:
  - runtime user: `jiuchen-api`
  - deployment user: `jiuchen-deploy`
  - `jiuchen-deploy` is restricted to Jiuchen promote/rollback commands and is not a general root shell
- Deployment commands:
  - `/usr/local/sbin/jiuchen-promote`
  - `/usr/local/sbin/jiuchen-rollback`
- Old smoke units are inactive; the fallback unit remains available for emergency recovery but must not be started casually because it can conflict on port 3100.

Public ingress:

- `api.jiuchenedu.com` resolves to the shared ECS public endpoint.
- Nginx Proxy Manager adds a **new** Jiuchen API proxy host only:
  - `api.jiuchenedu.com` -> `http://172.25.80.203:3100`
- Let's Encrypt HTTPS and Force SSL are enabled for the API hostname.
- The existing `jiuchenedu.com` website proxy remains unchanged and continues to target host nginx `:8088`.

Verified application chain:

- `/health/live`: production acceptance passed.
- `/health`: production acceptance passed with `database=ok`.
- `GET /products`: public HTTPS request returns HTTP 200.
- Mini-program request legal domain includes `https://api.jiuchenedu.com`.
- Real-device WeChat login passed end-to-end through `wx.login`, `jscode2session`, ECS API, production DB and API session creation.
- Real-device profile loading passed.
- Real-device phone-number login passed.
- CloudBase Storage remains intentionally retained as a temporary upload adapter; ECS upload/download/delete validation passed.
- CloudBase AI remains non-core and is not accepted as a production inference dependency.

### Product route caveat

The public `/products` response currently reports `source: "bundled"` for the returned catalog. This is an intentional application fallback: if `product_knowledge_documents` does not exist, the route still returns the bundled baseline catalog.

Therefore:

- `/products = 200` proves the public API/product route is healthy.
- It does **not** by itself prove the production product-knowledge schema/import is ready.
- Before relying on database-backed product content, verify the product-knowledge schema and import explicitly.

### Production schema gate policy

Do not assume every business schema is synchronized merely because auth/login is healthy.

Repository upgrade scripts currently include:

- `db:upgrade:auth` — profile/session/teacher assignment foundation
- `db:upgrade:identity-v2` — user status/deletion, internal IDs, news posts
- `db:upgrade:native-auth` — phone-number auth columns/index
- `db:upgrade:assessment` — assessment persistence
- `db:upgrade:classroom-guidance` — classroom guidance/planning foundation
- `db:upgrade:classroom-revisions` — editable revisions/review workflow and schedule imports
- `db:upgrade:product-knowledge` — product knowledge documents/chunks

Production schema changes are **write operations** and remain approval-gated by `ops/ecs/AGENTS.md`. Before first production acceptance of a feature, inspect its required schema read-only, review the exact idempotent upgrade, obtain explicit main-control approval, then run only that approved upgrade.

## Next steps

Infrastructure migration is no longer the main workstream. Lane B should remain quiet unless a new API release or an explicitly approved production schema action requires it.

1. Keep the current production release unchanged until a backend change justifies a new ECS release.
2. For every new backend release, preserve the sequence:
   staging/candidate -> validation -> immutable `releases/<SHA>` -> `approved-release` -> promote -> health -> rollback on failure.
3. Gate each not-yet-accepted business feature on a read-only production schema check before any migration write.
4. Do not infer product-knowledge DB readiness from `/products = 200`; the current bundled fallback is designed to survive a missing table.
5. AI provider configuration remains a Backend/AI lane responsibility. Production currently reports assessment/schedule/customer AI as not configured until that lane provides approved runtime configuration.
6. Keep the existing website, Nginx Proxy Manager core listeners, Harbor, Portainer, Docker networks, system Python and global Node outside Jiuchen routine deployment scope.
7. During ownership handover, rotate/reduce temporary developer credentials and keep Jiuchen-designated administrators as the owners of production cloud/API credentials.

## Handover rule

Before production handover:

- Jiuchen-designated administrators must own the primary cloud accounts and production credentials.
- Rotate production API keys / CAM secrets after ownership transfer.
- Remove or reduce temporary developer access as required.
- Keep this log updated with verified facts rather than relying on chat history.
