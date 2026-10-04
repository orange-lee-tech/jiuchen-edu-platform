# AI Commercial Runtime Strategy

Status: working architecture decision for Jiuchen V1.

## 0. Product priority and strategic objective

The AI roadmap is intentionally ordered:

1. **Assessment AI**
2. **Customer AI**
3. **User AI Profile**

The immediate commercial objective is not to maximize benchmark scores. It is to make
the real Assessment path reliably usable end to end: real user input -> bounded
retrieval/evidence -> model -> valid business output -> stored/displayable result.

A model that is slightly less impressive on an offline metric but reliably satisfies
the production contract may be preferable to a stronger model that cannot complete
the business workflow.

Customer AI must not block Assessment delivery. Its V1 product job is narrow:
- give concise, useful business-domain answers or guidance;
- transfer to a human when needed;
- preserve the AI conversation record so the human agent can see the context instead
  of forcing the user to repeat the conversation.

User AI Profile is a downstream synthesis layer, not a prerequisite for Assessment or
Customer AI. It should accurately track the individual over time by combining only
authorized, structured facts from:
- user/account/profile information;
- Assessment inputs/results and evidence-backed conclusions;
- Customer AI interactions and human-service outcomes where policy permits.

It must remain attributable and updateable rather than becoming an opaque personality
summary.

## 1. Business split

Jiuchen has two AI products with different economic and runtime requirements.

### A. AI assessment

Purpose: produce a structured保研评估 product, not an open-ended chat.

Requirements:
- structured student profile input;
- retrieval from cases / schools / Jiuchen product knowledge;
- deterministic toolbox/rules where possible;
- evidence-backed structured JSON output;
- one bounded inference job per assessment;
- schema validation and one bounded repair retry at most;
- model/provider is replaceable;
- no unlimited conversational continuation.

### B. Customer service

Purpose: answer Jiuchen product/service questions and hand off to a human quickly.

Requirements:
- cheap, fast text model;
- FAQ/RAG first;
- short bounded context;
- business-domain only;
- explicit human handoff;
- no long-form general-purpose chat;
- per-user/session rate and turn caps;
- separate API key/quota from assessment.

The two systems may share a structured user-profile snapshot, but must not share unbounded chat history or the same cost budget.

## 2. Shared user profile

Create/read a structured `UserAIProfileSnapshot` from the business database. It may include role, grade/stage, academic profile, current Jiuchen product/service state, and other authorized fields needed by the current AI task.

Do not persist or replay arbitrary cross-product conversation history as the user profile.

## 3. Assessment model strategy

Keep the application-level `AssessmentModelProvider` abstraction. Provider selection is an operational choice, not a business-domain dependency.

Recommended commercial shape:
- RAG/toolbox contains changing facts and cases;
- the model learns task behavior/output style;
- if fine-tuning is used, prefer LoRA/SFT on a model that supports token-based deployment;
- after one locked acceptance gate passes, the tuned model may enter production directly.

Do not train and test on the same examples.

## 4. One-time data package

Build one durable dataset package rather than repeatedly commissioning ad-hoc evaluations:

- `train`: high-quality supervised examples for SFT when enough examples exist;
- `validation`: tuning/selection checks;
- `acceptance`: locked holdout used once for the release gate;
- `adversarial`: malformed, insufficient, contradictory, and boundary inputs.

For meaningful SFT, follow the selected provider/model's data-volume guidance. A small 50–100 case set is useful for acceptance/provider selection but is not automatically sufficient as the SFT training set.

## 5. Runtime cost controls

### Assessment

Hard caps:
- bounded structured input;
- bounded retrieved evidence;
- bounded output JSON;
- maximum one schema-repair retry;
- timeout/retry budget;
- quota/credit checked before inference;
- failed inference does not consume a paid assessment credit.

### Customer service

Hard caps:
- domain classifier / deterministic FAQ before LLM where useful;
- only recent compact context + structured profile summary;
- short reply length;
- maximum AI replies per session/day;
- excessive or unrelated requests redirect to Jiuchen scope or human service;
- no web browsing/general knowledge mode by default;
- explicit transfer-to-human action always available.

## 6. Provider/account isolation

Use separate runtime credentials and budgets even if both products initially use the same cloud vendor:

- `ASSESSMENT_AI_BASE_URL`
- `ASSESSMENT_AI_API_KEY`
- `ASSESSMENT_AI_MODEL`
- `CUSTOMER_AI_BASE_URL`
- `CUSTOMER_AI_API_KEY`
- `CUSTOMER_AI_MODEL`

This prevents customer-service abuse from exhausting assessment capacity and allows independent vendor/model replacement.

## 7. WeChat ecosystem position

The mini-program is intentionally WeChat-coupled. Prefer mature official WeChat/WeCom capabilities for:
- login;
- phone authorization;
- payments;
- customer-service entry and human-agent workflow;
- upload and other platform-native features when suitable.

ECS exists to reuse owned infrastructure for Jiuchen's core API and business logic, not to recreate every WeChat platform service.

## 8. Current CloudBase decision

- CloudBase Storage: keep temporarily; ECS upload/download/delete path is verified.
- CloudBase AI: not a core production dependency; ECS calls returned HTTP 429 for both tested models.
- CloudRun API: migration target is ECS, with CloudRun retained only as rollback until acceptance is complete.
