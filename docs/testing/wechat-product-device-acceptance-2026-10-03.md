# WeChat product device acceptance — 2026-10-03

Scope: Product Device Acceptance on `p1/foundation`.

Baseline before this batch: `945c52cddba45c7c72bbae56cb7a27e397d41c3c`.

Status vocabulary:

- **PASS** — verified on a real device or by an existing completed acceptance run.
- **FIXED / RETEST** — deterministic UI/interaction defect was fixed in code; real-device retest is still required.
- **NOT RUN** — not yet executed on the current device acceptance run.
- **BLOCKED** — cannot be honestly passed until an external/runtime dependency is ready.
- **FAIL** — executed on device and the observed behavior did not meet the expected product behavior.

## 1. AI Assessment UI acceptance

| Area | Status | Finding / expected retest |
| --- | --- | --- |
| Form bootstrap | PASS | 2026-10-03 real-device screenshot shows the structured Assessment form rendering correctly with populated competition and target-school sections. |
| Draft save | BLOCKED | Real-device save attempt failed before persistence. Production readiness confirms `assessments` is MISSING / NOT READY; production Assessment persistence cannot pass until the approved schema gate is executed. Raw English 500 toast was a client UX defect and was fixed to use friendly error mapping. |
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
| Provider-unconfigured guard | PASS | 2026-10-03 real device correctly showed “AI 模型尚未接入” and explicitly refused to generate simulated output. |
| Real AI inference | BLOCKED | This acceptance log does **not** claim provider/model production PASS. Use development/test records for UI-only acceptance until the real provider is ready. |

## 2. Non-provider real-device acceptance

| Area | Status | Notes |
| --- | --- | --- |
| WeChat login | PASS | User was already authenticated on device and successfully performed an authenticated internal-ID claim without re-login. |
| Profile | PARTIAL PASS | Real-device screenshots confirm persisted academic fields are reused across profile/Position/Assessment. Full close/reopen persistence retest remains. |
| Internal ID | PASS | Real device successfully claimed test student ID `JCS-UD7D-2F9Z` and displayed the locked “学员” identity. |
| Classroom page | BLOCKED | Test student identity bound successfully, but the real classroom payload still fails before plan cards render. Production readiness confirms `coaching_records` is MISSING / NOT READY, and current `/me/classroom` queries it for guidance-enabled stages. A separate UI bug that sent an already logged-in but unbound user back to Login was fixed; retest after schema readiness. |
| Schedule spreadsheet import | FAIL | A real `.xls` file reached the parser but returned `schedule_spreadsheet_invalid`. UI now explains supported layouts instead of exposing the raw code; parser compatibility for the supplied layout still needs investigation with the actual source file. |
| Schedule image import | BLOCKED | Real image upload reached the backend but returned `schedule_ai_provider_not_configured`. This is an explicit provider dependency, not a successful image parse. |
| Products | NOT RUN | Verify list/detail navigation and long product content. An explicit empty state was added for a valid empty catalog response. |
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

### Issue A — Assessment draft save blocked

```text
页面：AI 保研评估
操作：填写完整基础资料/竞赛/目标院校后点击“保存评估草稿”
期望：保存 Draft，并可在历史评估中继续编辑
实际：真机弹出 “Internal Server Error”，草稿未保存
截图：2026-10-03 11:27 用户真机截图
```

Diagnosis:
- Production schema readiness already records `assessments` as **MISSING / NOT READY**.
- This is a production Assessment schema gate blocker, not an AI-provider blocker.
- Client-side raw English error display was also a confirmed UX defect; the mini-program now normalizes generic HTTP 5xx errors through `friendlyRequestError`.

### Observation B — Provider guard behaves correctly

```text
页面：AI 保研评估
操作：点击“运行 AI 评估”
期望：真实 Provider 未配置时拒绝运行，不生成模拟结果
实际：弹窗“AI 模型尚未接入”，说明可保存结构化资料但不会生成模拟结果
截图：2026-10-03 11:28 用户真机截图
```

Result: **PASS for provider-unconfigured guard; real AI inference remains BLOCKED.**

### Observation C — Shared academic profile

```text
页面：个人资料 / AI 保研评估
操作：在评估流程使用本科院校、专业、年级、绩点、排名资料
期望：与个人资料共用已保存的学业资料，避免重复填写
实际：个人资料页显示同一组学业字段，用户确认同步符合预期
截图：2026-10-03 11:28 用户真机截图
```

Result: **PARTIAL PASS**; close/reopen persistence still needs a separate device retest.

## 5. Next device sequence

1. Developer Tools: assessment form → save complete draft → history → reopen draft → edit → save.
2. Use development/test assessment data: history → succeeded result → inspect evidence, similar cases, uncertainty, disclaimer and long text.
3. Result → history → reopen same result; confirm no new inference is triggered.
4. Real device: login → profile → internal ID → classroom → products → news.
5. Reconfirm WeChat customer service only if the experience build changed materially around that entry; no redesign is required.

## 6. Static acceptance fixes after 2026-10-03 device run

- Plan editor now routes backend failures through `friendlyRequestError` instead of exposing raw server messages.
- Student plan version timestamps are formatted for human-readable display.
- Teacher approve/reject actions now catch API failures and show a recoverable toast instead of leaving an unhandled async rejection.
- Product list now has an explicit empty-catalog state.
- No ECS, NPM, AI provider, schema migration, or customer-service architecture changes were made in this batch.

## 7. Real-device findings — 2026-10-03 12:34–12:39

### Issue D — Logged-in unbound user was sent back to Login

```text
页面：学堂
操作：用户已经完成微信登录，但尚未绑定九辰内部ID；进入“学堂”后点击“登录 / 绑定身份”
期望：已登录用户直接进入内部ID绑定页，不重复要求微信/手机号登录
实际：按钮再次进入登录页
截图：2026-10-03 用户真机反馈
```

Diagnosis: `classroom.ts` treated an authenticated `user` role as the same `guest` state as an unauthenticated visitor, and the CTA always navigated to `/pages/login/login`.

Fix: introduce an explicit `unbound` classroom state and route its CTA to `/pages/profile-edit/profile-edit`.

Status: **PASS** — user retested the updated flow and confirmed an already authenticated user now goes directly to internal-ID binding without another WeChat/phone login.

### Observation E — Test student identity claim

```text
页面：个人资料
操作：绑定 JCS-UD7D-2F9Z
期望：切换到学员身份并锁定该内部ID
实际：显示“身份绑定成功”，内部ID锁定，角色为“学员”
截图：2026-10-03 12:34 真机截图
```

Result: **PASS**.

### Issue F — Image schedule provider unavailable

```text
页面：导入课表
操作：上传课表图片
期望：Provider 可用时解析真实课表；Provider 未配置时给出明确产品提示
实际：后端返回 schedule_ai_provider_not_configured，旧 UI 直接显示原始错误码
截图：2026-10-03 12:37 真机截图
```

Fix: schedule import now routes backend codes through `friendlyRequestError`; provider-unconfigured state is explained in Chinese.

Status: **BLOCKED by schedule image AI provider / UI FIXED, RETEST**.

### Issue G — Supplied XLS schedule was not compatible with current parser

```text
页面：导入课表
操作：上传真实 .xls 文件
期望：识别星期表头与课程单元格并生成课程列表
实际：后端返回 schedule_spreadsheet_invalid
截图：2026-10-03 12:39 真机截图
```

The backend does accept `.xls` and reads it with the XLSX parser. The failure occurs after file acceptance, during canonical schedule parsing. The client now explains layout expectations instead of exposing the raw error code. Root-cause compatibility work requires the actual failing spreadsheet file.

Status: **FAIL for the tested file / source file needed for parser-specific repair**.

### Issue H — Position dimension cards were non-interactive

```text
页面：定位
操作：点击“评估维度”中的“待补充”
期望：直接进入对应资料编辑位置
实际：卡片和“待补充”均不可点击
截图：2026-10-03 12:35 用户批注截图
```

Fix:
- 学业基础 → 个人资料编辑；
- 英语能力 → AI 评估表单英语区；
- 科研经历 → 科研区；
- 竞赛实践 → 竞赛区；
- remove permanently hard-coded “待补充” semantics and present the chip as an action.

Status: **PASS** — user retested the updated Position dimension cards and confirmed the actionable edit links work as intended.

### Observation I — Plan cards did not render

The student did **not** miss a required “import schedule first” step. Schedule import is an independent tool and is not a prerequisite for plan cards.

The current student classroom request fails before `plans` can render because the production guidance schema is incomplete. This remains the same known Classroom schema blocker and must not be “fixed” by fabricating client-side plan data.

## 8. Lane C closure note — 2026-10-03

Final retest confirmations from the device owner:

- authenticated-but-unbound Classroom routing: **PASS**;
- Position dimension edit entry points: **PASS**.

Latest known branch state before this documentation update already included Lane C code fixes plus subsequent AI-lane work, and the latest branch CI was green.

Outstanding items intentionally left for follow-up rather than hidden:

1. Assessment Draft/History/Result production persistence remains dependent on the production `assessments` schema gate and real AI runtime readiness.
2. Classroom plan-card production acceptance remains dependent on the classroom guidance schema gate, including `coaching_records`.
3. Image schedule parsing remains dependent on the schedule multimodal AI provider.
4. The supplied real `.xls` schedule remains a parser compatibility FAIL; repair should be done against that exact source file.
5. Products and News still need their dedicated real-device acceptance pass.
6. News Official Account article/tag integration is recorded separately in `docs/product/news-official-account-integration.md`.

No ECS/NPM changes, production schema writes, or customer-service AI implementation were performed by Lane C during this acceptance batch.
