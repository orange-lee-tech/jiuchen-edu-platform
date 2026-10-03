# Main control status — 2026-10-03

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Integration branch: `p1/foundation`  
Verified branch HEAD at status write: `d4a3be912bf1c1fa9c35487a6c2d95d59c6490a4`

## Assessment Commercial Closure — implementation status

Implementation commit:
`529e2cd190177b1b4116cebd0c862b1c0770a424`

Delivered:
- real `CaseKnowledgeSource` with deterministic lightweight retrieval and Top 10 evidence;
- eval/test forced to use 656-case eval-safe RAG; production uses 748-case production RAG;
- governed `ProductKnowledgeSource`, Top 3, excluded from admission-tier evidence;
- stable evidence refs and stricter evidence validation;
- one bounded repair call for schema/evidence failures;
- failure path does not consume assessment credit;
- `assessment-agent-v2`;
- mini-program assessment result page and history page;
- successful assessment navigates directly to the result;
- users can reopen previous successful reports.

Validation reported by implementation lane:
- API typecheck: PASS
- API tests: 77/77 PASS
- API build: PASS
- mini-program TypeScript: PASS
- private RAG smoke: eval-safe + production PASS
- evaluation inspect: 92/92 (Core 80 + Language Extension 12)
- evaluation dry-run: 92 PASS
- evaluation mock smoke: 5 PASS

## Current hard blockers

1. Real model evaluation has not run because no live evaluation provider credentials were configured.
2. Production private case corpus is not mounted/configured via `ASSESSMENT_CASE_DATA_ROOT`.
3. Production assessment schema gate has not been executed.
4. Result/history pages still need WeChat Developer Tools and real-device UX acceptance.
5. Commercial paid launch still lacks CreditLedger/free quota/WeChat payment-recharge flow.

## Current execution policy

Do not reopen ECS migration, NPM, HTTPS, CloudBase AI, or customer-service infrastructure without a concrete failure signal.

Keep one integration branch. Parallelism is by responsibility, not by branch count.

### Lane A — active engineering

Next trigger: when the human finishes a live model API setup.

Then:
1. run 5-case real smoke;
2. if clean, run 20;
3. if clean, run the frozen 92-case suite;
4. record quality/cost/latency results;
5. fix only concrete provider/runtime defects found by the eval;
6. do not rebuild the evaluation framework;
7. do not deploy production or execute schema writes.

After model acceptance, prepare the exact production runtime contract:
- provider/model identifiers;
- required env variable names only;
- `ASSESSMENT_CASE_DATA_ROOT` layout;
- startup/readiness checks;
- no secret values in Git.

### Lane B — Production Guardian

Stay dormant except for useful read-only preparation.

Allowed now:
- read-only inspect whether assessment, classroom revision, internal-ID/news, and product-knowledge production schemas already exist;
- report exact missing tables/columns and map them to existing idempotent upgrade scripts.

Do not execute schema writes until main control explicitly approves the specific feature gate.

When Lane A produces an accepted provider/runtime contract, Lane B will:
- place approved secrets into root-owned production env;
- mount/copy the approved private case runtime data;
- run the assessment schema gate if approved;
- deploy a new immutable backend release;
- health-check and rollback on failure.

### Lane C — WeChat acceptance

Infrastructure/customer-service work is closed.

Active tasks:
- WeChat Developer Tools visual/interaction acceptance for assessment result/history pages;
- real-device acceptance of non-AI business paths that do not require a new backend release;
- record screenshots/issues as concrete bugs, not broad redesign requests.

Do not reopen CloudRun/NPM/customer-service architecture.

## AI provider onboarding log discipline

For every provider/model tested, record in GitHub:
- date;
- provider;
- region;
- model ID;
- API protocol/compatibility;
- input/output pricing snapshot and source date;
- context/output caps relevant to Jiuchen;
- structured output / tool / vision support as relevant;
- evaluation command and dataset version;
- 5/20/92 results;
- measured token usage, latency and estimated cost;
- decision: accept / reject / retest;
- reason.

Never commit:
- API keys;
- full secret-bearing endpoint strings if they embed credentials;
- private case content;
- production database credentials.

## Delivery order

1. Live provider evaluation and assessment acceptance.
2. Production assessment schema/runtime deployment.
3. Assessment result real-device acceptance.
4. Credit ledger/free quota/WeChat payment closure.
5. Classroom/ID/schedule full production acceptance.
6. Product-knowledge DB/RAG productionization.
7. Customer AI only after the paid core flow is stable.
