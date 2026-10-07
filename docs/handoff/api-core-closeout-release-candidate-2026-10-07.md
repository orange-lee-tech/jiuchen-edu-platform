# API Core Closeout Release Candidate — 2026-10-07

Base production release: `34892d8c44052d955224b1e1882cde34a73a53f7`

Intentional overlay only:
- Assessment durable background execution;
- Assessment material import with Tencent MultimodalDocParse adapter;
- current Assessment runtime/evidence validation covered by tests;
- real WPS/CSU XLS parser fixes;
- Classroom graceful degradation when coaching_records is absent;
- bounded DB cold-connect hardening.

Excluded:
- News timer/service rollout and News schema changes;
- payment/credit productionization;
- Blueprint/UI shell work;
- production schema writes.

Post-CI production gates:
1. immutable API preflight;
2. ECS live MultimodalDocParse probe using production CAM;
3. controlled promote;
4. health/live, health, health/config;
5. Assessment quick-submit -> running -> terminal real-device acceptance;
6. DOCX/PDF/image material-import real-device acceptance;
7. exact WPS/CSU XLS import + edit/save/reopen acceptance.

No new feature development is authorized on this branch.
