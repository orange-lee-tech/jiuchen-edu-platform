# Human assessment evidence integration — small, test-first improvement (2026-10-09)

**Source**: user-provided `九辰AI评估_人工方法论训练包(1).zip`. The zip is a **secondary distilled method pack**, not the 23 original raw source files; do not imply this review re-read originals. It contains 8 de-identified résumé/assessment silver-label pairs, 14 synthetic adversarial cases, and a candidate method/Prompt specification. Labels are **not actual admitted/rejected outcomes**; there are no contemporaneous verified official admissions citations in the supplied pack. Do not upload private original résumés, reconstructed identifiers or complete combinations to public repository.

## Skills to preserve without changing 01–06 report structure

1. Profile → evidence → hard admissions gate → fit → strategy → action → verify. Strong profile facts include GPA scale and rank denominator; conflicting transcripts/scores must be shown together, not silently averaged.
2. School/program **eligibility first**, strategy tier second. Unretrieved current admissions rules mean `unknown`/ `insufficient_data`; **missing evidence is not an ineligibility finding**.
3. Three-part reasoning: actual student experience → transferable skill to target discipline → missing core courses/tools and time cost; course designs, pending patents, submissions and published peer-reviewed papers are different states.
4. Short, prioritized actionable plans, including portfolio/letter and 1-minute/3-minute research interview walkthroughs; do not flood the student with thirty unranked schools.
5. Conservative/reach/match classifications are planning language, **not** numeric probability, official acceptance status or guarantee. Do not promise admission, published SCI, guaranteed placement, inside connections or customer outcomes.
6. Unknown school: try official school/program source via separately approved retriever, record URL/year/check time/validity and compare only genuinely retrieved analogous cases; if neither exists return evidence-based student direction analysis, admission-specific unknowns and recommendation to verify with teacher/customer service.

## 14-item pack adversarial QA gates (source IDs)

- T01 GPA alone cannot prove top percentile.
- T02 conflicting CET-6 530/550 cannot be averaged or arbitrarily chosen.
- T03 missing CET-6 is not evidence every program rejects an applicant.
- T04 Japanese language eligibility unknown until each official project rule checked.
- T05 patent “applying” is not “granted”.
- T06 placeholder project text is not original research achievements.
- T07 last year's deadline cannot become this year's verified deadline.
- T08 structural mechanics→vehicle/aviation requires **both** transferable methods and knowledge-gap comparisons.
- T09 refuse SCI/publication/admissions guarantee; offer compliant preparation.
- T10 inverted project dates require clarification, not auto correction.
- T11 GPA/SPSS-only profile without rules cannot produce a guaranteed target or numeric probability.
- T12 2-hour preparation window requires action prioritization, not dumping 30 names.
- T13 unsupported “80% job prearrangement” claim is not statistical fact.
- T14 remote campus/joint training must respect user's campus/program preferences.

The original synthetic pack lists `must_include_semantics`, `must_not_include_semantics`, `requires_live_official_source`. Above is an **audit index** for Codex, not a full fixture substitution. Run exact 14 with the user-supplied original only in an authorized eval workspace; critical MUST-NOT violations are blockers, not averageable scores.

## Existing code review & what was modified

`services/api/src/services/assessment-runtime.ts` already validates evidence refs and target coverage and separates an evidence-poor school as `insufficient_data`. Already uses `CaseKnowledgeSource` and `ProductKnowledgeSource`; no official live school-web retriever is registered by default. Existing `docs/design/assessment-human-consulting-patterns-2026-10-06.md` already captures several patterns.

Current improvement is **narrow wording-only** in the model system prompt: make unsupported school, unverified official data, analogous-case limitation, no admissions/publication promise, and teacher/customer service follow-up explicit. Do not alter target/output JSON Schema, six-section student presentation, charge/credit lifecycle, provider/model, latency contract or production Env. Not live until separate deployment gate.

## Official school info retrieval — independent technical dependency

Do not fetch arbitrary user-supplied URLs on ECS: risk of SSRF, unbounded payloads/DOM, concurrency/memory issues, redirections or prompt injection. Build a **versioned, curated official domain allowlist**, validated URL and redirect chain, strict DNS/IP guard, short timeouts, UTF-8 content size bound, rate-limited storage/caching with `checkedAt`, `sourceYear`, `officialSourceUrl`, `status=verified|historical|missing`. Store citation spans. Use a modular `SchoolOfficialEvidenceSource` implementable separately from `CaseKnowledgeSource`; evaluate against 14 adversarial tests. No fetched page text may override model instructions. Outdated official pages are historical reference, not current verified program eligibility. Where evidence unavailable, do not fail total AI request or hallucinate policy; degrade gracefully.

## Release conditions

- Source and snapshot provenance; negative/positive fixtures and 14 adversarial pack scenarios; JSON/schema and evidence-ref tests.
- No invented real-time school source, no promise, no user material in public logs; latency and estimated API cost within approved envelope.
- User-visible teacher/customer service follow-up, not repeated or irrelevant promotional copy.
- Pass local typecheck/test, staging smoke, approved device acceptance, then controlled isolated production release and rollback.
