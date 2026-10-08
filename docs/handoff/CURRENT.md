# CURRENT — Jiuchen delivery source of truth

Updated: 2026-10-08

This file is the only short pointer for active delivery. Dated handoff files are historical evidence and must not be treated as the active work queue unless linked from here.

## Active code line

- Integration / mini-program preview branch: `p1/foundation`
- Integration HEAD at last verified checkpoint: `fac0a7ae4f8c4099bd407db4da628c4c3a5c704e`; always check GitHub branch HEAD before local work.
- Production API release (operator-reported, pending independent current verification): `b9993dfe1e4c1c4be70cf75d8a48873d8bc8166c`
- Previous release: `5fc3dd15e48435df242734cc506b25155e7e7020`

Release-candidate branches used during the 2026-10-07 API rollout are frozen history. Do not use them for WeChat Developer Tools preview.

## Current delivery order

1. News operations gate: verify ECS `jiuchen-news-sync.timer` installed/enabled and last run result; perform one admin tag round-trip and re-sync-preserves-tags device check. Never assume timer activation merely from source files.
2. Native newsroom pending-classification reminder: admin may tag; teacher/staff can see count but may not change tags. No subscription template or server push is claimed.
3. Experience Blueprint Phase 1: refresh only affected hot-file map, then deliver native four-tab role-aware shell as one atomic navigation batch with compatibility tests. Avoid custom TabBar initially.
4. Archive the finished acceptance packages. Keep payment, model retraining, and current-week embellishment deferred.

## Latest real-device acceptance — 2026-10-07

- Classroom new preview path corrected to the active repository.
- Student can open/edit stage plans without a teacher being assigned.
- Imported schedule now feeds the GPA plan editor as editable course-prefill; user confirmed both the classroom hint and editor prefill on device.
- The schedule -> plan bridge does not auto-submit or auto-approve: student saves a pending revision, teacher approval still controls the formal record.
- Assessment background execution real-device flow passed: quick submit -> History running -> succeeded -> result reopen.
- Operator reports all 2026-10-08 release and real-device gates (PDF, DOCX, image, XLS, persistence) PASS; full logs/release status not independently observed in this chat.
- Assessment material import CAM/OCR permissions no longer treated as an open blocker based on operator acceptance.

## Already live / do not reopen

- Production API background Assessment execution.
- Assessment History running -> terminal state flow.
- Production Assessment evidence containment.
- Schedule parser fixes already present in the production base.
- ECS / DNS / HTTPS / NPM infrastructure migration.

## Client expectations on current p1/foundation

- Assessment report user-facing sections are continuous 01–06.
- Assessment form contains the material-import entry.
- Classroom top action is `导入课表`.
- `本周课表` is a convenience entry in the left timeline before `大一上`.
- Pre-junior-summer holidays expose English + competition planning.

If a phone preview contradicts these expectations while the local files match them, treat it as a Developer Tools/project-path/build-cache problem before changing product code.

## History rule

- Dated files under `docs/handoff/` describe what was true at that time.
- Release bundles are local artifacts, not repository history.
- Old release-candidate branches are frozen and must not become the working branch again.
- New work should update this pointer when the active branch, production release or delivery order changes.

## News gate notes — 2026-10-08

- The Official Account backend token/sync/content/charset chain had previously passed production.
- News timer code exists in `ops/ecs/jiuchen-news-sync.{service,timer}`, but no live `systemctl` output has yet been supplied for activation.
- Current client newsroom added an authorized in-app pending-classification count; admin list sorts unclassified first while preserving existing tags.
- A new article is not claimed to produce a device-level push notification. WeChat subscription template and user opt-in are separate and deferred.
- Once News operations acceptance passes, move directly to Blueprint Phase 1; do not restart infra, AI providers or commerce.
