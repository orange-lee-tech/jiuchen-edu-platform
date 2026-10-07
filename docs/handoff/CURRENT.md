# CURRENT — Jiuchen delivery source of truth

Updated: 2026-10-07

This file is the only short pointer for active delivery. Dated handoff files are historical evidence and must not be treated as the active work queue unless linked from here.

## Active code line

- Integration / mini-program preview branch: `p1/foundation`
- Integration HEAD at this update: `519295ae0c32832ee0969a7fa1fbd2271522abd0`
- Production API release: `5fc3dd15e48435df242734cc506b25155e7e7020`
- Production rollback release: `a90cf2dc8818d4cd5ffe74aa6e57e268d7b24ea6`

Release-candidate branches used during the 2026-10-07 API rollout are frozen history. Do not use them for WeChat Developer Tools preview.

## Current delivery order

1. Re-establish one unambiguous mini-program preview chain:
   `p1/foundation -> C:\Users\yulia\Desktop\jiuchen-edu-platform -> apps/miniprogram/project.config.json -> phone preview`.
2. Real-device acceptance of Assessment material import: PDF, DOCX, image.
3. Real-device acceptance of the exact WPS/CSU XLS schedule import, edit, save and reopen.
4. Close News operations/sync acceptance.
5. Start Experience Blueprint / full-site UI consolidation as the highest-priority next package.

## Latest real-device acceptance — 2026-10-07

- Classroom new preview path corrected to the active repository.
- Student can open/edit stage plans without a teacher being assigned.
- Imported schedule now feeds the GPA plan editor as editable course-prefill; user confirmed both the classroom hint and editor prefill on device.
- The schedule -> plan bridge does not auto-submit or auto-approve: student saves a pending revision, teacher approval still controls the formal record.
- Assessment background execution real-device flow passed: quick submit -> History running -> succeeded -> result reopen.
- Current remaining blocking product gate: production CAM OCR authorization for Assessment material import.

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
