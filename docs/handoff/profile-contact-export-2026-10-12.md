# Profile / Context contact / Assessment image — 2026-10-12

Branch: `p1/foundation`. Baseline: `ad64bdc2b5927db74405604ac757388fafb74479`.

## Actual state

- API typecheck/build: PASS. API tests: 175/175 PASS, including authenticated Profile GET → PUT → GET, nullable enrollmentYear, invalid values and unchanged role checks.
- Mini-program typecheck: PASS. Navigation/catalog/export tests: 78/78 PASS (67 existing/updated regression tests + 11 report tests).
- Remote code CI: PASS for `9ca6a97b0f0e05983df5ef186d2bb37e5fdd82b6` — Push run 38245865250 and PR run 38245869373. This subsequent documentation closeout records those completed runs; consult Actions for the documentation commit itself. Local tsx CLI cannot open its Unix IPC socket in this environment; equivalent test execution used `node --import tsx --test 'src/**/*.test.ts'`.
- Renderer QA: synthetic data, actual production layout/draw/PNG modules run through a native Canvas adapter. Summary 750×1028; long report 750×6910; decoded PNG inspected at top/middle/bottom. This is NOT WeChat device evidence.
- Production release/schema/backup/Profile HTTP acceptance: NOT RUN. Public `/health/live` returned ok=true, release=0.3.0-experience; `/health` returned database=ok. These public checks neither identify the actual active Git SHA nor verify enrollment_year/Profile. No SSH/DB access exists in this session. Earlier reports of b150d2c5 and the missing enrollment_year are historical evidence, not a fresh server audit.
- WeChat Developer Tools, upload, device and photo-album acceptance: NOT RUN.
- Global gate: BLOCKED. Do not write `PROFILE_CONTACT_EXPORT: PASS`.

| Module | Code / local checks | Production / device status |
|---|---|---|
| PROFILE | PASS | BLOCKED — live schema, verified backup, approval, migration and HTTP checks absent |
| CONTACT_SCHOOL | PASS | BLOCKED — device copy/paste/chat checks absent |
| CONTACT_ASSESSMENT | PASS | BLOCKED — device full-report copy/paste/chat checks absent |
| EXPORT_STANDARD | PASS | BLOCKED — actual WeChat canvas and album checks absent |
| EXPORT_LONG | PASS | BLOCKED — actual WeChat canvas and album checks absent |
| WATERMARK | PASS | BLOCKED — actual saved-image checks absent |

## User interaction contract

School visitor: current school → tap 联系老师 → fresh authenticated identity if logged in → Profile read for a bound student → genuine clipboard copy → one acknowledgement modal → existing WeCom entry → manually paste/send. Guest/unbound contact remains available and says 身份资料尚未绑定. Profile failure never blocks contact; missing fields are 未填写 plus a note when the Profile read is unavailable. No phone/OpenID/session token is included. No classroom fetch or cross-account cache is used.

Report owner: successful current record → contact copies the complete report (including generated summary, conditions, source references, full reference excerpts, uncertainties and disclaimer) → acknowledge → chat → manually paste/send. A changed account/token/report aborts. Copy failure offers retry and never opens chat or reports success. Contact and export buttons have busy protection.

Report owner: 下载报告 → 导出图片（摘要图） or 导出长图（完整报告） → render locally → save one PNG to album → genuine success/failure feedback. Existing Markdown/text/Word options remain. Summary selects first two entries per category with explicit per-field caps and full disclaimer; it explicitly identifies itself as a summary. Long output never truncates.

## Files and boundaries

Profile: `services/api/package.json`, `src/db/{profile-schema-contract.ts,profile-schema-contract.test.ts,check-profile-foundation.ts,upgrade-enrollment-year.ts}`, `src/routes/profile.test.ts`.

Contact: mini-program `utils/{customer-service.ts,consultation-payload.ts}`, `packages/schools/detail/detail.ts`, result page. `packages/schools/data.ts` fixes the baseline's duplicate address-property typecheck error; existing media/address values and fallback are retained. Navigation/catalog tests reflect the newly authorized consultation flow rather than the former identity-only modal.

Export: `utils/{assessment-report-export.ts,assessment-image.ts,report-png.ts}`, result TS/WXML, `tools/testing/report-export.test.cjs`, CI workflow. Page also exposes actual uncertainties/disclaimer to keep displayed/copied/exported semantics aligned. No navigation, Assessment API/runtime/model/prompt/RAG, credits/payment or timetable behavior changed.

## Export limits and watermark evidence

- Stable existing business identity number (the same JCS/JCT/JCA mapping exposed by Mine); never invent a UUID or expose an internal primary key as a public identifier. Unbound users have no public mapping: image export explicitly stops and asks for binding; complete text/contact remain usable.
- Anonymous image name 某学员; header/footer include business ID and Beijing export date; report date is separately labeled and formatted in Beijing time. Long identities wrap.
- Legacy WeChat Canvas reused at 750×≤800 per strip. Native `measureText` handles wrapping. The same absolute-coordinate grid continues across strips; background → watermark → body; no opaque cards hide watermark.
- Watermark: `某学员 · 用户ID：… · YYYY-MM-DD`, −25°, alpha 0.30 (70% transparency), repeated staggered muted blue-gray, baked into PNG pixels.
- Streaming palette PNG stores strips in one local file, rather than allocating a full-height RGBA Canvas. Blue-gray indexed palette retains text antialiasing; stored DEFLATE adds no image/npm/server dependency. Working strip RGBA ≈2.4 MB. Output budget ≤15 million pixels (at width 750, height ≤20,000), approximately ≤15 MB plus PNG headers. Larger reports fail explicitly; no unapproved paginated fallback or silent omission. Decoding a large PNG in the phone album can require more memory; device validation remains mandatory.
- Temporary generated PNG is deleted after success or failure. All text stays local; no third-party image service or ECS export workload.
- WeChat implementation references are the installed official miniprogram API typings (CanvasContext measureText/rotate/setGlobalAlpha/draw, canvasGetImageData, FileSystemManager writeFile/appendFile, saveImageToPhotosAlbum). Official documentation was queried; direct web retrieval was unavailable, so no platform hard size limit is claimed.

## Schema audit and approval gates

The original Profile route/schema already reads and writes `enrollment_year` and handles NULL. The production 500 cannot be repaired by a frontend change or restart. New `db:check:profile` queries only database name and information_schema; instance host is hashed, no URL/credentials/user rows are printed. Exit 2 means incompatible/incomplete schema, not execution failure.

Audited migration has one allowed DDL: `ALTER TABLE user_profiles ADD COLUMN enrollment_year INT NULL AFTER current_grade`. It checks all expected Profile column names/types/nullability; it stops if anything else is missing or incompatible, and is idempotent when the column already matches. It is never invoked at startup. No DDL was executed by this agent.

Before approval record: actual active release, hashed instance, actual DB name, current_grade presence/type, enrollment_year presence/type/nullability, all other missing/incompatible columns; verified backup location/hash/restore evidence; estimated table size and DDL lock risk; approved recovery steps. All are currently WAITING/NOT RUN. MySQL DDL is not covered by a normal ROLLBACK.

Use the separately supplied read-only ECS precheck before asking for migration approval. Then an authorized operator prepares an encrypted/restricted backup using existing DB access tooling, verifies it in an isolated restore target and reports the evidence. Backup commands must be finalized against the actual DB/available client configuration, never guessed or supplied with passwords on the command line. Restoring over production or dropping the new column are separate potentially destructive actions requiring specific approval. An additive nullable column normally remains during code rollback; immediately stop further writes if migration errors.

Only after explicit approval may a reviewed candidate's `db:upgrade:enrollment-year` run with securely inherited environment; use `db:check:profile` afterward. Do not run db:push/full db:migrate. Do not hand-edit the immutable current release. Candidate installation/build/promotion follow existing ECS runbooks, root-owned releases, approved-release/READY/jiuchen-promote, resource limits and runtime-user checks, with independent switch approval and rollback target captured from preflight.

## Acceptance order

1. ECS read-only schema/release precheck and reviewed backup plan.
2. Operator backup verification and exact migration approval; minimal DDL and schema recheck.
3. Authenticated Profile GET/PUT/GET with a designated test account; missing year remains NULL; no new enrollment_year 500s. Never send tokens or personal profile records into chat/logs.
4. Pull code on Windows; preserve local project.config.json; compile the correct `apps/miniprogram` project. Observe no runtime/Canvas failures. Upload remains a separate approval gate.
5. Phone: year edit/save/reopen; guest and bound-school contact; paste correct school's fields; open a real history result and paste its complete report; summary and long save into album; inspect top/middle/bottom, long text, citation/uncertainty/disclaimer, identity and watermark.
6. Repeat prior-PASS regression: real school pictures, schedule import, Monday first-week setting, correct semester in weekly schedule, AI draft save, actual successful run/persistence, historical reopen without re-run/recharge. No provider/model/prompt change is allowed.
7. Record actual version, code SHA, Actions run, device/base-library/OS and evidence. Only then close global gate.

Local sync (run from the actual checkout; stop if local changes conflict):

```powershell
git status --short
git switch p1/foundation
git pull --ff-only origin p1/foundation
git rev-parse HEAD
npm.cmd --prefix apps/miniprogram install
npm.cmd --prefix apps/miniprogram run typecheck
node --test tools/testing/miniprogram-navigation.test.cjs tools/testing/school-catalog.test.cjs tools/testing/report-export.test.cjs
```

WeChat project: `C:\Users\yulia\Desktop\jiuchen-edu-platform\apps\miniprogram`. Keep local `project.config.json` changes. A suggested new trial version may be assigned only after reviewing the last actual upload; do not infer it from repository version 0.1.0.

## Rollback

Capture prior release and branch SHA before action. Revert the contact/export commits together if reverting their shared helpers; code rollback alone does not undo a production DDL. Do not rewrite history/force-push. Failed ECS candidate switches use existing promote rollback to captured prior immutable release. Protect website/NPM/Harbor/Portainer/Docker/80/443/8088 and production secrets throughout.
