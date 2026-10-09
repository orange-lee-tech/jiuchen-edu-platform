# Codex execution handoff — Jiuchen Experience Phase 1a

Date: 2026-10-09 · Branch: `p1/foundation` · Gate: **AUTHORIZED FOR BOUNDED PHASE 1a CODE WORK**. This document is not evidence that Phase 1a implementation exists.

**Start reading:** `CONSTITUTION.md` → `AGENTS.md` → `docs/product/v1-baseline.md` → `docs/handoff/CURRENT.md` → `docs/design/jiuchen-v1-experience-blueprint.md` → `docs/design/jiuchen-v1-design-system.md` → `docs/handoff/experience-blueprint-phase0-map-2026-10-04.md` (dated historical inventory only).

## A. Preconditions and Git hygiene

1. Record `git status --short`, `git fetch origin`, `git rev-parse HEAD` and verify upstream before editing. `git pull --ff-only` only when it preserves local modifications. **Never** `reset --hard`, clean untracked work or overwrite local `apps/miniprogram/project.config.json` (known locally modified).
2. Real mini-program source is `C:\Users\yulia\Desktop\jiuchen-edu-platform\apps\miniprogram`; the old `jiuchen-edu-client-gate` copy is archived. Confirm correct WeChat Developer Tools project before preview.
3. Read `app.json` and search all `wx.switchTab`, `wx.navigateTo`, `wx.redirectTo`, `wx.reLaunch`, login, claim, logout, 401 and deep-link uses. As of Gate 0, five tabs and **21** registered pages exist; the 2026-10-04 Phase 0 map had fewer pages. Update **only changed hot-file/route mapping**, not the full Phase 0 report.
4. Preserve official WeChat APIs, CloudBase Storage initialization, ECS request transport, user agreement, assessment draft/history/read, schedule and teacher review, news detail, product detail, human customer service. Shared hot files are owned by this single navigation batch; avoid simultaneous overlapping lane edits.

## B. Phase 1a: precise bounded scope

Use **native tabBar**, no custom tabBar or imported navigation framework. Exactly four static physical pagePaths in `app.json`: 
`pages/index/index` | `pages/classroom/classroom` | `pages/news/news` | `pages/profile/profile`.
Keep `pages/position/position` as a registered **non-tab** Assessment destination. Coordinate all legacy `switchTab('/pages/position/position')` call sites in the same atomic change: use legal non-tab navigation and preserve valid deep links.

| Server role | index | classroom | news | profile |
| --- | --- | --- | --- | --- |
| no session / `user` / `student` | 首页 | 规划 | 机会 | 我的 |
| `teacher` | 工作台 | 学员 | 辅导 | 我的 |
| `staff` (compatibility fallback) | 工作台 | 学员 | 辅导 | 我的 |
| `admin` | 工作台 | 用户 | 业务 | 我的 |

One central role/navigation mapping rather than strings scattered across pages. `staff` **stays staff**, labeled 内部员工 in identity UI, and inherits ONLY existing teacher-workspace surface/backend permissions—not admin privileges. Product has not approved a permanent distinct staff shell; this is a safe temporary compatibility mapping, **not** an expanded authorization rule. The existing profile already treats staff with teacher menus.

`wx.setTabBarItem` updates tab text/icon **not pagePath**; static four paths are immutable at runtime. Unknown roles/auth-loading get safe neutral content, never briefly display another account's sensitive widgets. Refresh shell from server-validated auth on cold/warm start, onShow, login, JCA/JCT/JCS binding, logout/deletion and 401. Client cached role is presentation only; server remains permissions authority.

Teacher/admin physical `classroom`/`news` slots must show role-appropriate actions/links already backed by the existing API, **not** mislabel student planning/news as a functional admin dashboard. Use safe actions or factual empty/error states if authorized data is absent. No fake operational counts, pending review or unread alerts. Do not silently navigate to admin-only routes from staff/teacher.

Deep-link compatibility to preserve and test: assessment form `id`, `section` (english/research/competition); result `id`; plan editor `stage,type,studentId,studentName`; admin `section`; product detail `documentKey`; News article detail `id`. Existing `position` external path stays registered. Never supply query to `switchTab`. If implementing login-intent restore, accept only enumerated destinations and validated params; don't replay `run/save/pay`, leak session tokens or restore across accounts. Direct launch into a restricted page must have a safe home/profile fallback, not only `navigateBack`.

## C. Hard exclusions / dependencies

- **No API, database migration, ECS, NPM, Nginx, production release, environment, payment/credit, Assessment model/runtime or CloudBase adapter change** in Phase 1a.
- Phase 1b lifecycle Home requires separately reviewed **read-only** `HomeExperienceSnapshot` (latest-success/draft, role, stage, assignments, plan, source revision/readiness) and must not be fabricated from first 50 assessment records, hidden mentors, dates or other misleading proxies. Phase 1a does not create this API or make multiple heavy bootstrap requests to simulate it.
- No fictional ranked university database, deadlines, grade trends, service hours, cases, teacher records, AI credit balance or labels. Real OA articles are not yet a structured opportunity catalog.
- No broad color/skin sweep or full admin ID table redesign in Phase 1a; existing narrow-screen admin ID cards are known Phase 4 UX debt. Do not change identity lifecycle write semantics to fix visual overflow.
- Commercial merchant/SKU/free grant/refund/Pay and News systemd timer checks remain separate non-blocking release/operations gates. WeChat subscription template not configured; do not claim a push notification is working.

## D. Acceptance gate — ordinary humans on real phones

- No illegal `switchTab(position)`; exactly four static native tabs with correct labels, safe role switches, and no guest-to-admin data flash.
- Role/device matrix: guest, unbound user, student, teacher, staff fallback, admin; cold open, return from background, role binding, logout, expired session, account deletion, deep link from cold start and missing back-stack. No repeated WeChat login after successfully binding internal ID.
- Core routes survive: Assessment draft→history→result re-read without new model run/charge; Classroom stage plan→pending review; genuine XLS/image schedule import; news detail native reader; product `documentKey`; human customer service; admin menu `section`.
- **Now**, not postponed to Phase 5: test narrow screen, system font enlargement, long Simplified Chinese, tapped/disabled/loading/error/empty states, no horizontal overflow, no broken ID across lines. Primary action must be perceptible within ~5 seconds. Prefer `rpx`/flex/responsive measurement against Developer Tools and device screenshots; no desktop-width guesses.
- Apply approved restrained square-first, blue/neutral hierarchy and Chinese-first labels *within changed surfaces*; systematic visual unification is later Phase 5. Never add a pretty skeleton whose buttons cannot work.
- Run `npm --prefix apps/miniprogram run typecheck` (Windows: `npm.cmd`), existing project checks, GitHub Push/PR CI; **actual** WeChat Developer Tools and device verification separately. No promise of an npm miniprogram build script if none exists.
- Deliver baseline HEAD, new HEAD, commit(s), exact paths, changed role states/routes, CI statuses, DevTools/real-device PASS/FAIL/NOT RUN, screenshots, known remaining gates and a **coherent revert path for app.json plus switchTab changes together**.

## E. Stop criteria

Stop the affected subtask and report the precise conflict if local edits overlap, staff would be promoted to admin, auth source is ambiguous, cross-role leakage appears, a read-only server contract is needed, official WeChat APIs behave differently in DevTools, an external QR path is unknown or permission would be broadened. Do not let such a conflict cause unauthorized production/schema/AI changes; complete independent safe scope where possible.

After Phase 1a, update `docs/handoff/CURRENT.md` with **actual** code/CI/device results. Phase 1b requires its own reviewed contract and release gate.
