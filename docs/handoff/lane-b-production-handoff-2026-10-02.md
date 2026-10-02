# Lane B — ECS Production / DevOps handoff — 2026-10-02

## Executive status

Lane B infrastructure work is **complete and in production**.

Do not reopen the migration problem unless a new API backend release, an approved schema upgrade, or a real production incident requires it. The current priority should return to product/business acceptance.

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Integration branch: `p1/foundation`  
Current production release: `e4aa5c12a3e905ad1dba55ac92a26609bb171259`

## Production topology

- ECS: Alibaba Cloud Linux 3
- Formal root: `/opt/jiuchen-api`
- Active release:
  `/opt/jiuchen-api/releases/e4aa5c12a3e905ad1dba55ac92a26609bb171259`
- `current` points to the active immutable release.
- `/etc/jiuchen-api/approved-release` records the approved SHA.
- systemd: `jiuchen-api.service`, enabled + active
- private listener: `172.25.80.203:3100`
- isolated runtime: Node `22.23.3`
- production env: `/etc/jiuchen-api/production.env`, root-owned `0600`
- service user: `jiuchen-api`
- deploy user: `jiuchen-deploy`
- limits:
  - `MemoryMax=256M`
  - `CPUQuota=50%`
  - `TasksMax=64`
  - `NODE_OPTIONS=--max-old-space-size=160`
  - `Restart=on-failure`

Deployment boundary:

- `/usr/local/sbin/jiuchen-promote`
- `/usr/local/sbin/jiuchen-rollback`
- `jiuchen-deploy` must not receive a general root shell.

## Protected host assets

Routine Jiuchen operations must not modify:

- ports 80 / 443 / 8088
- the existing `jiuchenedu.com` Proxy Host
- Nginx Proxy Manager core configuration/database
- Harbor
- Portainer
- Docker networks or prune state
- `/www/wwwroot/jiuchen-current`
- system Python
- global Node
- unrelated company services/containers

Existing website remains:

`jiuchenedu.com -> Nginx Proxy Manager -> host nginx :8088`

## Public API

- API hostname: `https://api.jiuchenedu.com`
- NPM proxy target: `http://172.25.80.203:3100`
- Let's Encrypt + Force SSL: configured
- WeChat request legal domain: `https://api.jiuchenedu.com`

Accepted chain:

- production `/health/live`: passed
- production `/health`: passed, database=ok
- public `GET /products`: HTTP 200
- real-device WeChat login: passed
- real-device profile loading: passed
- real-device phone-number login: passed
- WeChat AppID/AppSecret path: validated
- ECS transport/session/database path: validated

## Important /products nuance

The current public catalog response is `source: "bundled"`.

The route intentionally falls back to bundled product handbooks when the product-knowledge table is missing. Therefore `GET /products = 200` validates the public product route, but **does not prove** that `product_knowledge_documents` / `product_knowledge_chunks` are production-ready.

Before switching product content to database-backed truth, explicitly verify the product-knowledge schema/import.

## Schema acceptance gates

Production schema is feature-gated. Do not assume every table is synchronized merely because login/profile works.

| Feature gate | Repository upgrade | Production status / interpretation |
| --- | --- | --- |
| Core profile/session/teacher foundation | `npm run db:upgrade:auth` | Required for profile/teacher foundation; profile device acceptance is already passing |
| Internal ID + news identity v2 | `npm run db:upgrade:identity-v2` | Verify before first full production acceptance of ID binding/news |
| Native phone auth | `npm run db:upgrade:native-auth` | Phone-number login acceptance passed |
| AI assessment persistence | `npm run db:upgrade:assessment` | Verify before enabling production assessment |
| Classroom guidance/plans | `npm run db:upgrade:classroom-guidance` | Verify before classroom production acceptance |
| Student edits/review + schedule import | `npm run db:upgrade:classroom-revisions` | Verify before editable classroom/review/schedule acceptance |
| Product knowledge documents/chunks | `npm run db:upgrade:product-knowledge` | `/products=200` is not sufficient because bundled fallback exists |

All production migrations are writes. Per `ops/ecs/AGENTS.md`, Lane B must first perform/read a read-only schema inspection and review the exact idempotent upgrade; the main control chat must explicitly approve the production write.

## CloudBase status

CloudBase environment remains available for the narrow capabilities that still provide practical value.

- CloudBase Storage upload/download/delete from ECS: passed
- dedicated CAM identity: validated
- CloudBase AI: not accepted as a production core dependency after repeated HTTP 429
- Storage may remain a temporary upload adapter
- AI providers must remain replaceable and are owned by Lane A

## AI configuration boundary

Lane B does not own AI-provider selection/runtime implementation.

Current known configuration state:

- `assessmentAiConfigured=false`
- `scheduleAiConfigured=false`
- `customerAiConfigured=false`

Do not treat these as infrastructure migration failures. Lane A should deliver the approved provider/env contract; Lane B should only place approved production configuration into the root-owned environment and deploy a reviewed release.

## Release discipline

Current production release should remain pinned until a backend change actually needs deployment.

Future releases:

`candidate/staging -> verify -> immutable releases/<SHA> -> approved-release -> promote -> health -> rollback if needed`

Never return to manually overwriting `current`.

The old smoke units are inactive. The fallback unit is retained only for emergency recovery and must not be casually started because it can collide on port 3100.

## Repository relationship to production

At the time of this handoff, `p1/foundation` is ahead of the production release, but the post-production changes are primarily mini-program customer-service integration plus AI/case documentation and evaluation tooling. No new ECS API backend code requires a production release solely to chase the integration-branch head.

## Main-control conclusion

Lane B's migration objective has been achieved:

**ECS production runtime + database + DNS + NPM + HTTPS + WeChat legal domain + real-device login/profile/phone chain are working as one production path.**

Next work should be product/business acceptance. Lane B should re-enter only for:

1. an approved new backend release;
2. a feature-specific production schema gate;
3. approved AI runtime env placement after Lane A closes its provider work;
4. a real production incident or rollback.

Do not spend more cycles re-validating already accepted infrastructure without a concrete failure signal.
