# API Core Closeout Release Candidate — 2026-10-07

Authoritative production base: `a90cf2dc8818d4cd5ffe74aa6e57e268d7b24ea6`.

This candidate is rebuilt directly on the currently active production ancestry after the server reported that release as current.

Delta is intentionally limited to:
- synchronized API package-lock for deterministic npm ci;
- Assessment material import (DOC/DOCX/PDF/image) and Tencent MultimodalDocParse adapter;
- Assessment import health/meta wiring and tests;
- Classroom graceful degradation when coaching_records is absent;
- Assessment consultant-style runtime guidance already accepted in the integration branch.

Already present in the production base and therefore not reapplied:
- Assessment durable background execution;
- Assessment notification adapter;
- current evidence containment/fallback behavior;
- WPS/CSU XLS parser fixes;
- DB cold-connect hardening.

Excluded:
- News timer/schema rollout;
- payment/credit productionization;
- Blueprint/UI;
- production schema writes.

The resulting services/api content is intended to match the previously verified fa741ac candidate API tree while restoring correct production ancestry.
