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



## 11. Priority update — 2026-10-06 evening sprint

The Assessment 502 incident is now CLOSED.

Production hotfix:
`34892d8c44052d955224b1e1882cde34a73a53f7`

Real experience-build evidence:
- fresh Assessment completed;
- `POST /me/assessments/:id/run` returned HTTP 200;
- runtime was approximately 54 seconds;
- no new 502 / execution-failed record in the acceptance window;
- user-visible result rendered successfully.

The incident closeout is:
`docs/handoff/assessment-502-production-incident-closeout-2026-10-06.md`

### Active sprint focus

Primary effort now moves to:

1. **non-blocking Assessment execution UX**
   - submission must not trap the user on a loading page for the full model runtime;
   - History is the reliable in-app completion/status surface;
   - WeChat subscription-message notification is an enhancement/follow-up once the approved template contract is available;
   - do not reopen model selection, Prompt, RAG or benchmark work.

2. **notification / operations mechanism**
   - Assessment completion notification;
   - new Official Account posts that remain unclassified must surface an in-app pending-classification signal to staff who are allowed to act;
   - WeChat subscription messages augment, but do not replace, reliable in-app state.

3. **Schedule final closure**
   - ship the reviewed real-XLS parser fixes;
   - re-test the exact real WPS/CSU file;
   - preserve import/edit as the primary Schedule action;
   - “current week” remains a secondary convenience view and must not displace import/edit.

4. **News final closure**
   - confirm automatic sync is actually active in production;
   - confirm article detail, cover/media, server tags and re-sync tag preservation;
   - close the unclassified-content operations loop.

### Candidate priority after the active sprint

If the active sprint passes, the next candidate order is:

1. **Experience Blueprint / full-site UI and UX consolidation** — highest candidate priority.
2. **Customer AI Lite** — FAQ/RAG-first, low-cost model, human handoff remains guaranteed.
3. **Product Knowledge operationalization** — promote only when live content operations need DB-backed editing/import rather than bundled fallback.
4. **Opportunity deterministic personalization** — only after real tags/deadlines/profile signals exist.
5. **Admin operational-efficiency improvements** — batch tagging/assignment/search based on real operator pain.
6. **Commercial productionization / real WeChat Pay** — intentionally lower priority until business pricing/free-grant decisions and merchant materials are ready.
7. **AI fine-tuning** — only if real production error patterns prove RAG/Prompt/Schema insufficient.
8. **Custom TabBar** — only if native four-slot role-aware navigation is proven insufficient.
9. **Current-week Schedule embellishment** — lowest priority; it is only a convenience view after reliable import/edit.

This priority order intentionally favors customer-visible product quality and delivery over premature monetization mechanics or low-value convenience features.
