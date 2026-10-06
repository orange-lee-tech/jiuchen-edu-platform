# Assessment Import + Classroom UI Closeout / 2026-10-06

Status: IMPLEMENTATION COMPLETE / CI PASS / NOT YET MERGED OR DEPLOYED

Branch: `p1/assessment-import-classroom-ui-20261006`

## Scope completed

### 1. Assessment production safety carry-forward

- Carries the production-proven evidence-reference containment fix forward from the production hotfix line.
- Keeps strict validation; invalid evidence refs are not allowed to become report facts.
- A bounded repair is retained, followed by conservative deterministic sanitation and a second strict validation.

### 2. Human-consulting pattern extraction

- Reviewed the supplied paired resume + human-assessment samples as qualitative product evidence.
- Added `docs/design/assessment-human-consulting-patterns-2026-10-06.md`.
- Runtime guidance now emphasizes:
  - decision variables instead of resume restatement;
  - reach / match / conservative portfolio thinking;
  - eligibility and timing blockers only when current evidence supports them;
  - cross-discipline transferability plus missing core knowledge;
  - target-specific document/interview narratives;
  - ordered, executable actions instead of generic advice.

### 3. Assessment report simplification

- Removed former report sections 04, 06 and 08 from the user-facing result.
- Renumbered the remaining sections continuously:
  01 Advantages
  02 Risks
  03 Target Assessment
  04 Recommended Actions
  05 Contact Teacher
  06 Reference Cases
- Synchronized UI, plain-text export, Markdown export and DOCX source text.
- Removed unused commercial recommendation fetch from the assessment result page.

### 4. Assessment material import

- Added an explicit `Import Material` entry on the assessment form.
- Supports Word (`.doc`, `.docx`), PDF and common image formats.
- Flow is intentionally:
  WeChat selection -> CloudBase temporary object -> document extractor adapter -> normalized text -> structured candidate -> user confirmation -> editable prefill -> normal Assessment Runtime.
- Import never auto-submits an assessment and never overwrites existing non-empty form fields.
- Existing experiences are merged and deduplicated under existing schema limits.
- Unmapped but relevant resume facts such as honors, courses, internships and skills are summarized into background notes instead of silently discarded.
- Irrelevant contact identifiers are explicitly excluded from structured output.

### 5. Resource / platform architecture

- Added a shared mini-program CloudBase upload helper; schedule and assessment import no longer duplicate upload mechanics.
- Removed the experimental bundled `pdfjs-dist` approach.
- Added a replaceable `MaterialDocumentExtractor` interface.
- Current implementation uses Tencent Cloud OCR `MultimodalDocParse` through the existing Tencent CAM credentials.
- ECS does not keep uploaded source files and does not load source documents into a permanent local file store.
- CloudBase source objects are temporary and deleted after request completion.
- Document page count, source size, normalized text and result archive size are bounded.
- PDF / Word / image extraction can later be replaced without changing the assessment form or Assessment Runtime.

### 6. Classroom UI correction

- Top-right action is now a narrower and explicit `导入课表` button.
- `本周课表` is moved into the left timeline before `大一上`, matching its navigation semantics.
- Schedule import continues to reuse the validated schedule import page.

### 7. Classroom compatibility hardening

- The classroom workspace no longer collapses the whole classroom page when the optional `coaching_records` table is absent.
- Guidance-record readiness is exposed separately so the UI does not lie by showing a schema gap as ordinary empty data.
- Plans and schedule remain usable while that optional module is not ready.

## Automated gates

Latest implementation CI before this closeout document:

- Mini-program typecheck: PASS
- Admin build: PASS
- API typecheck/test/build: PASS
- API tests: 140
- API pass: 140
- API fail: 0

## External / integration gates still required

These are not code-completion failures and must not be reported as already live:

1. Merge / integration into `p1/foundation` is still controlled by main-control.
2. Production deploy of this branch has not happened.
3. Tencent Cloud Multimodal Document Parsing must be enabled for the Tencent account/CAM identity used by production.
4. After enablement and deployment, run real-device import gates with:
   - one real DOCX resume;
   - one real PDF resume;
   - one clear resume/material image;
   - confirm parsed fields before applying prefill;
   - confirm source object cleanup;
   - confirm API memory remains within the existing 256 MiB production limit.
5. `coaching_records` schema should still be upgraded through the existing production schema process; the compatibility fallback prevents page failure but does not replace the intended schema upgrade.

## Do not regress

- Do not reintroduce local heavyweight PDF parsing into the long-lived API process without a resource review.
- Do not couple material extraction directly to Assessment Runtime.
- Do not allow import to auto-submit or silently overwrite user-entered data.
- Do not report the Tencent parser as production-verified until a real file succeeds after service/CAM enablement.
- Do not use the classroom fallback as an excuse to skip the production schema readiness process.