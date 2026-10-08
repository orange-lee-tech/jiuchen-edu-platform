# Identity bootstrap V2 frozen production candidate — 2026-10-08

Actual production version confirmed by ECS read-only audit: `b9993dfe1e4c1c4be70cf75d8a48873d8bc8166c` (`OLD_BLOCKS_ALL_JCA`).

Candidate scope (6 API files only):
- normalize full-width admin/student/teacher IDs on the server;
- classify unknown/disabled/already-claimed codes separately;
- allow first-time available JCA admin ID self-enrollment with atomic claim;
- preserve admin pause/revoke/restore and session enforcement;
- tests for input normalization, first admin enrollment and disabled/claimed behavior.

No migration, schema alteration, payment, AI, News or frontend edits.
IMPORTANT: ECS audit of a sampled input showed LOOKUP=NOT_FOUND. Production contains an available admin record for batch `acceptance-20261008`, but input must be validated against actual available record locally without publishing the code.

Deploy only after GitHub CI and isolated ECS build/test pass. Verify active release is `b9993dfe1e4c1c4be70cf75d8a48873d8bc8166c` and preserve rollback. Avoid claiming success until a real JCA login and role visibility test pass. This candidate does not alter any DB identity values by itself.
