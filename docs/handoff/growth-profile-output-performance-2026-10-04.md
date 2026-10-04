# Growth Profile output + Mini Program performance handoff — 2026-10-04

Status: **P0/P1 stable; P2 DOCX path implemented; growth production schema write still gated**

## Goal

Keep one canonical undergraduate growth record and project it into resumes and
application materials without collecting the same facts again.

This batch also removes avoidable loading latency from the Growth Profile path.

## Git safety

This work was repeatedly rebased/reattached around the active Assessment Production
Gate work. No Assessment provider/runtime/prompt or ops gate file was overwritten.

## Data reuse

Canonical facts remain:

- `user_profiles`: university / major / grade / GPA-or-average / rank;
- `users` / `students`: identity;
- `growth_records`: only experience facts without an existing canonical table;
- existing Assessment inputs are source records and require user confirmation before
  they can become canonical growth records.

Resume and application data remain projections, not second copies of the biography.

## Loading and cache changes

### Server bootstrap

Initial Growth Profile rendering now uses:

`POST /me/growth-profile/bootstrap`

One canonical load produces:

- profile;
- all three resume projections;
- application projection;
- the first still-unconfirmed Assessment import candidate set;
- schema readiness flags;
- a canonical revision hash.

This replaces the previous profile + resume + application + assessment-history +
assessment-preview request fan-out.

### Mini Program cache

`growth-profile-cache.ts` uses native asynchronous WeChat Storage.

Policy:

- in-memory first;
- persistent `wx.getStorage / wx.setStorage`;
- 2-minute fresh window;
- up to 24-hour stale fallback;
- stale-while-revalidate behavior;
- user/internal-identity scoped key;
- canonical writes invalidate the cache.

Base academic-profile caching was also converted from synchronous Storage to the
asynchronous API. The API session token is held in module memory after the first
lazy Storage read, so each request does not repeatedly perform synchronous Storage
I/O.

### Package-size decision

Read-only repository tree measurement at this batch showed:

- 90 Mini Program source/asset blobs under `miniprogram/`;
- about 328 KB / 0.31 MiB total uncompressed Git blob size;
- no individual asset remotely close to a package-size pressure point.

Therefore broad subpackage/preloadRule migration is deliberately deferred. The
current latency problem is request/render waiting, not package download size.

Workers are also deferred because the Growth Profile path is network/DB bound and the
projection calculation is small.

## Growth production schema gate

Added read-only tooling:

`npm run db:check:growth-profile`

It validates the complete expected `growth_records` contract:

- columns;
- nullability/types;
- source-key uniqueness;
- user/type indexes;
- user foreign key.

This does not authorize or perform production schema writes.

## P2 — DOCX resume

Backend:

`GET /me/resume-artifacts/docx?target=general|technical|academic`

Properties:

- authenticated;
- projection is rebuilt from Canonical Profile;
- deterministic;
- no AI call;
- no separate resume fact store;
- private/no-store response;
- OOXML DOCX generated with `docx@9.7.1`;
- unit test verifies a real ZIP/OOXML buffer and checks that unsupported facts are not
  invented.

Mini Program:

The Growth Profile page now exposes **生成并打开 DOCX 简历**.

The native delivery path is:

`wx.request(arraybuffer) -> FileSystemManager.writeFile -> wx.openDocument`

Using the already-used request transport avoids adding a second external download
path merely for the document. The file is overwritten per resume target in the Mini
Program user-data sandbox instead of accumulating arbitrary temporary files.
`openDocument(showMenu=true)` leaves share/save actions with the user.

CloudRun debug transport is explicitly not treated as a document-binary transport;
the release/ECS path remains the supported document path.

## Why PDF is not marked complete

Do not add LibreOffice or headless Chromium to the small ECS merely to claim PDF
support.

A production PDF path must first solve:

- reliable Simplified Chinese font rendering;
- predictable one-page/two-page pagination;
- low memory footprint;
- licensing/embedding rules;
- acceptable output parity with the DOCX template.

Until that renderer is selected and verified, the product should expose DOCX rather
than a low-quality or font-broken PDF.

## AI / token policy

Normal operations remain zero-AI:

- canonical read;
- resume projection;
- application projection;
- DOCX generation;
- cache refresh.

AI remains reserved for:

- natural-language -> structured candidate extraction;
- JD relevance/reranking;
- bounded long-text adaptation.

AI may not write canonical facts without a Human Gate.

## Tests / CI

Passing CI covers:

- Mini Program typecheck;
- Admin build;
- API tests/build;
- Growth Profile domain tests;
- growth schema contract tests;
- DOCX model/generation tests.

## Remaining blockers

1. Production `growth_records` schema still requires explicit production schema
   approval before `db:upgrade:growth-profile`.
2. DOCX requires real-device acceptance after the API build containing the new route
   is deployed.
3. `services/api/package-lock.json` predates the newly pinned `docx@9.7.1`
   dependency. Current CI uses `npm install` and passes, but the lockfile should be
   regenerated before changing the project to `npm ci` or cutting a dependency-
   locked release.
4. PDF renderer remains intentionally undecided for the reasons above.

## Next adapter interface

Recruitment-site adapters should consume `generic-recruitment-v1` Application
Projection JSON. They must never read raw database tables directly.

Adapter flow:

`Canonical Profile -> Application Projection -> site field map -> Human Gate -> user submission`

No password storage, captcha bypass, security bypass or automatic final submission.
