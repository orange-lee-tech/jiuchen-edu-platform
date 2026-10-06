# Assessment Human-Consulting Patterns / 2026-10-06

Status: DESIGN INPUT / DE-IDENTIFIED

## Source basis

This note distills recurring strengths from the supplied paired resume + human
assessment samples. It intentionally excludes names and other personal
identifiers. The samples are treated as qualitative product evidence rather
than a perfect gold standard.

## Patterns worth preserving

1. **Start from the decision variables, not a resume summary.**
   The human assessments repeatedly anchor on undergraduate institution,
   major, rank/GPA, language, research, competitions and intended discipline,
   then use those variables to explain the application strategy.

2. **Use a reach / match / conservative portfolio.**
   Human consultants do not present one opaque score. They build a portfolio
   and explain why a target is a reach, a realistic match or a conservative
   option. AI may mirror this structure only when retrieved evidence supports
   the classification; no admission probability is introduced.

3. **Treat eligibility blockers as first-class risks.**
   Language requirements, degree/program type, whether a school accepts a
   particular background, application materials, tutor contact and application
   timing can be more important than a generic strength score. These facts must
   come from current evidence; the model must not invent deadlines or rules.

4. **Make cross-discipline transfer explicit.**
   Strong human assessments translate existing methods and projects into the
   target discipline (for example simulation, experiment, data analysis or
   optimization) and separately identify missing core knowledge. This is more
   useful than simply labelling a student as cross-major.

5. **Different targets may need different narratives.**
   A single student can require separate document/interview emphasis for
   different target directions. The AI should recommend direction-specific
   framing where justified instead of reusing one generic personal statement.

6. **Actions should be ordered and operational.**
   Useful human advice tends to say what to do first: submit the nearest
   application, contact a tutor, prepare stamped materials, rewrite a document,
   rehearse project questions, prepare a short interview deck, or fill a
   discipline knowledge gap. Improve research or work harder on English
   without an execution path is insufficient.

7. **Interview preparation should drill into real evidence.**
   Human consultants often recommend preparing a short project summary, a
   fuller technical explanation, likely follow-up questions, limitations and
   next-step validation. AI actions should prefer this kind of concrete
   preparation when the input contains substantive projects.

8. **Time-sensitive facts require current evidence.**
   Several human samples include application deadlines. The AI must only emit
   such dates when the current knowledge snapshot explicitly contains them.
   Historical sample dates are never generalized to the current cycle.

## Product translation

- Keep the existing evidence validator and exact target coverage.
- Keep reach | match | conservative | insufficient_data; do not add fake
  probabilities.
- Improve prompt guidance so risks and actions reflect the patterns above.
- Keep unknowns in the structured output for safety, even though the standalone
  uncertainty report section is removed from the user-facing report.
- Material import is a prefill mechanism only. Imported facts remain editable
  and must be reviewed by the user before the assessment is submitted.

## Material import architecture

The import pipeline is intentionally provider-separated:

WeChat file selection -> CloudBase temporary storage -> MaterialDocumentExtractor -> text -> AssessmentImportNormalizer -> editable form -> Assessment Runtime

Current extractor adapter:

- Tencent Cloud OCR MultimodalDocParse
- CloudBase temporary URL as the source
- Word / PDF / common image formats
- document page cap and bounded normalized text
- result archive size cap
- temporary source deletion after the request

The upper layers depend only on the extractor interface so the document parser
can later be replaced without changing the assessment form or assessment
runtime.