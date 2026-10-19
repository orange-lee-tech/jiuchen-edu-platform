# Assessment Report V2 Implementation Handoff — 2026-10-05

Status: **IMPLEMENTED IN CODE / CI AND DEVICE ACCEPTANCE REQUIRED**

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Branch: `p1/foundation`

## Scope

This work implements the approved Assessment Report Experience V2 without reopening
Assessment model selection or changing the persisted Assessment schema.

No changes were made to:
- Assessment provider/model selection;
- prompt / strict-schema contract;
- Assessment output schema;
- production database schema;
- `app.json` / tabBar;
- ECS runtime configuration;
- payment / credit enforcement.

The implementation is intentionally presentation-first and operates on the persisted
Assessment result.

## Implemented behavior

### 1. Report order

The Result page now renders in the approved order:

1. 优势
2. 风险
3. 目标评估
4. 不确定性
5. 推荐行动
6. 九辰方案
7. 联系老师
8. 使用说明
9. 参考案例

The old leading “背景概览 / 证据依据 / 相似案例” blocks were removed from the
customer-facing opening flow.

### 2. Case evidence becomes citation material

Case evidence is no longer dumped at the beginning of the report.

The renderer:
- builds a deterministic reference index from case evidence actually cited by
  strengths, risks, target assessments and persisted similar-case links;
- appends compact `[n]` references to the relevant analysis;
- keeps numbering stable for the persisted result;
- renders a compact final 参考案例 section;
- opens a case-detail sheet when the user taps `[n]` or the final reference row.

The detail sheet shows only the relevant persisted evidence:
- source/title metadata;
- similarity reason when available;
- result summary when available;
- persisted excerpt when available;
- case identifier for traceability.

No model call is made when expanding a reference.

### 3. Jiuchen service recommendation

The Result page now attempts one deterministic best-fit recommendation from the
existing governed `/products` catalog.

The recommendation:
- uses the persisted Assessment risks/targets/actions as demand signals;
- scores only services actually returned by the governed product catalog;
- prefers strong semantic matches such as research/paper, competition, GPA, English,
  application preparation, elite-school packages, “跃升” and “稳录” contexts;
- returns at most one best-fit service;
- explains which identified need it maps to;
- links to the existing Product Detail page;
- falls back to “暂不强行推荐” when the match is weak or the product catalog is
  temporarily unavailable.

This is deterministic presentation logic and does not invoke the Assessment model.

### 4. Human contact

The 联系老师 section uses the existing WeCom customer-service entry and explicitly
frames the handoff around the current Assessment result.

### 5. Copy

A new 复制报告 action generates clean plain text from the persisted result.

The copied text uses Chinese document hierarchy rather than Markdown syntax:

```text
一、
（一）
1.
（1）
a.
```

Only levels actually needed by the current report are emitted.

### 6. Download

A new 下载报告 action offers:

- Markdown (`.md`)
- plain text (`.txt`)
- image
- Word (`.docx`)

Default filename:

```text
<姓名><YYYY年M月D日>评估
```

The export path is local and deterministic:
- MD/TXT are generated in the mini-program user-data directory;
- Word is generated locally as a real OOXML `.docx` package, not a screenshot;
- image export renders readable pages to canvas and automatically splits long reports
  instead of shrinking all text into one unreadable image;
- generated files can be opened/shared where the current WeChat client supports it;
- image pages are saved to the album.

No export action calls the model.

### 7. Long-text usability

Long report text now uses `user-select` where appropriate, addressing the DevTools
hint observed during the production acceptance run.

### 8. Visual direction

The Result page was tightened toward the approved square-first language:
- smaller restrained radii;
- neutral blue-gray surfaces;
- fewer decorative chips;
- no evidence dashboard at the top;
- stronger report hierarchy.

This is scoped to the Assessment Result page and does not start the broader Experience
Blueprint navigation work.

## Files

Added:

```text
apps/miniprogram/miniprogram/utils/assessment-report-export.ts
```

Modified:

```text
apps/miniprogram/miniprogram/pages/assessment-result/assessment-result.ts
apps/miniprogram/miniprogram/pages/assessment-result/assessment-result.wxml
apps/miniprogram/miniprogram/pages/assessment-result/assessment-result.wxss
docs/product/assessment-report-experience-v2-2026-10-05.md
```

## Acceptance required

After CI passes, device acceptance should verify:

1. Result opens without a second model call.
2. First content section is 优势; no case dump appears before the analysis.
3. A visible `[1]` citation opens the matching case sheet.
4. 参考案例 contains only cited cases and uses the same numbering.
5. Copy produces the expected Chinese-numbered plain text.
6. MD export succeeds and can be shared/saved.
7. TXT export succeeds and can be shared/saved.
8. Word export opens as a structured `.docx` and Chinese text is readable.
9. Image export saves one or more readable pages without clipped text.
10. Jiuchen方案 either names one grounded catalog service or explicitly declines to
    force a recommendation.
11. 联系老师 opens the existing WeCom customer-service flow.
12. History reopen still renders the persisted result without a model call.

## Known platform nuance

File sharing/saving UI differs between WeChat DevTools and a real phone. The
implementation creates the files locally first, then uses the client capability to
open/share them. Real-device acceptance is authoritative for the final export UX.

## Runtime state

Assessment Production Gate remains PASS.

Assessment Runtime remains CLOSED. This V2 implementation does not alter the model
contract or production persistence semantics.
