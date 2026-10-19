# News + Schedule Lane Closeout — 2026-10-05

Status: **CODE CLOSED / PRODUCTION OPERATIONS + REAL-DEVICE ACCEPTANCE PENDING**

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Integration branch: `p1/foundation`  
Code head before this docs-only closeout: `82c1e65ebc59ed360f44cfa4a325186e1e7b3d0c`

## What is complete

The feature implementation is complete and CI has passed at the code head above.

### Official-account news

Implemented:
- service-account published-article sync keeps article body;
- native mini-program article-detail page using `rich-text`;
- original service-account URL retained as provenance/fallback, not the primary reader;
- admin-managed app-side tags;
- public category filtering based on persisted tags rather than title heuristics;
- re-sync preserves admin tags;
- migration/check scripts for the two news columns.

Required news columns:

```text
news_posts.content_json
news_posts.tags_json
```

### Schedule

Implemented:
- multi-sheet spreadsheet parsing;
- broader weekday/header detection;
- merged/grouped weekday-column handling;
- xlsx/xls/csv support;
- honest manual fallback when automatic parsing is unreliable;
- direct owner-side add/edit/delete without teacher approval;
- persistence into `schedule_imports.parsed_json`;
- current-week filtering using `termStartDate` + common week expressions;
- separate “本周课表” and “导入 / 编辑” paths;
- parser regression tests.

No new schedule database column is required.

## Important manual production gate — Official Account IP whitelist

Yes: the Official Account requires the backend caller's public egress IPv4 to be
allowed in the Official Account server IP whitelist before the backend can obtain/use
the required access token reliably.

This is a **manual WeChat Official Account admin action**. It cannot be completed by a
repository commit.

The project has already seen the concrete failure:

```text
40164 invalid ip ... not in whitelist
```

The address to whitelist is the **ECS outbound/egress IPv4**, not blindly whatever
address happens to be used for an SSH session.

Verify the ECS outbound IPv4 from the ECS itself, for example:

```bash
curl -4 -fsS https://api.ipify.org; echo
```

Then add that IPv4 in the Official Account admin console under the developer/basic
configuration area's IP whitelist. UI wording can change, but the target is the
Official Account's server-side IP whitelist, not the mini-program request-domain list.

If the ECS has a directly attached public EIP, the outbound address may equal the SSH
public IP; verify rather than assuming.

## Official Account credentials are a separate gate

The production API also needs:

```text
WECHAT_OA_APP_ID
WECHAT_OA_APP_SECRET
```

in the root-only production environment.

A configured mini-program `WECHAT_APP_ID/SECRET` does **not** satisfy this.
Official Account and mini-program credentials are separate contracts.

After credentials are installed, verify `/health/config` reports:

```text
officialAccountConfigured=true
```

That flag proves presence only. A real admin sync is still the functional acceptance
test.

Never paste the AppSecret into Git, chat, screenshots or shell history.

## Production operations still pending

Do not call the feature production-complete until all of the following are finished.

### News production sequence

1. Verify Official Account AppID/AppSecret are present in production securely.
2. Verify ECS outbound IPv4.
3. Manually add that IPv4 to the Official Account IP whitelist.
4. Prepare the new API release without switching production traffic yet.
5. Run the new read-only `db:check:news-experience` against production.
6. If the two columns are missing, run only the reviewed idempotent
   `db:upgrade:news-experience` migration.
7. Re-run the check and require PASS.
8. Promote the reviewed API release through the existing controlled ECS promotion
   mechanism.
9. Verify `/health/live`, `/health`, and `/health/config`.
10. In the mini-program admin workspace run “立即同步最近动态”.
11. Open one synchronized article and verify native in-app body rendering.
12. Add/edit/remove/clear tags and verify the public News categories update.
13. Re-sync the same article and verify the admin tags remain unchanged.

Do not deploy the new news backend before the two new columns exist, because the new
queries select them.

### Schedule production sequence

1. Deploy the same reviewed backend/mini-program release.
2. Re-test the previously failing real `.xls` file.
3. Test a normal xlsx.
4. Test a workbook where the first sheet is only a cover/description page.
5. Add/edit/delete a course and save.
6. Leave and reopen; edits must persist.
7. Verify no teacher approval/revision is created for schedule edits.
8. Configure the first teaching-week Monday and verify “本周课表”.
9. With no `SCHEDULE_AI_*` provider configured, image upload must enter the honest
   manual-correction path rather than a dead end.
10. If automatic image extraction is required, configure and separately accept a real
    multimodal `SCHEDULE_AI_*` provider.

## What must not be reopened

This lane does not authorize changes to:
- Assessment Runtime;
- Assessment model/provider;
- payment/credit enforcement;
- global Blueprint/navigation except the already-reviewed news-detail page registration;
- unrelated production infrastructure.

## CI evidence

Code head:

```text
82c1e65ebc59ed360f44cfa4a325186e1e7b3d0c
fix: type news category filter
```

Associated latest CI:

```text
Push CI #1212: PASS
PR CI   #1213: PASS
```

The preceding feature commit was:

```text
2d0fb18613a64c6e165ba6790ac2372f54a05d37
feat: add in-app news and editable schedules
```

Its initial CI failed on a News category TypeScript issue; the follow-up commit above
fixed that issue and both CI workflows passed.

## Next-conversation handoff

Start the next conversation from this file plus:

```text
docs/handoff/news-schedule-experience-2026-10-05.md
docs/handoff/assessment-production-incident-2026-10-05.md
docs/reference/operator-common-commands-2026-10-05.md
```

Recommended first task for the next conversation:

```text
Production closeout for News + Schedule:
- verify Official Account credentials and ECS egress-IP whitelist;
- run read-only news schema preflight;
- execute only the approved news migration if required;
- deploy through the existing immutable ECS release mechanism;
- run News + Schedule real-device acceptance;
- do not reopen Assessment Runtime.
```

If the operator has not yet completed the Official Account IP whitelist, that is the
first manual dependency.


---

## 2026-10-05 production-preflight progress update

The following previously pending operational gates are now complete:

- production `WECHAT_OA_APP_ID` / `WECHAT_OA_APP_SECRET`: installed securely;
- `/health/config`: `officialAccountConfigured=true`;
- real WeChat token probe: PASS;
- WeChat-observed ECS outbound IPv4: `121.40.168.181`;
- Official Account server-IP whitelist: effective;
- immutable candidate release prepared:
  `d23f0f128fdb6fec648e6405df672e41734b3ece`;
- candidate API tests: 126 / 126 PASS;
- candidate build: PASS;
- candidate ownership / non-writable-content checks: PASS;
- candidate runtime readability as `jiuchen-api`: PASS;
- candidate Node syntax/access check: PASS.

Production is still intentionally pinned to:

```text
8e5a0ffe7869cd3f6ec8c0a8a876247798b65519
```

No READY marker, approved-release change, promotion or News schema write has occurred.

During this preflight, one active-production `/health` request returned 503 with
`connect ETIMEDOUT` after approximately three seconds. Without restart or
configuration change, public readiness, private readiness and an independent MySQL
`SELECT 1` all passed shortly afterward. This is recorded as a transient database
connection timeout, not a candidate-release failure.

Canonical incident / prevention record:

```text
docs/handoff/production-closeout-incidents-2026-10-05.md
```

Next gate remains:

```text
production read-only db:check:news-experience
```

Do not promote before that schema gate is understood.


---

## 2026-10-05 backend production gate — PASS

Operator evidence confirms the complete backend News production chain now passes.

Completed:

- production News schema columns present;
- `news_posts` converted from `utf8mb3_general_ci` to
  `utf8mb4_unicode_ci`;
- `summary`, `cover_url`, and `article_url` widened to `TEXT`;
- existing row count preserved across the charset/type migration;
- production health remained PASS after the schema repair;
- Official Account sync completed successfully;
- public `GET /news` returned synchronized posts;
- public `GET /news/:id` returned a synchronized `wechat_official` post with
  non-empty persisted body content;
- four-byte Unicode from the Official Account payload is now accepted.

Production API release remains the already-promoted News + Schedule runtime:

```text
d23f0f128fdb6fec648e6405df672e41734b3ece
```

Repository hardening after the production incident is newer than that runtime release.
The latest hardening HEAD at this checkpoint is:

```text
17ac70ad5a36ca0b31eb2e0d5a057ac32a26a5b0
```

Its Push CI #1232 and PR CI #1233 both PASS.

These later changes harden future schema creation/check/migration behavior; they are not
required to prove the already-running News read/sync path, which has passed against the
repaired production schema.

### Remaining gate

Backend News production gate is **PASS**.

The lane is not fully customer-closed until the mini-program package containing the
News detail page and Schedule UX is built/uploaded and the following real-device checks
pass:

- News list -> native article detail -> body render;
- admin tag add/edit/remove/clear;
- re-sync preserves admin tags;
- real xls/xlsx schedule import;
- manual add/edit/delete and persistence;
- current-week view;
- image-import manual fallback when Schedule AI is not configured.


---

## 2026-10-06 Schedule AI configuration + real XLS diagnosis

Production Schedule AI configuration now has direct provider evidence:

- provider: qianwen-maas;
- base URL: existing production Qianwen-compatible endpoint;
- model: qwen3-vl-plus;
- real multimodal probe: HTTP 200;
- model correctly described the test image;
- production env remains root:root mode 0600;
- /health/config reports scheduleAiConfigured=true;
- Assessment AI remains configured.

A first /health call immediately after service restart again returned 503 while
/health/live and /health/config were healthy. This matches the previously recorded
post-restart cold DB connection pattern. Repository hardening increases the bounded DB
connect timeout from 3000 ms to 5000 ms in commit
38fb1480b5a076d23a2042bb5c33f609141db8c6.

### Real CSU/WPS XLS root cause

The operator-provided real WPS .xls fixture was inspected. Its structure is regular and
should be handled deterministically rather than delegated to AI.

The original parser failed for multiple concrete reasons:

1. clock rows such as 08:00 were parsed as section numbers 8 and 0, producing an
   invalid endSection=0 and causing canonical validation failure;
2. week expressions such as 3-8[周], 12-15[周], and 2-4,8-20[双周] were not recognized;
3. room forms such as 科教北203 and C座502 were not consistently recognized;
4. a split teacher/week form such as
   哈纳提·吐尔森哈力 + (讲师)3,5[周] needed joining rather than treating the title/week
   fragment as the teacher itself.

Repository fixes:

- 5c53a329c99582f86f5d742e5cb1e8200f47cf76
  fix: parse WPS timetable clock rows
- bfc133826ef0f6633b6b708f8c615ccb2491f9af
  test: cover CSU WPS timetable import

The regression test mirrors the real CSU/WPS layout with merged weekday headers,
clock-based rows, bracketed week expressions, Chinese building-room strings and the
split teacher/title/week case.

Do not re-test the real XLS against production until these commits are included in a
new backend release; the currently active runtime predates them.
