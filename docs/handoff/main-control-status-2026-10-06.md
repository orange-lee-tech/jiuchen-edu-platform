# Main control status — 2026-10-06

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Integration branch: `p1/foundation`  
Verified repository HEAD at write time: `ddf76a8b6650de3e83f63170fb6144b20c02e9e8`  
CI on that HEAD: push PASS / pull_request PASS.

Current production API release reported by operations:
`d23f0f128fdb6fec648e6405df672e41734b3ece`

## Executive status

The project is no longer in infrastructure-migration mode. Most major subsystems now exist and several have passed production or real-device gates.

The remaining work should be treated as **bounded closeout packages**, not as permanent parallel lanes.

Current priority:

1. isolate and close the new Assessment production regression on `POST /me/assessments/:id/run` (HTTP 502);
2. deploy/re-test the already-fixed real XLS schedule parser;
3. finish customer-visible News/Schedule acceptance where still pending;
4. complete commercial production gates only when merchant/business parameters are available;
5. refresh the Experience Blueprint Phase 0 map against the post-Phase-0 repository, then start Phase 1 in small batches.

Do not reopen broad AI model selection, ECS migration, NPM, or old UI refactors.

## 1. Assessment — previously delivered, new production regression only

Assessment model/runtime selection is CLOSED:
- provider contract in production: `qianwen-maas`;
- model: `qwen3.8-flash`;
- non-thinking;
- strict JSON Schema;
- production corpus and Assessment schema previously passed.

The 2026-10-05 production incident was fully closed after cross-device acceptance:
- Assessment completed successfully;
- persisted result reopened on phone;
- no second model call occurred.

Canonical evidence:
`docs/handoff/assessment-production-incident-2026-10-05.md`

### New 2026-10-06 evidence

Developer Tools now shows:

```text
POST /me/assessments/<id>/run -> HTTP 502
```

The presence of a concrete Assessment ID proves that the Run action got past draft creation far enough to invoke the run endpoint. It does **not** prove the standalone Save Draft button independently passes, but it does rule out the old hypothesis that every failure is stuck before an Assessment row exists.

The old `achievementTier` client/server drift hypothesis is obsolete: both current production release and current branch support that field.

Classification:
**new production regression / incident**, not unfinished model development.

Do not reopen benchmark, prompt tuning, RAG design, model selection, or Result UX unless direct evidence points there.

Next evidence for this incident should come from:
- the HTTP 502 response body for the failing `:id/run`;
- the matching production log entry / provider diagnostic for that request.

Then fix only the proven cause.

## 2. News / Official Account

Backend production path is PASS:
- Official Account credentials accepted;
- WeChat-observed ECS IP whitelist works;
- real token probe PASS;
- published article sync PASS;
- `news_posts` repaired to utf8mb4;
- persisted article body PASS;
- public list/detail PASS.

Recent repository work also includes:
- native News experience;
- persisted server-side tags;
- unclassified-item handling;
- cover/media normalization;
- compact News cards;
- automatic Official Account sync service/timer code.

The latest automatic-sync service/timer commits are in Git and CI is green. Their actual production activation should not be assumed unless separately verified.

Do not reopen title-keyword classification or Official Account authentication work.

## 3. Schedule

Completed / verified:
- real multimodal provider configured;
- provider: `qianwen-maas`;
- model: `qwen3-vl-plus`;
- real vision probe HTTP 200;
- `scheduleAiConfigured=true`;
- real-device image timetable extraction succeeded (13 courses reported);
- direct schedule editing / persistence UX exists.

Real WPS/CSU XLS root cause has been diagnosed and fixed in repository:
- clock rows such as 08:00 no longer become invalid section numbers;
- bracketed week expressions handled;
- Chinese building-room forms handled;
- split teacher/week forms handled;
- regression test added.

Relevant commits:
- `5c53a329...` parser fix;
- `bfc13382...` real-layout regression test.

Important:
current production release `d23f0f...` predates those XLS parser fixes.

Therefore current remaining Schedule gate is narrow:
**deploy a reviewed release containing the XLS fixes and re-test the exact real file.**

Do not reopen Schedule AI model selection.

## 4. Classroom / Plan

Schedule entry UX has continued to improve in repository, including integration into the Classroom navigation and compact editable cards.

Long-term Plan / coaching semantics remain independent from schedule editing.

Do not fake teacher guidance or plan data to make Blueprint pages look complete.

Any missing production `coaching_records` / guidance gate should be handled only when the Plan package is explicitly resumed.

## 5. Commercial / Credit / Payment

Commercial backend foundation is CLOSED at code-contract level:
- ledger/read model;
- held / settled / available balance;
- free-grant contract;
- Assessment reservation/debit/release semantics;
- retry/idempotency;
- server-side SKU contract;
- WeChat Pay signing/verification/decryption/settlement boundaries;
- exactly-once payment grant;
- client cannot set trusted amount/credits/balance.

Enforcement remains intentionally disabled by default.

Still not production-complete:
- approved free-grant amount/version;
- approved SKU/price;
- production credit/payment schema gate;
- real merchant credentials/certificates/APIv3 configuration;
- payment UI;
- real-device recharge/payment acceptance.

Do not invent business prices or free quotas.

## 6. Growth Profile

Canonical Growth Profile remains the single fact source for reusable user facts.

Already implemented:
- user-confirmed reuse of Assessment facts;
- deterministic Resume/Application projections;
- DOCX generation;
- cache/race hardening.

Do not build a second profile/resume fact store.

## 7. Experience Blueprint / UI

Experience Blueprint Phase 0 mapping completed in:
`docs/handoff/experience-blueprint-phase0-map-2026-10-04.md`

Phase 0 recommended:
- native TabBar;
- four stable role-aware shell slots;
- no custom tabBar initially;
- Position DEMOTE;
- Classroom -> Plan;
- News -> Opportunity;
- Profile -> Mine;
- keep business subpages/deep links.

Phase 1 has **not** been authorized/completed as a repo-wide migration.

Since Phase 0, the repository has received additional News/Schedule/UI/ops changes. Before Phase 1, refresh only the affected hot-file/dependency map against current HEAD; do not redo the entire Phase 0 study.

Old broad UI lane remains frozen. Local News/Schedule presentation fixes do not constitute the full Blueprint migration.

## 8. Production / Ops

Infrastructure migration is CLOSED.

Known operational lessons already captured:
- immutable releases;
- service-user readability preflight;
- distinguish liveness/readiness/config presence/provider canary;
- do not restart on one transient DB timeout;
- database cold-connect timeout hardened in repository from 3000 ms to 5000 ms;
- Official Account payloads require utf8mb4.

Do not reopen DNS/NPM/HTTPS/CloudBase migration work.

## 9. Workstream closure decisions

Close / archive these as permanent lanes:
- old Assessment model-selection lane;
- old UI pre-Blueprint lane;
- old ECS migration lane;
- old Official Account authentication lane;
- old Schedule-AI provider-selection lane.

Keep only bounded packages:
- Assessment 502 incident;
- XLS parser production release + exact-file retest;
- News/Schedule final customer acceptance / automatic-sync activation check;
- Commercial production gate when external business/merchant inputs exist;
- Experience Blueprint Phase 1 after hot-file map refresh.

## 10. Source-of-truth order

For current work:
1. this file;
2. 2026-10-05/06 feature-specific incident/closeout files;
3. current code and production evidence;
4. older 2026-10-04 and earlier handoffs for history only.

