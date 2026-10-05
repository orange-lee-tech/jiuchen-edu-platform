# Assessment Report Experience V2 — Product Requirements — 2026-10-05

Status: **APPROVED PRODUCT DIRECTION / NOT YET IMPLEMENTED**

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Branch: `p1/foundation`

## Context

The production Assessment chain has passed real-device acceptance, including
cross-device History reopen without a second model call.

This document records the product-quality improvements identified by the operator
while reading the first real production report. These requirements are intentionally
separate from the closed Assessment Runtime gate.

The goal is not to reopen model selection. The goal is to turn a technically valid
Assessment into a report that is direct, readable, exportable and commercially useful.

## Core principle — analysis first, evidence second

The report must not read like a pile of cases.

Cases are analysis material and evidence. They should support conclusions, not become
the main body of the report.

The first screen and opening sections must go directly to the user's own situation,
targets, strengths, risks and next actions.

Do not begin the report by expanding multiple full case records or raw case codes.

### Citation behavior

When a conclusion uses a case, cite it inline with compact reference markers:

```text
……与目标项目的历史相似案例相比，你当前的科研产出仍是主要差距[1]。
```

The marker `[1]` should be interactive in the mini-program.

On tap:
- open a lightweight modal / drawer / overlay;
- show the compact supporting case;
- make clear what part of the case is relevant;
- do not navigate away from the report unless explicitly required.

The report body should summarize only the evidence needed for the current conclusion.
It should not reproduce the full case.

### Reference Cases section

All cited cases should be collected at the end in a compact
`参考案例` section, analogous to references in a paper.

Recommended display shape:

```text
[1] 相似背景：本科院校 / 专业 / 核心条件 / 去向结果 / 与本次判断的关联
[2] 相似目标：目标院校 / 项目 / 关键差异 / 去向结果 / 与本次判断的关联
```

Internal case IDs may remain available for traceability but should not dominate the
customer-facing text.

No case may be invented. Every reference marker must resolve to persisted evidence
already associated with the Assessment result.

## Required report order

The customer-facing report order is fixed as:

1. **优势**
2. **风险**
3. **目标评估**
4. **不确定性**
5. **推荐行动**
6. **九辰方案**
7. **联系老师**
8. **使用说明**
9. **参考案例**

This is a presentation contract. Runtime field names do not have to be identical to
the headings as long as the renderer produces this order faithfully.

### 1. 优势

State the user's strongest factors directly.

Avoid:
- opening with case retelling;
- generic encouragement;
- unsupported external benchmarks.

Use citations only where they materially support the judgment.

### 2. 风险

Prioritize the gaps most likely to affect the stated targets.

Differentiate:
- confirmed weaknesses from user input;
- evidence-backed comparative risks;
- information that remains uncertain.

### 3. 目标评估

Assess each user target directly.

For every target:
- judgment / tier;
- concise rationale;
- key gap;
- recommended action;
- evidence citations when external or comparative claims are made.

Do not bury target conclusions behind long case descriptions.

### 4. 不确定性

Explicitly state missing information, evidence limits and judgments that cannot be
made reliably.

This section should reduce false precision rather than repeat generic disclaimers.

### 5. 推荐行动

Actions should be ordered by practical priority and timeframe.

They should answer:

```text
What should this user do next?
Why?
When?
Which target or risk does it address?
```

### 6. 九辰方案

Where a real Jiuchen service can materially help the user's identified gap, recommend
the best-fit service.

This is not an advertising slot.

Recommendation rules:
- must map to a need already identified in the report;
- explain why the service is suitable;
- do not recommend every product;
- do not invent product capabilities;
- use governed product knowledge / approved service descriptions as the source of
  truth;
- if no Jiuchen service is clearly relevant, do not force a recommendation.

Preferred shape:

```text
适合你的九辰方案：
- 服务 / 方案名称
- 对应问题
- 为什么适合
- 建议下一步
```

### 7. 联系老师

Provide an explicit next step to human guidance.

The report should make the handoff understandable:
- what the teacher can help clarify;
- what information the user should prepare;
- a clear entry to the existing customer-service / teacher contact path.

Do not duplicate a long sales pitch here.

### 8. 使用说明

Keep this short.

Explain:
- this is an evidence-based planning assessment, not an admission guarantee;
- conclusions depend on supplied profile data and currently available evidence;
- the user can return through History to view the persisted result;
- future profile changes may justify a new Assessment rather than silently changing
  an old persisted report.

### 9. 参考案例

Compact list of only the cases actually cited in the report.

No uncited evidence dump.

## Copy action

Add a customer-visible `复制` action to the Assessment Result page.

Copy should produce a clean plain-text report, not raw Markdown.

Markdown heading/bullet syntax must be converted to normal Chinese document hierarchy.

Required numbering convention:

```text
一、
（一）
1.
（1）
a.
```

The copied text should preserve:
- report title;
- user name when available;
- assessment date;
- the nine report sections in the approved order;
- inline case references such as `[1]`;
- compact reference-case list.

It should not include UI labels, JSON field names, internal IDs or Markdown markers.

## Download action

Add a customer-visible `下载` action.

The user chooses one output format:

- Markdown (`.md`)
- plain text (`.txt`)
- image
- Word (`.docx`)

Default filename pattern:

```text
姓名2026年10月5日评估
```

General rule:

```text
<姓名><YYYY年M月D日>评估
```

If a format requires an extension, append the normal extension.

The exported content must be semantically equivalent across formats. The export
pipeline must not invoke the model again.

### Markdown export

Preserve a clean, portable Markdown hierarchy and reference markers.

### TXT export

Use the same Chinese numbering style as the Copy action.

### Image export

Render a readable long-form report image. Avoid tiny font, clipped sections and
screenshots of the application chrome.

If one image becomes unreasonably tall, use a defined multi-image strategy rather
than silently shrinking the text to illegibility.

### Word export

Generate a real structured Word document:
- title;
- user/date metadata;
- heading hierarchy;
- body paragraphs;
- numbered references;
- readable Chinese typography.

Do not make Word export a screenshot embedded in a `.docx`.

## Data / runtime boundary

The closed production Runtime should not be changed merely because the first report
layout is weak.

Prefer a presentation/normalization layer over prompt-only formatting.

Current runtime already persists structured concepts including:
- strengths;
- risks;
- target assessments;
- recommended actions;
- similar cases;
- uncertainties;
- evidence.

The result renderer can therefore solve a meaningful part of V2 without destabilizing
model selection.

A schema/runtime extension is justified only for information that does not already
exist structurally, especially a governed `九辰方案` recommendation contract.

If that field is added later, it must be grounded in approved product knowledge and
must pass the same no-invention discipline as other external claims.

## Reference-model requirement

Case references should be stable and deterministic.

Recommended transformation:

```text
persisted evidence ref / caseId
        ->
report reference index [1], [2], [3]...
        ->
body citation marker
        ->
interactive case detail
        ->
end-of-report compact reference list
```

The same persisted result must generate the same reference numbering when reopened
from History or exported.

## No-second-call rule

All presentation, copying, downloading, reference expansion and History reopen actions
must operate on the persisted Assessment result.

They must **not** trigger another model invocation.

A new model call requires an explicit new/re-run Assessment action under the product
rules.

## Suggested implementation split

### Batch A — report presentation / citations / copy

No model-selection changes.

Implement:
- fixed nine-section result order;
- cases removed from the beginning;
- deterministic inline `[n]` references;
- click-to-expand case detail;
- compact reference list at the end;
- plain-text Copy action with Chinese numbering normalization.

### Batch B — export

Implement:
- Markdown;
- TXT;
- image;
- Word;
- deterministic filename generation;
- export from persisted result only.

### Batch C — Jiuchen solution recommendation

Add the minimum governed data contract needed for:
- best-fit Jiuchen service recommendation;
- rationale tied to an identified need;
- teacher-contact handoff.

Do not ship generic cross-sell or fabricate a service fit.

## Acceptance criteria

V2 is not accepted unless all of the following are true:

- opening the report begins with the user's analysis, not case dumps;
- case material appears as supporting citations and a compact final reference section;
- every `[n]` marker opens the correct supporting case;
- uncited cases are not dumped into the report;
- report section order exactly follows the approved nine-section sequence;
- Copy produces clean plain text using the specified Chinese numbering hierarchy;
- Download offers MD / TXT / image / Word;
- generated filenames follow the approved name + date + 评估 pattern;
- exports use the persisted result and do not call the model again;
- Jiuchen recommendations are need-based and grounded in real service knowledge;
- the human-contact entry remains clear;
- History reopen continues to reuse the persisted result with zero second-call
  behavior.

## Out of scope for this requirement document

- reopening model selection;
- re-running the frozen benchmark;
- changing `qwen3.8-flash` merely for presentation;
- replacing the production case corpus;
- payment changes;
- unrelated Blueprint/navigation construction.

Those require their own work packages.
