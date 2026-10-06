# Assessment 502 Production Incident Closeout — 2026-10-06

Status: **CLOSED**

## Incident

Production release at incident start:

`d23f0f128fdb6fec648e6405df672e41734b3ece`

Real-device evidence:

- fresh assessment create: accepted
- `POST /me/assessments/fba90417-4412-43c2-8d7d-2b5c2cd6e60b/run`
- HTTP 502
- production `/health/live`: PASS
- production `/health`: database=ok

This was treated as a production regression. Model benchmarking, model changes, prompt optimization, RAG overhaul, payment, news, schedule and UI work were explicitly out of scope.

## Root cause

Production journal captured the direct failure:

`AssessmentEvidenceReferenceError: target_assessment_requires_retrieved_evidence`

The request reached Assessment runtime and failed during result evidence validation.

The runtime contract contained a contradiction:

1. the model contract explicitly allowed a target to return `tier=insufficient_data` when retrieved evidence was not sufficient;
2. the validator nevertheless required every target assessment, including `insufficient_data`, to reference at least one retrieved `school/program/case` evidence item.

When the model conservatively refused to cite unrelated retrieved cases and returned an evidence-safe insufficient-data result, the validator converted that safe behavior into an HTTP 502.

The incident was **not** caused by:

- provider base URL regression;
- `NODE_ENV` fallback;
- missing production RAG corpus;
- database availability;
- credit/payment lifecycle;
- model replacement.

Verified runtime environment during diagnosis:

- `NODE_ENV=production`
- provider `qianwen-maas`
- model `qwen3.8-flash`
- response format `json_schema`
- production case root `/opt/jiuchen-api/shared/cases`
- production RAG corpus readable

## Minimal fix

For `targetAssessments`:

- `reach`, `match`, and `conservative` still require real retrieved target evidence;
- `insufficient_data` may pass without retrieved target evidence, while all supplied evidence refs must still be valid input or retrieved refs;
- invented evidence refs remain rejected.

No model, provider, prompt, retrieval corpus, payment, news, schedule, navigation or UI behavior was changed.

Integration-branch commit:

`5744e276fa71a812406e249df1bdf9270445ed75`

Because `p1/foundation` contained unrelated post-production API changes, production was not promoted from that branch head.

A dedicated hotfix was cut directly from the active production baseline:

- base: `d23f0f128fdb6fec648e6405df672e41734b3ece`
- hotfix: `34892d8c44052d955224b1e1882cde34a73a53f7`
- delta: 1 commit / 2 files
  - `services/api/src/services/assessment-runtime.ts`
  - `services/api/src/services/assessment-runtime.test.ts`

## Verification

GitHub Actions hotfix CI run #1287: **PASS**

API gate:

- typecheck: PASS
- tests: 127 PASS / 0 FAIL
- build: PASS

The immutable ECS release was built again on the production host and passed the same typecheck/test/build gate.

A release-permission preflight initially blocked because the new immutable release inherited `750/640` permissions that prevented the `jiuchen-api` service user from traversing/reading the runtime artifact. No production switch had occurred at that point.

Permissions were corrected to preserve:

- root ownership;
- no group/world write access;
- service-user read/traverse access.

The controlled `jiuchen-promote` path then passed and activated:

`34892d8c44052d955224b1e1882cde34a73a53f7`

Rollback target:

`d23f0f128fdb6fec648e6405df672e41734b3ece`

Post-promote health/service gates passed.

## Real-device acceptance

Acceptance used the uploaded **WeChat experience version**, not only a local Developer Tools preview.

A fresh assessment was created after the hotfix:

`06f63335-4e26-43ab-846b-18001e1ea6c4`

Production journal:

- `POST /me/assessments`: received
- `POST /me/assessments/06f63335-4e26-43ab-846b-18001e1ea6c4/run`
- result: HTTP 200
- runtime: approximately 53.98 s
- no new `Assessment execution failed`
- no new HTTP 502 in the acceptance window

User-facing experience-version result: **normal / PASS**

## Final state

**Assessment 502 Production Incident: CLOSED**

Do not reopen this incident for general Assessment quality work. Any future model quality, latency, retrieval quality or UX improvements require a separate scoped task.
