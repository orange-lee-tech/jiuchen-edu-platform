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
