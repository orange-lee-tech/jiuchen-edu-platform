# Real-device UX recovery — 2026-10-09

Source: user-shared 2026-10-09 screenshots (screenshots contain live-looking internal IDs; **do not duplicate IDs or personal information into documentation**). This is a live fault record, not blanket device PASS.

## Screenshot observations and implementation roots

1. **Four admin native tabs appeared to render the same blue workbench hero**, including the user's account page. The pages passed `slot="home|plan|opportunity|mine"` to `<role-shell>`, but `slot` is a reserved native slot-distribution attribute. The component separately declared `slot` as an ordinary property; binding was unreliable. Changed to `view-slot`/ `viewSlot` end to end and added contract regression; non-home pages now use compact header rather than repeating a full-screen workbench banner, and Mine displays no professional shell hero.
2. Student classroom **right top badge showed prior stage while right panel showed current-week schedule**: displayed `currentStageLabel` regardless `selectedView`. Badge now reads 本周课表 in week mode.
3. Student Home vertical action list **had unhelpful side gutters and icon/text centered in a narrow column**, consistent with WeChat `button` default margins. Explicitly reset button inline margins, give primary CTA full width, preserve each task as a full-row tap; homepage services use responsive two-column grid, narrow screen falls to one.
4. Home header informational caption used low-contrast dark text on deep blue. Lightened to readable pale-blue.
5. Developer Tools and real devices still required to verify touch, viewport, keyboard, safe area and 4 native role tabs. No screenshot proof of these new commits yet.

## Delivered follow-on code in this iteration

- First-user onboarding: 4 steps for initial logged-in `user`; separate four-step intro after first student/teacher/admin/staff role binding. Each account/role key locally remembers skip/finish; never stores a credential, never overrides server privileges.
- Website: welcome dialog with visit instruction and tappable URL **copy**, not fake automatic browser launch. Explicit warning of platform restriction; direct in-app `web-view` still waits for verified business domain.
- Assessment runtime **minimal prompt-only** clarification: unknown target -> `insufficient_data` and actionable evidence/teacher/customer-service guidance; distinguish credible case-backed comparison from fabricated facts; no guarantee. No schema/model/provider changes; **not deployed to ECS**. Official school-domain retriever remains a separate gate.

## Release gates

- Typecheck and CI for latest HEAD: see GitHub Actions, do not claim PASS before completed.
- WeChat Developer Tools / mobile screenshots, onboarding first-login/role-first transition, website dialog actual tap, full-admin ID list, classroom stage/week switch and news rich-text: **NOT RUN** in this GitHub editing session.
- Pending independent product/permissions specs: `docs/product/readonly-role-preview-contract-2026-10-09.md`; `docs/design/assessment-human-method-integration-2026-10-09.md`; existing Group Foundation / News group visibility / Assessment→customer service remain pending.

## Full client reconciliation protocol

Use actual local repo `C:\Users\yulia\Desktop\jiuchen-edu-platform\apps\miniprogram`. `git status --short`, then `git pull --ff-only origin p1/foundation` only if safe; preserve locally modified `project.config.json`. In official WeChat DevTools use compile → preview → device. Check 4 admin tabs and no repeated blue hero; verify ID search and action menus on narrow phone; week badge synchronized with right panel; student home touch regions; first-time visitor/user and newly bound role tutorial, skip and no repeat; website action non-deceptive. Keep screenshot evidence and short PASS/FAIL notes. Do not deploy API or migrate schema during UI acceptance.
