# Identity bootstrap controlled API candidate — 2026-10-08

Production base: `b9993dfe1e4c1c4be70cf75d8a48873d8bc8166c` (operator-reported; verify current before deploy).

Only backend identity files changed:
- `routes/identity.ts`: one-time admin ID self-claim, atomic first-claimer wins.
- `services/session.ts`: reject suspended, bound identities for all protected APIs.
- `routes/auth.ts`: reject suspended identity login.
- `routes/mobile-admin.ts`: pause, revoke, restore and self-mutation protection.

No schema migration. No UI, news, AI, payment or ECS configuration changes. If CI passes, deploy via existing immutable release pipeline and require real-device state-machine acceptance. Existing released JCA codes become bearer enrollment credentials: restrict distribution.
