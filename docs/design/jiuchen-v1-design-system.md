# Jiuchen V1 Design System

Status: **IMPLEMENTATION SUPPORT DOCUMENT**

This file contains reusable visual primitives. It is subordinate to the approved experience architecture in:

`docs/design/jiuchen-v1-experience-blueprint.md`

Do not use this document to justify preserving an outdated page layout.

## 1. Visual direction

Target feeling:

**clear, calm, capable**

Avoid:

- generic all-white card wall;
- oversized rounded SaaS cards;
- colorful education-marketing dashboards;
- black-purple “AI” styling;
- old enterprise gray-box UI.

The interface should be young through speed, hierarchy and directness — not through decorative color.

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

## 6. Color ratio

Recommended starting balance:

- 70–80% neutral background / text / lines;
- 15–25% secondary tonal surfaces;
- <10% strong brand or semantic color.

The intent is visual rhythm without a “five-color dashboard”.

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

## 9. Interaction feedback

- interactive rows need pressed feedback;
- primary and secondary actions must be visually distinct;
- disabled action should explain why when necessary;
- loading should not blank the whole page if only one module is loading;
- errors should use product language, not raw backend strings.

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
