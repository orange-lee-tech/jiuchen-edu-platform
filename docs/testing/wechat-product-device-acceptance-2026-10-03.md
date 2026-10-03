# WeChat product device acceptance — 2026-10-03

Scope: Product Device Acceptance on `p1/foundation`.

Baseline before this batch: `945c52cddba45c7c72bbae56cb7a27e397d41c3c`.

Status vocabulary:

- **PASS** — verified on a real device or by an existing completed acceptance run.
- **FIXED / RETEST** — deterministic UI/interaction defect was fixed in code; real-device retest is still required.
- **NOT RUN** — not yet executed on the current device acceptance run.
- **BLOCKED** — cannot be honestly passed until an external/runtime dependency is ready.

## 1. AI Assessment UI acceptance

| Area | Status | Finding / expected retest |
| --- | --- | --- |
| Form bootstrap | NOT RUN | Real-device / Developer Tools visual check still required. |
| Draft save | NOT RUN | Backend contract requires complete required profile fields + at least one target before a draft can be created. |
| Draft reopen | FIXED / RETEST | History draft cards previously could not be reopened. Draft cards now navigate back into the form and hydrate saved input. |
| Latest edits before run | FIXED / RETEST | Existing draft is now updated with the latest form state immediately before `run`, preventing stale saved input from being assessed. |
| History list | FIXED / RETEST | Draft cards expose “继续编辑”; draft timestamp uses `updatedAt`. |
| History empty state | NOT RUN | UI code contains an explicit empty-state card and “开始评估” CTA. Device check required. |
| Result page | NOT RUN | Real-device layout check required with test data. |
| Long text layout | FIXED / RETEST | Strengths / risks changed from two narrow columns to a single-column mobile flow; long report text gets explicit wrapping. |
| Evidence display | FIXED / RETEST | Result page previously ignored `assessment.evidence`. It now renders source title, source label/year, excerpt and stable evidence ref. |
| Similar case display | FIXED / RETEST | Similar cases already rendered; now the associated `evidenceRef` is visible for traceability. |
| Target empty state | FIXED / RETEST | Added defensive empty state if a report has no displayable target assessments. |
| Uncertainty | NOT RUN | Existing section renders uncertainties and its empty state; device check required. |
| Disclaimer | NOT RUN | Existing disclaimer block renders server output; long-text device check required. |
| Return from result | FIXED / RETEST | When result was opened from history, “查看全部历史评估” no longer creates a duplicate history page; it navigates back. |
| Re-enter succeeded result | NOT RUN | Existing path loads persisted assessment by ID and does not call `run`; device verification required. |
| Real AI inference | BLOCKED | This acceptance log does **not** claim provider/model production PASS. Use development/test records for UI-only acceptance until the real provider is ready. |

## 2. Non-provider real-device acceptance

| Area | Status | Notes |
| --- | --- | --- |
| WeChat login | NOT RUN | Run on current experience build. |
| Profile | NOT RUN | Verify persistence after reload. |
| Internal ID | NOT RUN | Requires real test IDs with known states. |
| Classroom page | NOT RUN | Verify student/teacher role visibility and editable/review state without relying on the new AI provider. |
| Products | NOT RUN | Verify list/detail navigation and long product content. |
| News | NOT RUN | Verify ECS list + official article/fallback behavior. |
| WeChat customer service | PASS | Previously verified end-to-end: mini-program → `wx.openCustomerServiceChat` → official WeCom customer-service account → human agent → reply to user. |

## 3. Failure recording format

For every new failure, record:

```text
页面：
操作：
期望：
实际：
截图：
```

Do not mark a device item PASS from static source inspection alone.

## 4. Current screenshot issues

No new Product Device Acceptance screenshots have been supplied for the 2026-10-03 run yet.

Any visual/interaction issue discovered during the next Developer Tools or real-device pass should be appended here with the five fields above.

## 5. Next device sequence

1. Developer Tools: assessment form → save complete draft → history → reopen draft → edit → save.
2. Use development/test assessment data: history → succeeded result → inspect evidence, similar cases, uncertainty, disclaimer and long text.
3. Result → history → reopen same result; confirm no new inference is triggered.
4. Real device: login → profile → internal ID → classroom → products → news.
5. Reconfirm WeChat customer service only if the experience build changed materially around that entry; no redesign is required.
