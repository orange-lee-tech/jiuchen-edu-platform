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

## Next steps

1. Store CAM credentials only in a root-readable ECS environment file.
2. Validate ECS -> CloudBase external Storage and AI access.
3. Narrow `JiuchenEcsCloudBaseEnvAccess` from environment-scoped `tcb:*` to the verified minimum action set.
4. If successful, create production `/opt/jiuchen-api` deployment with permanent systemd unit and rollback procedure.
5. Add `api.jiuchenedu.com` in Nginx Proxy Manager and enable HTTPS.
6. Configure WeChat legal domains as required.
7. Run real mini-program experience-build / device acceptance tests.
8. Only after stable acceptance, reduce or retire CloudRun.

## Handover rule

Before production handover:

- Jiuchen-designated administrators must own the primary cloud accounts and production credentials.
- Rotate production API keys / CAM secrets after ownership transfer.
- Remove or reduce temporary developer access as required.
- Keep this log updated with verified facts rather than relying on chat history.
