# Jiuchen V1 Design System

Scope: WeChat mini-program V1 visual layer. This system must not change business rules, fabricate data, or hide blocked/error states.

## 1. Typography

- Page title: 40–44rpx, 800.
- Section title: 32rpx, 700.
- Card title: 27–29rpx, 700.
- Body: 24–26rpx, regular/medium.
- Secondary/meta: 20–23rpx.
- Long text: 26rpx, line-height about 1.8.
- Chinese-first UI: avoid unexplained English labels in user-facing controls.

## 2. Spacing

Base rhythm: 8rpx.

- Page horizontal padding: 28rpx.
- Major section gap: 32–36rpx.
- Card internal padding: 20–32rpx by density.
- Related text gap: 6–12rpx.
- Avoid large empty blocks unless they express a real state.

## 3. Color semantics

- Brand/action: #2f6fed.
- Main text: #1f2733.
- Secondary text: #66707d to #8b929d.
- Border/divider: #e8ebf1 / #eceef2.
- Page background: #f6f7fb.
- Success: green semantic treatment.
- Warning: amber semantic treatment.
- Error/destructive: red semantic treatment.
- Disabled: neutral gray; never present disabled controls as active blue.

Color must communicate state consistently, not decoration only.

## 4. Components

Reusable primitives live in `app.wxss` with the `jc-` prefix:

- `jc-button`: primary, secondary, outline, ghost, danger, compact, disabled.
- `jc-field`: standard input container, focus and disabled states.
- `jc-card`: standard surface; `jc-card--interactive` adds pressed feedback.
- `jc-tag`: default/success/warning/error/neutral.
- `jc-state`: loading/empty/error/success container.
- `jc-spinner`: lightweight loading indicator.
- `jc-rich-text`: mobile long-text baseline.
- `jc-section`, `jc-section-head`: section hierarchy.

Existing pages can migrate gradually. Do not force unstable feature pages into a visual rewrite.

## 5. Interaction rules

- Interactive cards and rows must have a visible pressed state.
- Primary action should be visually dominant; secondary actions should not compete.
- Touch targets should generally be near or above 80rpx in height.
- Disabled, loading, empty, error and success states must be visually distinct.
- Do not use a static “photo-like” card when the element is meant to behave like a control.

## 6. Mobile long text

- Default body width is the available card/page width; no fixed desktop-width blocks.
- Use 24–26rpx for dense body content and about 1.7–1.85 line-height.
- Separate long sections by headings and spacing rather than excessive nested cards.
- Preserve all necessary evidence, disclaimers and source information.
- Do not reduce font size merely to fit more content on one screen.

## 7. First sample batch

Applied without changing business logic:

- Home: denser hierarchy, explicit pressed feedback, stronger service/content distinction.
- Position: clearer primary/secondary actions, editable profile rows, actionable dimension cards.
- Profile: clearer identity/workbench hierarchy, menu feedback, destructive action separation.

Assessment, Classroom and Payment should only consume the shared design primitives until their business flows stabilize.
