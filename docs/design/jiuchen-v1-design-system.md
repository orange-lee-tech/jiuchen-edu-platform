# Jiuchen V1 Design System

Status: **IMPLEMENTATION SUPPORT DOCUMENT**

This file contains reusable visual primitives. It is subordinate to the approved experience architecture in:

`docs/design/jiuchen-v1-experience-blueprint.md`

Do not use this document to justify preserving an outdated page layout.

## 1. Visual direction

Target feeling:

**clear, calm, capable**

Avoid:

- generic all-white card wall **or washed-out all-gray screens**;
- oversized rounded SaaS cards;
- unrelated multi-hue education-marketing dashboards;
- black-purple “AI” styling;
- old enterprise gray-box UI.

The interface should be young through speed, hierarchy, purposeful color and directness — **not through either random decoration or color deprivation**. `clear, calm, capable` describes human comprehension, not a command to make everything pale.

## 2. Shape

V1 now starts with a **square-first / restrained-corner** direction.

- structural block: 0–8rpx;
- list row: 0rpx;
- standard button: 6–10rpx;
- input: 4–8rpx;
- modal: 8–12rpx when useful;
- status chips may remain pill-shaped.

Do not default every surface to 20rpx+ radius.

## 3. Surface hierarchy

Do not make all blocks pure white.

Starting tokens:

- Canvas: `#F2F4F6`
- Surface Primary: `#FAFBFC`
- Surface Secondary: `#EDF2F7`
- Surface Selected: `#E7EEF8`
- Human Note Surface: `#F4F1EA` — sparse use for teacher/human guidance

Lines:

- Line Strong: `#D8DEE6`
- Line Soft: `#E5E9EE`

Use secondary tonal hierarchy to group content before introducing new hues.

## 4. Text

- Text Primary: `#18202A`
- Text Secondary: `#5F6B78`
- Text Muted: `#89939E`

Suggested typography:

- Page title: 40–44rpx, 800.
- Section title: 30–34rpx, 700.
- Card / row title: 27–29rpx, 600–700.
- Body: 24–26rpx.
- Secondary/meta: 20–23rpx.
- Long text: 25–26rpx, line-height 1.72–1.85.

Chinese-first UI. Avoid unexplained English labels.

## 5. Brand and semantic color

Brand:

- Action Blue: `#2F6FED`
- Deep Blue: `#2459BE`
- Soft Blue: `#E7EEF8`

Use strong blue primarily for:

- main action;
- selected navigation;
- current / active state;
- meaningful link.

Semantic colors should be muted and sparse:

- success / confirmed: green;
- warning / due soon / needs confirmation: amber;
- error / destructive / overdue: red.

Do not give GPA / English / research / competition four unrelated colors merely to distinguish categories.

Do not use red to communicate normal academic weakness or competition pressure.

## 6. Color ratio and meaningful chroma

**Suggested starting balance, not a mechanical cap:**

- 70–80% neutral background / text / lines as the **overall canvas**;
- 15–25% secondary tonal or tinted surfaces;
- roughly <10% strong brand / semantic color for emphatic high-contrast areas, **with exceptions justified by the screen's actual communication needs**.

A useful screen must not become 90% undifferentiated gray. Meaningful brand blue belongs on selected tabs, a decisive primary CTA, the active stage and the user's current goal. Gentle blue-gray tinted surfaces can occupy more area without turning the page into a rainbow. Local green/amber/red may be used for actual confirmed/pending/destructive states, alongside readable status text and icons. Teacher guidance can use its approved warm-note surface.

**Color must encode priority, state, identity or actionable direction, not empty decoration**. Review the entire screen as a visual composition: focal point → supporting data → available action. Compare the result in low-brightness and grayscale to verify that hierarchy still works. One monotone card-wall and a five-color dashboard both FAIL this design review.

## 7. Spacing

Base rhythm: 8rpx.

- page horizontal padding: about 28rpx;
- major section gap: 28–36rpx;
- dense row vertical padding: 18–24rpx;
- related text gap: 6–12rpx.

Avoid both extremes:

- large meaningless empty space;
- compressed data walls.

## 8. Components

Reusable primitives may use the `jc-` prefix, but component reuse must follow the page contract in the Experience Blueprint.

Core families:

- buttons;
- field / select / search controls;
- section headers;
- task rows;
- change rows;
- status chips;
- state blocks;
- timeline / trajectory primitives;
- teacher / human guidance note;
- loading / empty / error.

Do not create a card abstraction just because two things have a border.

## 9. Interaction feedback and human-first action design

- interactive rows need pressed feedback;
- primary and secondary actions must be visually distinct;
- disabled action should explain why when necessary;
- loading should not blank the whole page if only one module is loading;
- errors should use product language, not raw backend strings.

### 9.1 Start with the human task, not the database

For every screen first write one sentence each: **who is using it, what they came to do, what the one next useful action is, and how success/failure is confirmed**. Then decide visual grouping and buttons. Do not expose raw API/status identifiers such as `claimed`, `available`, `student` as primary user labels. Translate to 已绑定 / 可认领 / 已暂停 / 学员 with contextual explanation when it changes a decision.

A list is a *recognition and action* surface, not a developer database dump: allow scannable one-line identifiers (with copy affordance), searchable/filtered lists when long, status adjacent to its subject, and one primary operation with reversible/sensitive secondary operations clearly distinguished. Avoid duplicated huge action buttons, hidden essential controls, or oversized instructional paragraphs above the thing people need.

### 9.2 Human interaction loop: perceive → decide → act → confirm → recover

- Before tap: make the actionable target and its result predictable from the label. Prefer “查看评估结果 / 保存规划草稿 / 恢复账号” over “确定 / 操作 / 业务” without context.
- During action: pressed/loading feedback, prevent accidental duplicate writes, preserve typed content, and retain surrounding context.
- After action: show actual server-confirmed result, next step, and updated state; never show success solely because a button was tapped.
- On error: explain in ordinary Chinese **what did not happen and what can be tried next**, preserving input and providing retry/exit.
- For irreversible or high-impact actions (delete / revoke / pay): indicate subject and consequence in a clear confirmation, make safe/cancel path obvious; do not place destructive and routine actions as visually equivalent adjacent targets.
- Use native WeChat affordances (action sheet, modal, navigation, share, upload, input controls) when they solve the task; do not reproduce platform behaviors as complex custom widgets.

### 9.3 Mobile physical and cognitive constraints

- Design for **actual WeChat phone viewport**, including safe area, native navigation and tabBar, not a desktop mockup. Measure in Developer Tools at both a narrow Android-sized preview and a typical phone; verify at least one real device when available.
- Long Chinese, long IDs, larger accessibility fonts, different screen ratios and keyboard appearance must not cause sideways scrolling, clipped buttons or unexpected line-breaking. Avoid a narrow ID column beside oversized actions: put ID/status on one coherent line; stack/reposition operations or use a contextual action sheet when needed. Check normal-size body text contrast toward WCAG 2.2 AA's 4.5:1 guideline, larger text toward 3:1, **on the actual paired foreground/background surface**; do not use whisper-light gray as the only copy color. These are practical accessibility references, not a claim of full WCAG certification.
- Keep adequate spacing between destructive and routine touch targets. Use WCAG 2.2 AA as a **reference** when inspecting WeChat touch/visual accessibility: non-exempt pointer targets at least 24×24 CSS px or satisfy target-spacing exceptions; favor comfortably larger primary actions. In the WeChat mini-program, check the rendered CSS-pixel hit area and physical tap behavior rather than blindly converting this to a fixed `rpx` width. Prevent tiny unlabeled icon-only taps.
- Use responsive `rpx` plus flex/grid and safe-area padding deliberately, not arbitrary constant widths. Respect line-height and readable typography; never shrink critical text to force an unworkable layout.
- Loading, empty, error and disabled states are **first-class designed screens**, with a useful explanation and next action when possible; no silent blank or fake counts.

### 9.4 Visual review is not optional

For a changed page, provide a screen-level review of **legibility, focal hierarchy, color meaning, information density, interaction placement and feedback**. Ask: can an ordinary unfamiliar user locate the next action within five seconds without instruction? Do a mental walkthrough for novice and returning users. A page that passes TypeScript but fails this review is **not an accepted UI deliverable**.

## 10. Long text

- no fixed desktop widths;
- 25–26rpx default for dense reading;
- line-height around 1.72–1.85;
- use headings and spacing before nested boxes;
- preserve evidence, uncertainty and disclaimers;
- never shrink text simply to fit more content.

## 11. Growth trajectory

The preferred recurring Jiuchen visual memory is:

**point -> line -> milestone -> direction**

Use it for real progression:

- academic stage;
- rank;
- grade;
- research state;
- publication state;
- plan milestones.

Never turn qualitative progress into fake numeric precision.

## 12. Existing sample batch status

The earlier Home / Position / Profile styling batch was exploratory.

It must **not** be treated as the final Jiuchen visual direction.

Future implementation should migrate stable pages toward this updated square-first, tonal-surface system while following the Experience Blueprint.
