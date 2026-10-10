# 2026-10-10 API Release Candidate: actual production reconciliation

STATUS: CODE CANDIDATE ONLY. NO ECS DEPLOYMENT. STAGING, SCHEMA, AND MOBILE GATES OPEN.

## Verified baseline
- ECS operator observed ACTIVE=APPROVED=COMMIT=ea8c971008a9efd042ec43fdc62398e136262259. API active, /health/live ok, database ok.
- Old candidate 2919aeb62b430d19569e726d2109aa7c3aa40021 was based on b751287c, 5 commits older than live ea8c9710. DO NOT deploy that stale candidate.
- This branch starts from current production ea8c9710 and keeps Assessment evidence, material import/Tencent parser, admin ID bootstrap fixes and dependency lockfile.
- WeChat code is separately tracked at p1/foundation (last audited 18bfab53ba5c11372355a768ad56591fa0035095).

## Scoped server delta
- GET-only /me/read-only/students/:studentId and /me/read-only/teachers/:teacherId, reauthorize session and teacher assignment per request.
- Legacy /students/:id and /students/:id/classroom now enforce access; note existing anonymous demo callers may require migration.
- PUT /me/classroom/schedule-imports/:id/term-start-date validates a real Monday, current owner and parsed import, MySQL JSON_SET of only date, then reads it back.
- No new database migrations, payment enablement, AI provider changes or WeChat assets.

## Mandatory sequential gates
1. CI green for the exact new candidate SHA: API typecheck/tests/build; do not equate CI with runtime acceptance.
2. Immediately before release, compare ECS current, approved and COMMIT_SHA to ea8c971008a9efd042ec43fdc62398e136262259. If any differs, stop and rebase.
3. Read-only inspect schema for students, teachers, student_teacher_assignments, schedule_imports, user_profiles, student_plans, plan_items, plan_revisions, growth_records, assessments. Confirm columns referenced by the new routes.
4. Staging role matrix: admin may read any student/teacher; active assigned teacher only own students; inactive/unassigned teachers, students, staff and unauthenticated requests forbidden; revoke assignment and repeat request -> 403. Test large history/memory.
5. In staging only, verify invalid Sunday, nonexistent/foreign import, plus an authorized Monday saved and reread; compare all 13 pre-existing imported course rows before and after.
6. Authorized operator builds immutable root-owned release, verifies service user can traverse/read/node --check, approves exact commit and READY using established promote process; keep previous release for rollback.
7. Post-promote /health/live and /health; real-device admin/teacher/student read-only and Monday save/reload; if fails, authorized rollback.

## Boundaries
- Never deploy p1/foundation wholesale to ECS; its payment, identity and AI changes have separate gates.
- Do not touch jiuchenedu.com, NPM, ports 80/443/8088, Harbor, Portainer, Docker or firewall.
- Do not print secrets, run production DB migrations, or alter current symlink manually.
- WeChat UX release and this API release form a paired release train, not a single unverified branch.
- 172 universities and 316 geographic reference points are in the client source; many are third-party/approximate; only 5 schools have traced licensed photos. Separate batch media gate.

## Post-interruption security/route regression addition

- Security audit found `loadClassroom()` serializes the `student` argument, so passing a DB object containing `userId` exposed it inside `classroom.student`. Both full and `only=classroom` GET now use a strict public student allowlist.
- `pickClassroomStudent` regression asserts private user ID and unknown fields are absent.
- Monday validator extracted unchanged into pure domain module with date/leap/invalid-date tests.
- Fastify inject tests assert date-only and read-only GET routes exist and fail closed on missing DB, while mirror URLs do not accept write verbs.
- These deterministic checks do NOT replace the separate DB-backed authorization/revocation + real 13-course persistence staging acceptance.
