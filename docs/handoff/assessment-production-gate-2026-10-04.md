# Assessment Production Gate — 2026-10-04

Status: READY FOR READ-ONLY PRODUCTION PREFLIGHT

Repository: orange-lee-tech/jiuchen-edu-platform
Branch: p1/foundation

## Strategic objective

Close exactly one customer-visible path:

WeChat real device -> fill/save Assessment input -> ECS API -> qwen3.8-flash strict-schema runtime -> persist assessments row -> open result -> reopen from history.

Nothing in this gate authorizes work on Customer AI, User AI Profile, Classroom, Product Knowledge database migration, payment, the existing website, NPM, DNS, Harbor, Portainer or unrelated production services.

## Accepted AI runtime contract

- provider: Alibaba Bailian
- model: qwen3.8-flash
- mode: non-thinking
- temperature: 0
- response format: json_schema
- strict: true
- downstream validation: Zod + evidence validation
- repair: at most one bounded repair
- model selection: CLOSED / ACCEPT

Required production env names:

- ASSESSMENT_AI_PROVIDER=aliyun-bailian
- ASSESSMENT_AI_BASE_URL=<approved Bailian OpenAI-compatible endpoint>
- ASSESSMENT_AI_API_KEY=<secret; never print or commit>
- ASSESSMENT_AI_MODEL=qwen3.8-flash
- ASSESSMENT_AI_TEMPERATURE=0
- ASSESSMENT_AI_RESPONSE_FORMAT=json_schema
- ASSESSMENT_AI_EXTRA_BODY_JSON={"enable_thinking":false}
- ASSESSMENT_CASE_DATA_ROOT=/opt/jiuchen-api/shared/cases

Production case corpus required path:
/opt/jiuchen-api/shared/cases/ai/rag/v1.0.0/rag_reference_production_all.jsonl

The corpus is private production data and must never enter Git.

## Product Knowledge database is not part of this gate

Assessment currently uses the private production case JSONL plus bundled governed product-handbook evidence. Therefore missing product_knowledge_documents / product_knowledge_chunks do not block this Assessment gate. Do not batch db:upgrade:product-knowledge into this change.

## Gate 1 — read-only schema preflight

Run the repository command:

npm --prefix services/api run db:check:assessment

This command reads information_schema only. It reports table presence, expected column count, index names, user foreign-key readiness and non-secret shape issues.

Previous production evidence predicts: missing_table:assessments.

If the preflight instead reports a partially present or drifted table, STOP. Do not run the migration until the shape is reconciled.

## Gate 2 — only schema write candidate

The exact feature migration is:

npm --prefix services/api run db:upgrade:assessment

It creates only assessments when absent and then verifies the complete contract.

Per production guardrails, execute this write only after explicit human approval of this exact migration based on Gate 1 output.

Immediately rerun:

npm --prefix services/api run db:check:assessment

Required result: ok=true and zero issues.

## Gate 3 — runtime placement

Production env remains root-owned mode 0600. Never print secret values. Presence checks may print booleans only.

The production case corpus belongs under /opt/jiuchen-api/shared/cases, outside immutable release directories, so rollback does not remove or duplicate it.

## Gate 4 — immutable backend release

Use the existing discipline:

candidate/staging -> verify -> releases/<SHA> -> approved-release -> promote -> health

Do not mutate the active release in place.

After promotion verify:
- /health/live = 200
- /health keeps database=ok
- /health/config reports assessmentAiConfigured=true
- /assessments/meta reports providerConfigured=true

Rollback to the previous release if post-promotion health fails.

## Gate 5 — real-device acceptance

Use one test account:

1. Open Assessment form.
2. Fill required profile and at least one target.
3. Save draft.
4. Leave and reopen through Assessment History; draft remains readable.
5. Run real AI assessment.
6. Result page opens and displays the structured report.
7. Confirm persisted model metadata is qwen3.8-flash.
8. Return to History.
9. Reopen the same succeeded assessment.
10. Confirm output/evidence are persisted and reopening does not trigger a second model call.

Acceptance record format:
page -> action -> expected -> actual -> screenshot/result

## Stop conditions

Stop if:
- schema checker reports drift rather than a clean missing table;
- migration affects any table other than assessments;
- production case corpus is unavailable;
- assessmentAiConfigured=false;
- public API health regresses;
- login/profile flow regresses;
- real AI call returns 5xx or invalid output;
- result succeeds but cannot be reopened from history.

Never touch the existing website, NPM, DNS, ports 80/443/8088, Harbor, Portainer, Docker networks or /www/wwwroot/jiuchen-current.
## Fresh SSH session note

The production Node runtime is intentionally isolated from the default jiuchen-deploy shell PATH.

Production service path: /opt/jiuchen-api/runtime/node/bin/node
Current versioned runtime: /opt/jiuchen-api/runtime/node-v22.23.3-linux-x64/

A fresh jiuchen-deploy SSH session may report node/npm as not found. This is expected and is not a reason to install or replace system Node.

For candidate validation, first inspect /opt/jiuchen-api/runtime/node and its bin directory, then use that existing Jiuchen-owned runtime in the current shell only.
## Production schema preflight result

Read-only production inspection completed on 2026-10-04.

Result:
- assessments table: absent
- columnCount: 0
- indexes: none
- user foreign key: absent because the table does not exist
- issues: missing_table:assessments

Interpretation:
- this is a clean missing-table state;
- no partial/drifted assessments schema was detected;
- no reconciliation or destructive repair is required;
- the only schema write candidate remains db:upgrade:assessment;
- after the write, db:check:assessment must return ok=true with zero issues.
## Schema verifier incident during approved migration

The approved db:upgrade:assessment run created the assessments table successfully, but the first post-create contract verification falsely reported every column/index/FK as missing while simultaneously reporting table exists=true and columnCount=18.

Root cause: the checker relied on information_schema result property names without explicit SQL aliases. The production MySQL/mysql2 result field names did not match those JavaScript property names, yielding undefined metadata values.

Safety conclusion:
- do not drop or recreate the table;
- do not rerun the migration merely because of this verifier failure;
- fix the read-only metadata mapping and re-run db:check:assessment;
- only accept the schema gate after the corrected checker returns zero issues.
## Assessment schema gate — PASS

Production read-only metadata inspection after the approved migration confirmed the final shape:
- 18 expected columns present with matching data types/nullability;
- PRIMARY(id);
- assessments_user_id_idx(user_id);
- assessments_status_idx(status);
- user_id foreign key references users(id).

Conclusion:
- production assessments table creation succeeded;
- prior verifier failure was a checker metadata-mapping bug, not schema failure;
- no rerun, drop, recreate or repair migration is required;
- Assessment Schema Gate is PASS.
## Production runtime readiness after schema PASS

Read-only checks show:
- production case corpus: MISSING at /opt/jiuchen-api/shared/cases/ai/rag/v1.0.0/rag_reference_production_all.jsonl;
- Assessment AI production env: not configured (provider/base URL/API key/model/response format/case root all absent).

Interpretation:
- there is no stale qwen3.5 production configuration to remove;
- next order is: securely place private production case corpus -> configure approved qwen3.8-flash Assessment env -> deploy immutable backend release -> verify health/config/meta -> run real-device Assessment closure.
## Production case corpus gate — PASS

Private production case corpus was transferred through staging, SHA256 matched between local and ECS copies, installed under /opt/jiuchen-api/shared/cases/ai/rag/v1.0.0/rag_reference_production_all.jsonl, and confirmed readable by the jiuchen-api service account.

Conclusion:
- production case corpus gate: PASS;
- next blocker: Assessment AI production env placement for qwen3.8-flash strict-schema runtime.
## Operator configuration retention rule

Do not rely on chat memory for values that must be re-entered later.

For every successful external-service setup, immediately record the following in the operator's private configuration ledger:
- provider/service name;
- region/workspace;
- Base URL / API host;
- API key identifier or secret location (never commit the key itself);
- model name;
- non-secret runtime options;
- date last verified;
- which workload uses it.

For Assessment AI, the previously verified Beijing OpenAI-compatible Base URL is:
https://dashscope.aliyuncs.com/compatible-mode/v1

The API key remains secret and must stay outside Git.
## Assessment production runtime configuration gate — PASS

Production configuration verification confirmed:
- provider: aliyun-bailian;
- Base URL configured;
- API key configured;
- model: qwen3.8-flash;
- temperature: 0;
- response format: json_schema;
- extra body: enable_thinking=false;
- case data root: /opt/jiuchen-api/shared/cases;
- production case corpus readable by jiuchen-api service account.

No service restart or release promotion had occurred at the time of this check. The next gate is immutable backend release deployment and post-promotion health/config/meta verification.
## Assessment-only release candidate test-count clarification

Production candidate: 8e5a0ffe7869cd3f6ec8c0a8a876247798b65519.

On ECS this candidate completed:
- npm test: 97 tests, 97 pass, 0 fail;
- npm run build: PASS.

The earlier 105-test expectation belonged to the later a4dedbe9... staging candidate, which contains additional schema-contract/profile-era tests. Do not treat the 97 count on 8e5a0ffe... as missing coverage merely because the later shared-branch candidate has a larger test total.

GitHub CI for 8e5a0ffe... also completed successfully.
## Promote permission-gate false positive

Before approving the Assessment-only release, the immutable release permission preflight stopped on a node_modules .bin symlink reported as mode 0777.

Evidence:
- new release esbuild .bin entry is a symlink; its resolved target is root:root mode 0750;
- existing production pino .bin entry is also a symlink reported as 0777; its resolved target is root:root mode 0750;
- the existing production release would fail the current WRITABLE find expression for the same reason.

Root cause:
- Linux symlink mode bits are normally reported as 0777 and are not the effective access-control boundary;
- the promote script's group/world-writable scan did not exclude symlinks, creating a false positive.

Planned correction:
- keep root ownership checks unchanged;
- keep group/world writable checks for real files/directories;
- exclude symbolic links from only the writable-mode test using ! -type l;
- do not approve READY/promote until the corrected script is reviewed and installed with explicit human approval.

The repository-controlled copy is ops/ecs/jiuchen-promote.
## Promote symlink permission-gate repair — PASS

The root-owned /usr/local/sbin/jiuchen-promote permission gate was patched after explicit human approval so that only the writable-mode scan excludes symbolic links (`! -type l`). Ownership checks and writable checks for real files/directories remain unchanged.

Post-fix verification:
- bash syntax check: PASS;
- existing production release permission dry-run: PASS;
- Assessment-only release permission dry-run: PASS;
- resolved pino/esbuild targets remain root:root mode 0750.

Conclusion:
- the prior failure was a symlink mode-bit false positive;
- promote safety contract is restored without relaxing real file/directory protections;
- no READY file or production cutover occurred during this repair.
## Production cutover incident and recovery — RESOLVED

Assessment-only release: `8e5a0ffe7869cd3f6ec8c0a8a876247798b65519`.

Final production result:
- promote completed successfully;
- active release: `8e5a0ffe7869cd3f6ec8c0a8a876247798b65519`;
- previous/rollback release: `e4aa5c12a3e905ad1dba55ac92a26609bb171259`;
- `/health/live`: PASS;
- `/health`: PASS with database `ok`;
- `/health/config`: PASS with `assessmentAiConfigured=true`;
- `/assessments/meta`: PASS with `providerConfigured=true`;
- `jiuchen-api.service`: active.

Incident sequence:
1. First promote switched `current` to the Assessment release but the service failed to start.
2. Node reported `MODULE_NOT_FOUND` for `dist/server.js` even though the file existed.
3. Root inspection showed `dist/` mode `0750 root:root` and `dist/server.js` mode `0640 root:root`.
4. The service runs as `jiuchen-api:jiuchen-api`; that user could traverse the release root/services/api but could not traverse `dist` or read `server.js`.
5. The error was therefore an access-control failure presented by Node as module-not-found, not a missing build artifact.
6. Release permissions were normalized so immutable content remained root-owned/non-writable while runtime directories/files became readable/traversable by the service account.
7. Second promote succeeded. Two initial health probes briefly saw connection-refused during process startup, then the built-in retry loop passed and emitted `PROMOTE_OK`.

Lessons:
- build/test as root is insufficient; production preflight must include the actual systemd service identity;
- an immutable release needs two simultaneous properties: non-root users cannot modify it, and the runtime service user can traverse/read everything needed to execute;
- existence checks on `dist/server.js` are insufficient; verify service-user readability before switching `current`;
- Node `MODULE_NOT_FOUND` can be caused by directory/file permissions, not only an absent file;
- health probes immediately after restart may briefly receive connection-refused; treat this as transient only when the bounded retry gate ultimately passes;
- if automatic rollback reaches systemd start-rate limiting, use `systemctl reset-failed` before a controlled recovery start; do not blindly repeat promote/rollback;
- keep the old release intact and use the existing rollback mechanism rather than manually rewriting `current`.

Follow-up hardening:
- repository promote script must keep the symlink-mode false-positive fix;
- repository promote script must preflight `jiuchen-api` traverse/read access to `services/api/dist/server.js` before switching `current`;
- future release runbooks must include service-user access checks as a required gate.
## Final closeout checkpoint — BLOCKED pending operator real-device acceptance

Baseline HEAD:
`80c69d0545a63f370efb786f7d8c20c7577c29de`.

Production state at closeout checkpoint:
- active release: `8e5a0ffe7869cd3f6ec8c0a8a876247798b65519`;
- previous/rollback release: `e4aa5c12a3e905ad1dba55ac92a26609bb171259`;
- schema: PASS;
- production case corpus: PASS;
- Assessment production env: PASS;
- `/health/live`: PASS;
- database: `ok`;
- `assessmentAiConfigured=true`;
- `providerConfigured=true`;
- service: active.

Assessment Production Gate final status for this checkpoint: **BLOCKED**.

Reason:
- the remaining acceptance is device-bound and must be executed by the operator on the real WeChat mini-program;
- no device result has yet been supplied for the final customer-visible loop.

Required final device evidence:
1. Assessment Form saves a draft successfully;
2. leave the form, open History, and reopen the same draft with persisted input intact;
3. submit that draft and observe one real production qwen3.8-flash run;
4. Result opens successfully and the succeeded Assessment is persisted;
5. return to History and reopen the same succeeded Assessment;
6. the reopen renders the persisted result and does **not** trigger a second model call.

Until those six observations are supplied:
- real production model call from the mini-program: **UNVERIFIED**;
- History persisted-result reuse: **UNVERIFIED**;
- second-call suppression on reopen: **UNVERIFIED**;
- remaining blocker: **operator real-device acceptance only**.

Scope freeze:
- no model/prompt/strict-schema changes;
- no new benchmark/evaluation run;
- no Schedule AI or Customer AI;
- no payment work;
- no Blueprint/UI/navigation work;
- only a direct bug revealed by the six-step Assessment chain may be fixed here.

If all six steps PASS, change this gate to PASS and record:
`Assessment AI Runtime 当前阶段 CLOSED。除主控重新派发 Schedule AI / Customer AI 等新工作包外，不再修改 Assessment Runtime。`
