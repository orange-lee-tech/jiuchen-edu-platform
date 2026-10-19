# UI pre-Blueprint closeout — 2026-10-04

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Branch: `p1/foundation`  
Closeout baseline HEAD: `8b1a136d6a98ec03ca8cd16b486a377d3d1200b4`  
Status: **FROZEN / CLOSEOUT COMPLETE**

This document closes the current UI lane before Experience Blueprint Phase 0.

The purpose of this closeout is audit and handoff only. No page code, navigation, tabBar, Assessment, Classroom, Payment, AI, backend, schema, or deployment behavior is changed by this batch.

Related sources of truth:

- `docs/handoff/main-control-status-2026-10-04.md`
- `docs/design/jiuchen-v1-experience-blueprint.md`
- `docs/design/jiuchen-v1-design-system.md`

---

## 1. Current UI code touched by this lane

The early UI batch in this lane introduced or materially changed visual code in:

- `apps/miniprogram/miniprogram/app.wxss`
- `apps/miniprogram/miniprogram/pages/index/index.wxss`
- `apps/miniprogram/miniprogram/pages/position/position.wxss`
- `apps/miniprogram/miniprogram/pages/profile/profile.wxss`

Relevant exploratory commits:

- `72efb8413c402cbd5fd8ffb264a3ede2fedb1dff` — `style(miniprogram): establish V1 visual system`
- `7eb47e5cfb7e11ca142129a8132d7d4e8635f61b` — `style(miniprogram): avoid focus selector dependency`

The lane also authored the approved design/experience documentation:

- `docs/design/jiuchen-v1-experience-blueprint.md`
- `docs/design/jiuchen-v1-design-system.md`

The code batch was exploratory. The approved Experience Blueprint supersedes it as the product/UX direction.

---

## 2. Safe principles to preserve

The following principles from the early batch remain safe and useful even though the visual implementation will change:

### Typography hierarchy

Keep clear differentiation between:

- page title;
- section title;
- row/card title;
- body;
- secondary/meta text;
- long-form reading text.

### Interaction feedback

Preserve:

- visible pressed/active feedback for interactive rows and controls;
- clear distinction between primary and secondary actions;
- explicit disabled state;
- explicit loading / empty / error / success states.

### Mobile readability

Preserve:

- Chinese-first labels;
- readable long-text line height;
- no desktop-width content assumptions;
- no shrinking text simply to fit more information.

### State semantics

Preserve the idea that color and styling should communicate:

- active/current;
- confirmed/success;
- warning/needs confirmation;
- destructive/error;
- disabled.

Do not use color as the only carrier of meaning.

### Incremental adoption

The `jc-` namespace can remain as an implementation namespace where useful, but individual primitives must be re-evaluated against the approved Blueprint rather than treated as final components.

---

## 3. Exploratory primitives / expected replacement

The following current primitives or implementations are exploratory and must **not** be spread to additional pages as final design language.

### `.surface`

Current implementation:

- pure white surface;
- 22rpx radius;
- soft shadow.

Status:

**exploratory / expected replacement**

Reason:

The approved visual direction is square-first / restrained-corner with tonal surface hierarchy rather than an all-white rounded-card wall.

### `.jc-card`

Current implementation includes:

- white background;
- 22rpx radius;
- shadow.

Status:

**exploratory / expected replacement**

### `.jc-state`

Current implementation includes:

- 22rpx radius;
- white surface.

Status:

**exploratory / expected visual rewrite**

The semantic distinction between empty/error/success may be retained, but the container style should be redesigned.

### `.jc-button`

Current default uses:

- 18rpx radius.

Status:

**interaction semantics reusable; shape exploratory**

Approved starting direction is roughly 6–10rpx for standard buttons.

### `.jc-field`

Current default uses:

- 16rpx radius;
- white background.

Status:

**interaction/focus semantics reusable; surface/shape exploratory**

Approved starting direction is roughly 4–8rpx and should use the future tonal surface system.

### Pill usage

Current code uses large pill radii such as:

- `.jc-button--compact { border-radius: 999rpx; }`
- status tags/chips;
- Home consult button;
- role chips.

Pills are not globally banned, but should be retained only where chip/status semantics justify them.

---

## 4. Explicit conflicts with the approved square-first Blueprint

The following current code conflicts with the approved visual direction and is therefore visual debt, not a pattern to propagate.

### Global surface system

Current:

- many `#FFFFFF` surfaces;
- 16–22rpx structural radii;
- soft shadows as default grouping.

Approved direction:

- square-first / restrained-corner;
- structural blocks around 0–8rpx;
- two-level neutral / blue-gray tonal hierarchy;
- hierarchy through typography, spacing, dividers and tonal surfaces before shadows.

### Home visual language

Current Home still contains:

- Portal-style feature grouping;
- equal-weight shortcut blocks;
- multi-color shortcut tones:
  - blue;
  - violet;
  - cyan;
  - orange;
- multiple white `.surface` cards;
- brand/service/case/news modules competing for attention.

This conflicts with the approved lifecycle-driven Home model.

Do not “fix” this during freeze. It belongs to future Blueprint work.

### Position page

Current Position remains a permanent top-level AI assessment destination.

The approved Blueprint instead treats Assessment as:

```text
first profile
-> first assessment prominent
-> current positioning
-> meaningful changes
-> reassessment only when justified
```

This is an information-architecture mismatch, not a freeze-stage bug.

### Profile page

Current Profile still acts as a mixed entry surface for ordinary users, students, teachers and admins.

The approved Blueprint later separates role shells:

- Student: Home | Plan | Opportunity | Mine
- Teacher: Workbench | Students | Coaching | Mine
- Admin: Workbench | Users | Business | Mine

Do not pre-implement that shell in this closeout.

---

## 5. Current page status

### Home

Status:

**working current product page / exploratory visual layer**

Known debt:

- Portal information hierarchy;
- equal-weight entry blocks;
- colored category tiles;
- large-radius surfaces;
- not lifecycle-driven.

No clear UI-lane-created functional/display break was identified during this closeout audit.

### Position

Status:

**working current Assessment entry / exploratory visual layer**

Known debt:

- permanent top-level positioning mental model;
- large-radius controls and cards;
- white-card grouping.

No clear UI-lane-created functional/display break was identified during this closeout audit.

### Profile

Status:

**working current identity/service entry / exploratory visual layer**

Known debt:

- mixed-role shell;
- old rounded-card treatment;
- role/status chips using exploratory palette.

No clear UI-lane-created functional/display break was identified during this closeout audit.

### Global `app.wxss`

Status:

**contains reusable interaction ideas plus exploratory visual primitives**

Do not delete or broadly rewrite it during freeze.

Future Blueprint visual consolidation should intentionally replace the outdated shape/surface decisions.

---

## 6. Visual debt intentionally left open

The following work is **not complete** and is explicitly handed to future Experience Blueprint work packages:

1. map old five-tab navigation to approved role shells;
2. lifecycle-driven Home states;
3. Position/Assessment demotion from permanent top-level destination;
4. Classroom -> Plan mental-model migration;
5. News -> Opportunity mental-model migration;
6. Teacher workbench shell;
7. Admin workbench shell;
8. square-first structural surfaces;
9. two-level tonal surface hierarchy;
10. reduction of white-card density;
11. reduction of default 16–22rpx structural radii;
12. removal of category rainbow treatment on Home;
13. growth-trajectory visual language:
    - point;
    - line;
    - milestone;
    - direction;
    - before -> after;
14. consistent human-guidance visual treatment;
15. lifecycle/device acceptance for the new experience after implementation.

None of these should be started by the frozen UI lane.

---

## 7. Safe direction for future visual consolidation

When a later work package is explicitly released, start from the approved tokens/direction rather than the old primitives.

Approved starting direction includes:

- Canvas: `#F2F4F6`
- Surface Primary: `#FAFBFC`
- Surface Secondary: `#EDF2F7`
- Surface Selected: `#E7EEF8`
- Brand Action: `#2F6FED`
- Human Note Surface: `#F4F1EA`

Shape direction:

- structural block: 0–8rpx;
- row: 0rpx;
- button: 6–10rpx;
- input: 4–8rpx;
- modal: 8–12rpx where useful.

This closeout does **not** implement these changes.

---

## 8. Phase 0 hot files / conflict avoidance

Experience Blueprint Phase 0 must begin with mapping and must avoid opportunistic edits to current hot files.

High-conflict / hot surfaces include:

- `apps/miniprogram/miniprogram/app.json`
- `apps/miniprogram/miniprogram/app.wxss`
- `apps/miniprogram/miniprogram/pages/index/*`
- `apps/miniprogram/miniprogram/pages/position/*`
- `apps/miniprogram/miniprogram/pages/classroom/*`
- `apps/miniprogram/miniprogram/pages/plan-editor/*`
- `apps/miniprogram/miniprogram/pages/schedule-import/*`
- `apps/miniprogram/miniprogram/pages/profile/*`
- `apps/miniprogram/miniprogram/pages/profile-edit/*`
- `apps/miniprogram/miniprogram/pages/growth-profile/*`
- `apps/miniprogram/miniprogram/pages/assessment-form/*`
- `apps/miniprogram/miniprogram/pages/assessment-history/*`
- `apps/miniprogram/miniprogram/pages/assessment-result/*`
- Payment/commercial user-facing surfaces owned by the commercial lane.

Phase 0 should inventory:

- route mapping;
- `switchTab` / `navigateTo`;
- deep links;
- role shell constraints;
- backend contract requirements;
- active file ownership/conflicts.

It must **not** begin by modifying `app.json`, tabBar, Home, Assessment, Classroom or Payment.

---

## 9. Functional/display bug audit

Result:

**No code fix required.**

During this closeout audit, no clear functional or display break attributable to the UI lane itself was identified that justified changing page code under the freeze rules.

The known mismatches are design/architecture debt against the approved Blueprint, not freeze-stage regressions.

Therefore this closeout is docs-only.

---

## 10. Developer Tools / real-device status

This closeout batch does **not** modify mini-program code.

Therefore:

- WeChat Developer Tools was **not rerun** for this closeout;
- real-device acceptance was **not rerun** for this closeout.

The baseline supplied by main control reported:

- Push CI: PASS;
- PR CI: PASS.

Do not reinterpret CI as Developer Tools or real-device acceptance.

Future Blueprint implementation must perform Developer Tools and relevant real-device checks for changed lifecycle states.

---

## 11. Uncommitted UI work

Current closeout result:

- no page/code changes are introduced by this batch;
- no additional UI implementation work is being held back by this lane;
- no intentionally uncommitted UI code remains from this closeout work;
- the only new artifact is this handoff document.

This statement concerns this UI closeout lane. It does not make claims about unrelated developers' local working trees.

---

## 12. Freeze declaration

**当前 UI 分流已冻结，不再修改页面，等待 Experience Blueprint 新工作包。**

Effective immediately:

- no new page styling;
- no `app.json` / tabBar changes;
- no Home rewrite;
- no Assessment structure rewrite;
- no Classroom structure rewrite;
- no Payment page changes;
- no spreading old `jc-card` / large-radius visual language;
- no premature Experience Blueprint implementation.

The next allowed UI/experience activity begins only after main control issues the Experience Blueprint Phase 0 work package.
