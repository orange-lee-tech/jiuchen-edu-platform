# AI Runtime worklog — 2026-10-04

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Branch: `p1/foundation`

Purpose: durable, non-secret handoff log for AI Runtime work. This file is documentation
only and is not loaded by the mini-program or API runtime.

## Strategic order

1. Assessment AI — current P0
2. Customer AI — P1 after Assessment is usable
3. User AI Profile — P2 synthesis layer

The current definition of success is simple: **Assessment must work in the real product
path.** Offline model quality matters, but a model that cannot satisfy the runtime
contract cannot ship.

## Assessment — current state

- Historical provider/model benchmark is complete and should not be rerun for reassurance.
- Baseline `qwen3.5-27b` model quality was accepted, but JSON Object mode did not
  reliably satisfy `assessment-output-v1`.
- A focused strict-schema challenger path now exists:
  - model under test: `qwen3.8-flash`
  - non-thinking
  - temperature 0
  - `response_format=json_schema`
  - `strict=true`
- Runtime keeps downstream Zod schema validation, evidence validation and at most one
  bounded repair. Strict provider output does not replace business validation.
- No ECS deployment or production DB migration is authorized by this worklog.

## 2026-10-04 operator smoke attempt

Observed result:

`assessment_provider_not_configured`

This attempt did **not** reach Alibaba Bailian and does not count as a model/runtime
failure. The PowerShell process did not contain all required provider environment
variables. In particular, comments such as "keep the existing value" do not restore
environment variables from an earlier terminal session.

The smoke script is being hardened to report exactly which required variable names are
missing without printing any secret values.

## Next gate

Run exactly one real local Assessment smoke after confirming the current PowerShell
process contains:

- `ASSESSMENT_AI_BASE_URL`
- `ASSESSMENT_AI_API_KEY`
- `ASSESSMENT_AI_MODEL=qwen3.8-flash`
- `ASSESSMENT_AI_TEMPERATURE=0`
- `ASSESSMENT_AI_RESPONSE_FORMAT=json_schema`
- `ASSESSMENT_AI_EXTRA_BODY_JSON={"enable_thinking":false}`
- private `ASSESSMENT_CASE_DATA_ROOT`

Do not echo API key contents. Presence checks only.

A PASS requires:
- `ok: true`;
- strict schema request diagnostics show `json_schema` and `strict=true`;
- final `assessment-output-v1` object passes schema and evidence validation.

If that passes, move to the smallest quality/cost sanity gate needed for production.
Do not restart the frozen historical benchmark.


## 2026-10-04 strict-schema real runtime smoke — PASS

The first valid private local smoke for the strict-schema challenger passed end to end.

Measured non-secret facts:
- provider: `aliyun-bailian`;
- model: `qwen3.8-flash`;
- runtime mode: non-thinking, temperature 0, strict JSON Schema;
- `responseFormatType=json_schema`;
- `responseFormatStrict=true`;
- HTTP 200 / finish reason `stop`;
- final top-level output: valid `assessment-output-v1` object;
- schema validation: PASS;
- evidence-reference validation: PASS;
- evidence items supplied to runtime: 13;
- end-to-end latency: 13,724 ms;
- prompt tokens: 2,759;
- completion tokens: 1,124;
- total tokens: 3,883;
- measured list-price estimate at the recorded snapshot: about CNY 0.005242 for this call.

This closes the previous "model can answer but production Agent cannot satisfy the
business structure" blocker.

Human review found one remaining production-quality concern: the output was useful
and structurally valid, but some external comparisons/threshold-like statements were
phrased more confidently than the retrieved evidence justified. No private case text
or raw output is committed here.

A single targeted grounding hardening is therefore allowed before production:
- external school/program competitiveness, typical-candidate claims, score thresholds,
  publication/competition requirements, and similar external facts must be explicitly
  supported by retrieved evidence;
- input-only findings may describe the user's own profile but may not smuggle in
  unsupported external benchmarks.

This is a bounded quality correction, not a new prompt-tuning loop.

## Next gate

1. Re-run the same real Assessment smoke once after the grounding hardening.
2. If structure still passes and unsupported external-fact language is materially
   reduced, run only five blind representative label cases as a gross-regression
   sanity check for `qwen3.8-flash`.
3. If that micro-gate passes, stop model selection and hand Assessment to the
   Production Gate.

Do not restart the 87/92-case benchmark.

## Customer AI boundary

Customer AI is intentionally narrow in V1:

1. concise answer / guidance within Jiuchen's business domain;
2. explicit transfer to human service.

When transferred, the human agent must be able to see the relevant AI conversation
record/context so the user is not required to repeat the problem.

Customer AI must use its own credential/quota and must not block Assessment delivery.

## User AI Profile boundary

The User AI Profile is an individual, longitudinal synthesis built from authorized
structured sources:

- profile/account information;
- Assessment inputs and results;
- Customer AI and human-service interaction outcomes where policy permits.

It should track meaningful changes over time and preserve source/updated-at provenance.
It is not an unrestricted chat-memory dump and is not a prerequisite for the current
Assessment production gate.

## Guardrails

- no API keys, secret URLs, private case text or production credentials in Git;
- no Eval leakage into training/RAG;
- no production DB writes from AI model-selection work;
- no ECS deployment from this work package;
- no UI work in this lane;
- documentation stays under `docs/` and must not create runtime dependencies.

## 2026-10-04 grounding re-smoke — PASS

The bounded grounding hardening was re-tested on the real Assessment runtime.

Measured:
- `ok: true`;
- `qwen3.8-flash`;
- strict JSON Schema request confirmed;
- schema/evidence validation PASS;
- 13 evidence items;
- latency 24,560 ms;
- 2,864 prompt + 1,416 completion = 4,280 total tokens;
- approximate list-price cost CNY 0.006114.

Strategic decision:
- stop prompt tuning;
- do not chase perfect phrasing before launch;
- residual broad statements should be improved later by adding stronger official
  school/program evidence, not by endless prompt edits;
- run only five blind representative evaluation cases to ensure the challenger has
  not materially regressed basic judgment quality;
- if the five-case sanity gate passes, close model selection and enter the Assessment
  Production Gate immediately.

## 2026-10-04 model selection closed — qwen3.8-flash ACCEPT

The project previously selected `qwen3.5-27b` after the frozen offline benchmark.
That decision was valid for model quality, but the production-style Assessment Agent
could not reliably obtain the required structured object from it under JSON Object
mode.

`qwen3.8-flash` is now selected because it solved that runtime-contract blocker with
strict JSON Schema and passed two private real-runtime smokes.

Cost is not a launch blocker:
- 3.8 input is more expensive than 3.5;
- 3.8 output is substantially cheaper than 3.5;
- the two measured Assessment smokes are output-heavy enough that 3.8 is cheaper at
  the same observed token mixes;
- actual production usage must be recorded, but no further model search is justified
  before launch.

The five-case micro run completed 5/5 with zero provider/parse errors. The supplied
terminal summary did not expose per-dimension score metrics; this log does not invent
them. The operator explicitly approved closing model selection.

Status:
- model selection: CLOSED / ACCEPT;
- selected runtime: `qwen3.8-flash`;
- old `qwen3.5-27b`: historical quality baseline / rollback reference only;
- next priority: Assessment Production Gate;
- AI Customer Service remains P1;
- User AI Profile remains P2.
## 2026-10-04 Assessment Production Gate opened

Model selection is closed. The work package is production closure only.

Five customer-visible gates:
1. submit/save input;
2. ECS executes qwen3.8-flash;
3. persist result;
4. open result;
5. reopen the persisted result from history.

Repository inspection confirms that form/result/history/API routes already exist. The current hard production blockers are the assessments schema gate, qwen3.8 production env placement, private production case corpus mount, immutable backend release promotion and real-device end-to-end acceptance.

Product Knowledge DB migration is not required for this gate because Assessment uses the private case JSONL plus bundled governed product evidence.

A read-only schema checker and post-migration contract verification were added before any production write. Canonical runbook: docs/handoff/assessment-production-gate-2026-10-04.md.
