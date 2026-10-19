# Lane C final handoff — WeChat / Product Device Acceptance — 2026-10-03

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Branch: `p1/foundation`

Lane C closure commit:
`dcad4745596609cc9c031f91b3d33ed1a12c9d4d`

Key device-fix commit:
`7b3cc39a70211a875b0219b94ab40e403fedacb2`

Latest CI on the closure HEAD:
- push CI: PASS
- PR CI: PASS

## Closed / accepted

- Mini-program core API uses ECS HTTPS.
- CloudBase Storage remains for temporary uploads.
- WeChat request legal domain is configured.
- WeCom human customer service is end-to-end PASS.
- Authenticated-but-unbound users no longer get sent through login again.
- Internal student ID claim is PASS.
- Position dimension edit links are PASS.
- Assessment form real-device rendering is PASS.
- Provider-unconfigured Assessment guard is PASS.

## Blocked / failed / not yet accepted

### Assessment
- Draft/History/persisted Result are blocked by missing production `assessments` schema.
- Real AI inference is not yet production accepted.
- Result long-text/evidence/similar-case real-device regression remains after production gate.

### Classroom
- Full Classroom/plan-card path is blocked by missing `coaching_records`.
- Do not fabricate client-side plans to mask the server failure.

### Schedule
- Image upload reaches backend but parsing is blocked by missing schedule AI provider.
- A supplied real `.xls` file reached the XLS parser but failed canonical schedule parsing.
- That parser issue requires the exact failing source file for regression work.

### Content
- Products full real-device acceptance: not run.
- News full real-device acceptance: not run.
- News Official Account/tag requirement is tracked separately in
  `docs/product/news-official-account-integration.md`.

### Roles
- Teacher/admin complete real-device role flows: not run.

## Canonical acceptance log

Use:
`docs/testing/wechat-product-device-acceptance-2026-10-03.md`

That file contains the detailed issue/action/expected/actual records.

## Lane closure rule

Do not keep Lane C alive as a permanent conversation.

Open a new acceptance conversation only when a concrete package is ready, such as:
- Assessment post-production device acceptance;
- Classroom/Schedule closure;
- Products/News acceptance;
- final UI polish.
