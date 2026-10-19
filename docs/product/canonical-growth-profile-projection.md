# Canonical Student Profile / Growth Record projection

Status: **P0/P1 foundation implemented; production schema gate required for new growth records**

## Decision

The system does **not** create a resume-specific biography database.

Canonical sources are:

- `user_profiles`: university, major, current grade, GPA/average and rank;
- `students` / `users`: canonical display identity where available;
- existing business sources such as Assessment and Classroom remain source records;
- `growth_records`: only facts that do not already have an appropriate canonical table, such as confirmed language, research, publication, competition, project, internship, campus/leadership, award and skill records.

Resume and application data are projections only.

## Assessment bridge

Current Assessment forms already contain user-entered language, research and competition facts.

They are **not** silently promoted into Canonical Profile.

Flow:

```text
Assessment input_json
-> POST /me/growth-records/assessment-preview
-> deterministic candidates
-> user selects/confirms candidateKeys
-> POST /me/growth-records/import-assessment
-> growth_records
```

The import uses a stable source key:

`assessment:<assessmentId>:<candidateKey>`

Re-confirming the same source updates the same canonical record instead of creating duplicates.

## Traceability

Every growth record keeps:

- source type;
- source record ID;
- stable source key;
- evidence JSON;
- last updated time;
- user / teacher / admin confirmation state.

Every resume entry returns `sourceRefs`.

## Projection APIs

### GET /growth-profile/meta

Returns supported record types, projection targets, application schemas and the AI policy.

### GET /me/growth-profile

Returns canonical identity + confirmed active growth records.

If the new growth table has not been migrated yet, the endpoint still returns the existing base profile with `growthSchemaReady=false`.

### POST /me/resume-projection

Body:

```json
{
  "target": "general | technical | academic",
  "language": "zh-CN",
  "length": "one-page | detailed"
}
```

The current projection is deterministic and Chinese-only. No model call is required. English resume wording is intentionally deferred until a bounded expression-adaptation step with user confirmation exists.

### POST /me/application-projection

MVP supports `generic-recruitment-v1`.

Every output field is one of:

- `matched`;
- `needs_confirmation`;
- `missing`.

This JSON is the stable hand-off surface for future browser/desktop recruitment-site adapters.

## AI boundary and token policy

No AI call is made for:

- reading Canonical Profile;
- normal resume projection;
- generic recruitment form mapping;
- repeated reuse of already-confirmed experiences.

Reserved future AI entry points only:

1. natural-language experience parsing before user confirmation;
2. JD analysis / relevance reranking;
3. bounded long-text adaptation.

AI output must never write directly into canonical facts without an explicit user-confirmation step.

## Safety boundary for future adapters

The future Adapter contract consumes Application Projection JSON. It must not:

- store recruitment-site passwords;
- bypass captcha or anti-bot controls;
- submit applications automatically;
- send sensitive data before the user approves the mapped fields.

Expected Human Gate:

`mapped / needs confirmation / missing -> user review -> user submits`.

## Production gate

This batch adds `db:upgrade:growth-profile` but does not authorize or execute it against production.
