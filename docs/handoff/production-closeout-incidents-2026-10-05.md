# Production Closeout Incident / Lessons — 2026-10-05

Status: **RECORDED / NO PRODUCTION CODE CHANGE REQUIRED**

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Branch: `p1/foundation`

## Scope

This note records operational issues observed while preparing the News + Schedule
production release. It is intentionally evidence-based: confirmed facts are separated
from hypotheses, and no transient symptom is treated as a root cause without proof.

## 1. Official Account configuration / whitelist sequence

Observed sequence:

1. Production initially had no `WECHAT_OA_APP_ID` / `WECHAT_OA_APP_SECRET`.
2. The first manual env-write attempt failed before writing because the interactive
   shell did not contain `OA_APP_SECRET`.
3. A subsequent helper script used the wrong source variable names
   (`WECHAT_OA_*` instead of the already-loaded `OA_*`) and safely stopped with an
   empty-value error before writing.
4. Correct values were then written to the root-owned production env.
5. `/health/config` reported `officialAccountConfigured=true`.
6. A real WeChat token probe returned:
   `40164 invalid ip 121.40.168.181 ... not in whitelist`.
7. The operator added `121.40.168.181` to the Official Account server IP whitelist.
8. A later identical token probe returned:
   `TOKEN_OK` and `OFFICIAL_ACCOUNT_READY=true`.

Conclusion:

- the real outbound IPv4 observed by WeChat is `121.40.168.181`;
- the Official Account credentials are accepted;
- the WeChat API is reachable from ECS;
- the server-IP whitelist is now effective;
- the brief period where 40164 persisted after the operator saved the whitelist is
  consistent with propagation/confirmation delay, but the exact propagation mechanism
  was not independently proven.

Operational lesson:

- do not infer the outbound IP from SSH addressing or a third-party IP service;
- when credentials exist, use the actual WeChat token endpoint as the authoritative
  observer of the IP WeChat sees;
- treat `officialAccountConfigured=true` as presence only, not functional acceptance;
- require a real token probe before declaring the Official Account integration ready;
- for interactive secret entry, run one prompt at a time and validate only presence /
  length before writing; never multi-paste prompts and commands into the same shell.

## 2. Immutable candidate release preparation

Candidate release:

```text
d23f0f128fdb6fec648e6405df672e41734b3ece
```

Observed candidate preparation:

- GitHub Push CI #1214: PASS;
- GitHub PR CI #1215: PASS;
- ECS API tests: 126 / 126 PASS;
- API build: PASS;
- `dist/server.js`: present;
- release ownership: root:root;
- no real group/world-writable files detected;
- service-user traverse check: PASS;
- service-user read check: PASS;
- service-user Node syntax/access check: PASS;
- `COMMIT_SHA` marker: matches candidate SHA.

The release was placed at:

```text
/opt/jiuchen-api/releases/d23f0f128fdb6fec648e6405df672e41734b3ece
```

Production remained on:

```text
8e5a0ffe7869cd3f6ec8c0a8a876247798b65519
```

No READY marker, approved-release change, promote, or database write had occurred at
this checkpoint.

## 3. Transient production database-readiness timeout

During the candidate-preparation checkpoint, the active production service returned:

- `/health/live`: HTTP 200;
- one `/health` request: HTTP 503.

The active release had **not** been changed. Logs for the 503 showed:

```text
connect ETIMEDOUT
responseTime ~= 3009 ms
```

The running database pool uses a 3000 ms connection timeout.

Follow-up evidence, without restart or configuration change:

- public `https://api.jiuchenedu.com/health`: HTTP 200, database=ok;
- direct `http://172.25.80.203:3100/health`: HTTP 200, database=ok;
- direct independent MySQL `SELECT 1`: `DB_DIRECT_OK { ok: 1 }`;
- another public health check: HTTP 200;
- recovered health latency was approximately 190–277 ms.

Conclusion:

**This event is classified as a transient database connection timeout, not a persistent
database outage and not a candidate-release failure.**

The exact underlying cause of the one timed-out connection was not proven. Do not
invent one. It could have occurred anywhere along the production database connection
path.

No restart, DB change, NPM change, network change or rollback was required.

## 4. Release-gate rule added by this incident

A single readiness 503 must pause promotion/migration, but it must not trigger immediate
configuration edits or service restarts.

Use this order:

```text
1. /health/live
2. /health with response body preserved (do not hide 503 body with curl -f)
3. direct private-listener /health
4. journalctl around the exact request
5. independent DB SELECT 1 when database connectivity is implicated
6. repeat public readiness
7. classify persistent vs transient
8. only then decide whether intervention is justified
```

Interpretation:

- liveness 200 + one readiness ETIMEDOUT + subsequent readiness 200 + direct DB probe
  PASS = transient dependency failure; record it and continue cautiously;
- repeated readiness failures or direct DB failure = production incident; stop release
  work until the dependency is restored;
- a candidate release cannot be blamed for a health failure that occurred while
  `current` still points to the previous release.

## 5. Prevention / process hardening

For future production release work:

- freeze and print the intended candidate SHA before packaging;
- verify GitHub CI for that exact SHA;
- do not infer SSH authentication mode: `jiuchen-deploy` is key-based and its
  password path is intentionally unavailable;
- verify the candidate as the real `jiuchen-api` service user before promotion;
- never promote while readiness is actively failing;
- preserve error response bodies and timestamps;
- distinguish **liveness**, **readiness**, **config presence**, and **real external
  provider probes**;
- require two layers of evidence before changing production configuration after a
  transient failure;
- do not restart a healthy service merely to clear one dependency timeout;
- record transient failures even when they self-recover, because recurrence frequency
  is operational evidence.

## 6. Current gate after this incident

At the end of this record:

- active production release remains `8e5a0ffe7869cd3f6ec8c0a8a876247798b65519`;
- candidate release `d23f0f128fdb6fec648e6405df672e41734b3ece` is built and
  permission-validated;
- public and direct readiness are healthy;
- independent DB probe is healthy;
- Official Account token probe is healthy;
- production News schema preflight is the next gate;
- no production schema write is authorized merely by this incident record.


## 7. Official Account first-sync charset failure

After the News schema columns were added and the new API release was promoted, the
first real Official Account sync reached WeChat successfully and returned published
article data, but the first insert into `news_posts` failed.

Observed database error:

```text
ER_TRUNCATED_WRONG_VALUE_FOR_FIELD
Incorrect string value: '\xF0\x9F\x93\x8C ...' for column 'summary'
```

The rejected bytes begin with a four-byte UTF-8 emoji (for example `📌`).

Important classification:

- WeChat credential / IP whitelist: PASS;
- Official Account fetch: PASS;
- article payload acquisition: PASS;
- new `content_json` / `tags_json` columns: present;
- production release activation: PASS;
- database persistence of article text containing four-byte Unicode: FAIL.

This is therefore **not** an Official Account API failure. It is a production schema
character-set compatibility defect in the existing `news_posts` text columns/table.

The original `news_posts` creation SQL inherited the database/server default charset
because it did not explicitly declare `utf8mb4`. The production failure proves that at
least `summary` cannot currently persist four-byte Unicode.

Repository hardening was added in commit:

```text
85851d926ee080bbcfe57f2befc528bae32b6420
fix: support utf8mb4 official account news
```

Hardening includes:

- News schema checker now reports table collation and text-column character sets;
- News upgrade candidate can convert `news_posts` to
  `utf8mb4 / utf8mb4_unicode_ci`;
- fresh identity-v2 creation explicitly creates `news_posts` as utf8mb4.

Operational rule:

Do not strip emoji or silently sanitize valid Unicode to work around a database charset
defect. Preserve source content and repair the schema contract instead.

Before the production charset write, inspect `information_schema` read-only and review
the exact `ALTER TABLE ... CONVERT TO CHARACTER SET utf8mb4` candidate.


## 9. Official Account sync incident — RESOLVED

The production schema inspection confirmed the whole `news_posts` table was
`utf8mb3_general_ci`, including the text/enum columns. The existing table contained
7 rows.

The repair was executed with a pre-change backup and post-change row-count check:

- `summary` -> TEXT;
- `cover_url` -> TEXT;
- `article_url` -> TEXT;
- table/character columns -> `utf8mb4_unicode_ci`;
- row count remained unchanged;
- production health passed after migration.

The Official Account sync was then retried and completed successfully. Production
list/detail verification found synchronized `wechat_official` content with a non-empty
persisted article body.

Final classification:

**RESOLVED — schema contract defect fixed; Official Account backend production path
PASS.**

Preventive lesson:

When a real external payload violates one persistence constraint, review the entire
payload-to-schema contract before retrying. In this incident, the first visible failure
was four-byte Unicode on an utf8mb3 column, while the same payload also demonstrated
that the historical `summary varchar(500)` contract was too narrow. Future preflight
must consider charset, lengths, nullability and indexed-key limits together.


## 10. Repeated post-restart DB connect timeout — hardening action

After enabling Schedule AI and restarting only `jiuchen-api.service`, the same pattern
recurred:

- service active;
- `/health/live`: PASS;
- `/health/config`: PASS with `scheduleAiConfigured=true`;
- first `/health`: 503;
- prior incident evidence already showed `connect ETIMEDOUT` at the 3000 ms database
  connect timeout and recovery without intervention.

Because this is now a repeated post-restart pattern rather than a one-off observation,
the repository database client timeout is hardened from 3000 ms to 5000 ms. This does
not change the database endpoint, pool size, credentials or health semantics; it only
gives a cold TCP/MySQL handshake a slightly larger bounded window.

Operational rule:

- do not restart repeatedly to clear this symptom;
- if liveness/config are healthy, retry readiness and inspect the exact error;
- persistent failure after the wider timeout remains a real dependency incident and
  must not be masked.
