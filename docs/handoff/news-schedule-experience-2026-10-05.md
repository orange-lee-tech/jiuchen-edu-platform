# News In-App Reading + Schedule Import Rework — 2026-10-05

Status: **IMPLEMENTED IN CODE / PRODUCTION SCHEMA WRITE NOT YET AUTHORIZED**

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Branch: `p1/foundation`

## Scope

This work addresses two customer-visible defects:

1. Official-account news should be synchronized into the mini-program and read inside
   the mini-program, with administrator-managed tags that can later support
   personalization.
2. Schedule import should stop being an all-or-nothing parser, allow student-side
   temporary editing without teacher approval, and provide a dedicated current-week
   view.

The work does not change Assessment Runtime, payment, tabBar structure or the
production website.

---

# A. Official-account news

## Decision: true in-mini-program reading

The existing backend already calls:

```text
POST /cgi-bin/freepublish/batchget
no_content=0
```

but the integration previously discarded the returned article-body field and kept
only title/digest/cover/original URL.

The new integration persists the body returned by the official-account publishing API
and renders it through a native mini-program `rich-text` detail page.

Resulting path:

```text
Official Account published article
  -> freepublish/batchget
  -> ECS sync
  -> news_posts.content_json
  -> GET /news/:id
  -> pages/news-detail/news-detail
  -> rich-text
```

This is materially different from using `web-view` or
`openOfficialAccountArticle` as the primary reader:
- the reader remains a mini-program page;
- no business-domain dependency is introduced for normal article reading;
- tags and future recommendation metadata remain under Jiuchen control;
- the original service-account URL remains only as a fallback/source link.

## Article HTML normalization

The sync path removes executable/script-like content and normalizes common service-
account lazy-image markup before persistence.

The original article URL is retained for provenance and fallback.

Old rows do not magically gain body content. Re-running the official-account sync after
the schema upgrade backfills the current batch of published articles.

## Collection/tag capability boundary

The published-article payload consumed by the standard `freepublish/batchget` path
contains the article body and publication metadata used here, but it does not expose a
stable Jiuchen-consumable “合集标签” contract in the current integration.

Therefore mini-program tags are intentionally first-class Jiuchen metadata rather than
being guessed from article titles.

## Admin tag management

`news_posts.tags_json` is the canonical app-side tag set.

Mobile admin can:
- add tags;
- replace/edit tags;
- remove individual tags by editing the set;
- clear all tags by saving an empty value.

Contract:
- max 8 tags per article;
- max 24 characters per tag;
- tags are de-duplicated;
- an official-account re-sync updates article content but does **not** overwrite
  admin-managed tags.

The public News page now builds category tabs from real admin tags. Untagged items are
explicitly shown as “未分类”; title-keyword heuristics are removed.

This prepares a clean signal for later per-student recommendation without implementing
an opaque personalization algorithm in this change.

## News schema gate

Two nullable JSON columns are required:

```text
news_posts.content_json
news_posts.tags_json
```

Read-only preflight:

```text
npm --prefix services/api run db:check:news-experience
```

Exact idempotent write candidate:

```text
npm --prefix services/api run db:upgrade:news-experience
```

The write has **not** been executed by this work package.

Deployment order must be:

```text
1. db:check:news-experience
2. explicit human approval
3. db:upgrade:news-experience
4. db:check:news-experience -> PASS
5. deploy backend + mini-program code
6. configure/verify service-account IP whitelist and credentials
7. admin “立即同步最近动态”
8. verify in-mini-program article body + tags
```

Do not deploy the new news backend before the two columns exist; its selected fields
expect the upgraded schema.

---

# B. Schedule import / editing / current week

## Why the previous flow failed too easily

The old spreadsheet parser had several narrow assumptions:
- it read only the first worksheet;
- it searched only the first 12 rows;
- it assumed one column per weekday;
- it treated single Chinese characters such as “一” as weekday matches even inside
  unrelated text;
- it assumed the slot was column 0;
- parsing failure terminated the whole import;
- image import required a configured Schedule AI provider and otherwise hard-failed.

The user then had no correction surface after a partially useful import.

## New spreadsheet parser

The parser now:
- scans multiple worksheets instead of assuming sheet 1;
- searches deeper for weekday headers;
- uses conservative weekday detection;
- understands weekday headers merged across several columns;
- combines grouped weekday columns so common “课程 / 地点” layouts can be read;
- looks for a slot/time column before falling back to the nearest left column;
- skips common second-row subheaders;
- de-duplicates repeated cells;
- retains xlsx/xls/csv support;
- keeps hard size/row/column/course limits.

Tests cover:
- canonical simple spreadsheet;
- cover-sheet + later timetable worksheet;
- merged weekday headers;
- false-positive weekday prevention;
- editable schedule normalization.

## Honest manual fallback

The import no longer presents every layout problem as a fatal failure.

The following recoverable conditions produce an **empty, explicitly marked manual
correction schedule** instead of pretending parsing succeeded:

```text
schedule_ai_provider_not_configured
schedule_weekday_header_not_found
schedule_spreadsheet_invalid
schedule_ai_invalid_payload
```

The UI tells the student that automatic parsing was not reliable and allows direct
course entry.

Hard failures such as oversized/corrupt uploads remain failures.

This avoids both bad behaviors:
- fake parsing;
- complete dead-end when a source format is unfamiliar.

## Student temporary edit semantics

A parsed schedule belongs to the authenticated user. The owner can now directly
update its persisted `parsed_json` through:

```text
PUT /me/classroom/schedule-imports/:id/schedule
```

Ownership is checked server-side.

Editing:
- does not create a plan revision;
- does not require teacher approval;
- immediately becomes the student's current schedule;
- supports add/edit/delete course;
- supports day, slot, weeks, location and teacher;
- records an `editedAt` timestamp inside the persisted schedule payload.

This is deliberately separate from the teacher-approved long-term planning workflow.

## Current-week view

The schedule stores an optional:

```text
termStartDate = first Monday of teaching week 1
```

The mini-program computes the current teaching week from that date and filters each
course's `weeks` expression.

Supported common forms include:
- `1-16周`;
- `1-16周单周`;
- `1-16周双周`;
- comma/listed weeks.

Courses without a weeks value are treated as weekly courses.

Classroom now exposes two distinct actions:

```text
本周课表
导入 / 编辑
```

The schedule page itself has:

```text
本周课表 | 全部课表 | 导入 / 编辑
```

No schema migration is required for this schedule enhancement because
`schedule_imports.parsed_json` already stores the canonical schedule payload.

---

# Production gates

## News

Blocked until the explicit schema write is approved and run.

Also verify the official-account server IP whitelist. A historical failure in this
project was:

```text
40164 invalid ip ... not in whitelist
```

The sync cannot work in production until the ECS egress IP is allowed by the Official
Account.

## Schedule

Code does not require a schema write.

Spreadsheet import can be production-tested after backend deployment.

Image automatic parsing still needs a real `SCHEDULE_AI_*` multimodal provider to
perform automatic image extraction. When it is absent, the product now degrades
truthfully to manual correction rather than failing the entire schedule workflow.

---

# Acceptance checklist

## News

1. `db:check:news-experience` reports the two new columns missing before migration
   (expected on old production).
2. Run only the approved news migration.
3. Re-check PASS.
4. Admin sync succeeds from ECS.
5. A synced article contains body HTML in `GET /news/:id`.
6. Tap an article in the mini-program -> a native detail page opens.
7. Text and service-account images are readable inside the mini-program.
8. Original service-account page is only a fallback/source action.
9. Admin adds 2 tags -> public category tabs update.
10. Admin edits/removes/clears tags -> public view reflects the persisted tag set.
11. Re-sync same article -> tags remain unchanged.

## Schedule

1. Import a simple xlsx.
2. Import the previously failing xls source.
3. Import a workbook whose first sheet is only a cover/description sheet.
4. Import a timetable with merged weekday headers.
5. Edit one recognized course and save.
6. Delete one course.
7. Add one course manually.
8. Leave the page and reopen -> edits persist.
9. Confirm no teacher approval/revision is created.
10. Set first-week Monday and verify “本周课表” filters by the current week.
11. With Schedule AI unconfigured, upload an image -> manual correction mode appears
    instead of a dead-end failure.
12. Once a real multimodal Schedule AI provider is configured, re-test image parsing
    separately.

# Files / lanes

This feature touches:
- Official Account integration;
- News API and mobile admin;
- News mini-program UI;
- news schema migration candidate;
- schedule parser and tests;
- classroom schedule API;
- schedule import/editor UI;
- Classroom entry buttons.

It does not authorize unrelated Blueprint, payment or Assessment changes.
