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
