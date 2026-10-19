# Assessment Production Incident Log — 2026-10-05

Status: **CLOSED — runtime restored and real-device persisted-result acceptance PASS**

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Integration branch: `p1/foundation`  
Production release during incident: `8e5a0ffe7869cd3f6ec8c0a8a876247798b65519`

## Why this log exists

This incident exposed two different production configuration failures in the same
Assessment path. The first was a real provider endpoint mismatch. The second was an
operator-editing error introduced while repairing the first problem.

This document is the durable non-secret incident record. It also corrects the
provider/Base URL assumptions recorded in the 2026-10-04 Assessment handoff.

No API key, private case content, database credential, SSH material or other secret is
stored here.

## Customer-visible symptom

Real-device Assessment testing reached the production API successfully, created the
draft row, but the model run returned HTTP 502. After that failure the mini-program
attempted to update the same Assessment row and received HTTP 409.

Observed sequence:

1. `POST /me/assessments` -> HTTP 201.
2. `POST /me/assessments/<id>/run` -> HTTP 502.
3. the failed Assessment changed out of editable `draft` state;
4. a later `PUT /me/assessments/<same-id>` -> HTTP 409.

The 409 was therefore a downstream state consequence, not the primary failure.

Do not reuse a failed Assessment row when retesting. Create a fresh draft.

## Root cause A — provider credential was paired with the wrong API host

The production credential in use was a Qianwen AI Platform pay-as-you-go
`sk-ws-...` key.

The production configuration had paired that key with the historical DashScope host:

```text
https://dashscope.aliyuncs.com/compatible-mode/v1
```

That pairing returned provider HTTP 401.

The correct non-secret production API host for the key actually in use is:

```text
https://maas.qianwenaiapi.com/compatible-mode/v1
```

The corrected Assessment configuration is:

```text
ASSESSMENT_AI_PROVIDER=qianwen-maas
ASSESSMENT_AI_BASE_URL=https://maas.qianwenaiapi.com/compatible-mode/v1
ASSESSMENT_AI_MODEL=qwen3.8-flash
ASSESSMENT_AI_TEMPERATURE=0
ASSESSMENT_AI_JSON_MODE=true
ASSESSMENT_AI_RESPONSE_FORMAT=json_schema
ASSESSMENT_AI_EXTRA_BODY_JSON={"enable_thinking":false}
```

The API key remains secret and must not be committed.

A direct ECS provider probe using the corrected host, `qwen3.8-flash`,
non-thinking mode and strict JSON Schema returned:

```text
HTTP: 200
MODEL: qwen3.8-flash
CONTENT: {"ok":"PASS"}
```

This proved that the key itself had not randomly expired and that VPN state on the
operator workstation was not the production failure mechanism.

### Provider documentation correction

The 2026-10-04 documents use `aliyun-bailian` / DashScope terminology because that
was the believed provider contract at the time. For the production credential
actually deployed on 2026-10-05, this incident log supersedes those provider/Base URL
values.

Do not switch the host back to DashScope merely because an older handoff contains the
old value.

## Root cause B — malformed production environment line forced development mode

During manual recovery editing, the first line of
`/etc/jiuchen-api/production.env` became:

```text
/ASSESSMENT_AI_PROVIDERNODE_ENV="production"
```

systemd correctly rejected that assignment:

```text
Ignoring invalid environment assignment '/ASSESSMENT_AI_PROVIDERNODE_ENV=production'
```

Because the valid `NODE_ENV=production` assignment was absent, the API loaded the
schema default:

```text
NODE_ENV=development
```

The Assessment runtime chooses its case-knowledge mode from `NODE_ENV`. Development
mode selected the eval-safe corpus and attempted to open:

```text
.../rag_reference_eval_safe_train_dev.jsonl
```

That file is intentionally not installed on production, so the real-device run failed
before calling the model with:

```text
assessment_case_data_unavailable
ENOENT
```

The production corpus was still present at the intended shared location:

```text
/opt/jiuchen-api/shared/cases/ai/rag/v1.0.0/rag_reference_production_all.jsonl
```

The production environment therefore requires both:

```text
NODE_ENV=production
ASSESSMENT_CASE_DATA_ROOT=/opt/jiuchen-api/shared/cases
```

The shared corpus must remain outside immutable release directories so rollbacks do
not duplicate or delete it.

## Independent observation — transient database health timeout

During the same maintenance window, one `GET /health` returned HTTP 503 with
`connect ETIMEDOUT`. Immediately surrounding routes later returned successfully,
including `/products`, WeChat bootstrap, `/me/profile` and
`/assessments/meta`.

Treat that timeout as a separate database-connectivity observation. It was not the
cause of the Assessment 502 described above and should not be mixed into the provider
incident unless it becomes repeatable.

## What the successful device retest established

After correcting the provider host and production runtime configuration, the operator
reported that the mini-program reached the Assessment Result page. The new console
paste contained only framework/performance warnings and the result-page long-text
hint; it did not show the earlier Assessment `/run` 502.

This is strong evidence that the real-device production model path is restored.

However, do not rewrite historical evidence. At the time this log was created, the
operator had not yet supplied the final explicit observation that:

1. the succeeded Assessment is reopened from History; and
2. reopening renders persisted output without a second model call.

Therefore the full six-step Assessment Production Gate should be marked PASS only
after that final persisted-result reuse check is recorded.

## Readiness gap exposed by this incident

The following endpoints were never sufficient proof that the provider was usable:

```text
/health/config -> assessmentAiConfigured=true
/assessments/meta -> providerConfigured=true
```

Those flags verify configuration presence, not remote authentication or a successful
model call.

Future readiness should distinguish at least:

```text
configured     = required values are present
authenticated  = provider accepted the credential
ready          = bounded real provider canary succeeded
```

A 401/403 should fail immediately and should not be retried as a transient model
error.

## Permanent operating controls

For every production AI credential, record the following tuple together in the
operator's private configuration ledger:

```text
Provider / platform
Billing plan or key type
Key identifier or secret location
Base URL / API host
Model
Runtime options
Workload
Last verified date
```

Never store the API key itself in Git.

Before restarting `jiuchen-api.service` after an env edit:

1. back up `/etc/jiuchen-api/production.env`;
2. verify `NODE_ENV=production`;
3. verify the non-secret Assessment provider fields;
4. verify `ASSESSMENT_CASE_DATA_ROOT=/opt/jiuchen-api/shared/cases`;
5. verify the production RAG file is readable;
6. run a bounded provider probe without printing the key;
7. restart only `jiuchen-api.service`;
8. inspect the actual process environment;
9. verify `/health/live`, `/health`, `/health/config` and
   `/assessments/meta`;
10. use a fresh Assessment row for the real-device run.

After a manual env edit, always inspect recent systemd logs for
`Ignoring invalid environment assignment`.

## UX/backend follow-up revealed by the incident

A failed run leaves the Assessment row in `failed` state while the form may still
hold the old Assessment ID. A subsequent save then receives 409.

That behavior is internally consistent but confusing to the user. A future bounded
product fix should make the failed state explicit and offer a safe retry/new-draft
path rather than presenting the resulting save error as if draft persistence were
broken.

Do not change this behavior during an incident unless separately authorized.

## Related durable references

- `docs/handoff/assessment-production-gate-2026-10-04.md`
- `docs/handoff/ai-runtime-worklog-2026-10-04.md`
- `docs/handoff/lane-b-production-handoff-2026-10-02.md`
- `docs/reference/operator-common-commands-2026-10-05.md`

## Closeout rule

Assessment Runtime remains frozen except for a bug directly revealed by the
real-device acceptance chain.

Once History successfully reopens the same succeeded Assessment without a second
model call, record the Production Gate as PASS and close this incident operationally.


## Final incident closure — 2026-10-05

The operator completed the remaining cross-device persistence check after the runtime
repair:

- Assessment completed successfully on the computer;
- the operator then signed into the mini-program on a phone;
- Assessment History contained the completed Assessment;
- opening the persisted result on the phone rendered the existing result;
- no second model call occurred.

The Assessment Production Gate is therefore PASS and this incident is operationally
closed.

The report-quality observations made during that acceptance are product improvements,
not unresolved incident defects. They are tracked in:
`docs/product/assessment-report-experience-v2-2026-10-05.md`.
