# Credit Ledger + WeChat Pay V1 business contract

Status: **server and client virtual-payment scaffolding implemented / production schema, official-console contract and real-device payment pending**

2026-10-17 release status: user-proposed commercial parameters from 2026-10-09 are student free 5 runs, guest trial 1 run, RMB 1.9 for one assessment credit and RMB 16.9 for ten. The fixed e590 backend now enforces a guest grant of 1, student total of 5 via 1+4, and exact assessment SKUs of 190/1690 fen when the commercial gate is explicitly enabled. Fixed frontend 449 contains virtual-payment checkout and reconciliation. Production gates remain closed/unverified: at least three tables are absent, merchant account eligibility and official interface behavior are unverified, refund/reconciliation are incomplete. Historical sections below describe the initial JSAPI contract, not the approved virtual-payment release path. See [current review](../handoff/p1-paid-release-scope-and-schema-review-2026-10-17.md). The main release gate is tracked in [CURRENT](../handoff/CURRENT.md).

## Scope

This contract covers the deterministic commercial path only:

```text
trusted free grant or verified WeChat payment
-> credit ledger
-> available credit
-> Assessment reservation
-> AI execution
-> persisted successful result
-> one-credit debit
```

AI provider/model/prompt behavior is explicitly out of scope.

## 1. Source of truth

- Settled credit balance is the sum of `credit_ledger_entries.delta`.
- Ledger entries are created only by trusted server-side events.
- Clients never submit a trusted balance, paid state, ledger delta, or payment result.
- `credit_reservations` prevents concurrent Assessment runs from overspending the same settled balance.
- A reservation is not a settled debit.

## 2. Free Assessment quota

Current policy fixes the guest grant to 1 and student total to 5 via an additional 4. The production grant version and enabling action still require approval.

Therefore:
- the deployed grant amount must be 1 and the stable version approved before production;
- the grant event must use one stable grant version;
- one user + one grant version may be granted only once;
- idempotency key format: `free-assessment:<grantVersion>:<userId>`.

Do not silently hard-code an unapproved number of free runs into client code.

## 3. Assessment charging rule

One completed Assessment costs exactly **1 credit**.

State transitions:

1. Before calling the Assessment runtime, create or reuse one reservation for the Assessment.
2. Available credit = settled ledger balance minus active held reservations.
3. If available credit is insufficient, do not call the model.
4. If runtime succeeds **and** the validated result is persisted successfully:
   - atomically append ledger entry `assessment_debit = -1`;
   - idempotency key: `assessment-debit:<assessmentId>`;
   - mark reservation `consumed`;
   - set `assessments.credit_consumed = true`.
5. If provider/runtime/system execution fails terminally:
   - do not append a debit;
   - mark reservation `released`;
   - keep `assessments.credit_consumed = false`.
6. If execution has not reached a terminal business outcome, keep the reservation held for bounded recovery rather than guessing.
7. A retry of the same Assessment must reuse the same reservation/debit idempotency key.

The important business boundary is: **successful model response alone is not billable until the result has been durably persisted.**

## 4. Payment order

`payment_orders` stores server-created orders only.

Required invariants:
- `out_trade_no` is globally unique;
- amount is integer RMB fen;
- credit quantity is a positive integer determined by a server-side SKU/config, never by the client;
- client-provided price/credit values are descriptive at most and must not be trusted;
- a WeChat transaction ID can settle at most one order.

The current approved assessment-only catalog is 1 credit for 190 fen and 10 credits for 1690 fen; see `commercial-config.ts`. These are source values, not evidence of a live merchant checkout.

## 5. WeChat Pay callback idempotency

Callback processing must run in one database transaction after official signature verification and notification decryption:

1. Verify WeChat Pay signature/certificate before trusting payload fields.
2. Hash the received encrypted payload for diagnostics; do not persist payment secrets or raw sensitive payload by default.
3. Insert `payment_notifications.notification_id`; duplicate unique-key means this notification was already seen.
4. Lock the order by `out_trade_no`.
5. Verify merchant/order identity, amount, currency and success state against the server-created order.
6. If order is already paid with the same provider transaction ID, return success without a second grant.
7. If paid state conflicts with another transaction/amount, reject and alert; never "repair" by granting again.
8. Mark the order paid and append exactly one `payment_grant` ledger entry using:
   `payment-grant:<outTradeNo>`.
9. Mark notification processed and commit.
10. Only after commit return the provider success response.

The unique constraints on notification ID, order number, provider transaction ID and ledger idempotency key provide independent duplicate-notification protection.

## 6. Refunds and corrections

Refund business rules are not yet approved. The schema reserves order status `refunded`, but no automatic credit clawback is implemented by this batch.

Any manual correction must be:
- server/admin authorized;
- a new ledger event;
- traceable with a unique idempotency key and note;
- never a destructive edit of historical ledger rows.

## 7. Production gate

This batch does **not** authorize or execute production schema writes.

Before enabling the commercial path:
- confirm the Assessment parent table exists and is foreign-key compatible;
- run a read-only four-table readiness check and isolation restore drill;
- obtain independent approval for `db:upgrade:credit-payment`;
- verify official virtual-payment merchant eligibility, interface contract, product IDs, query, delivery and refund behavior;
- approve a stable free-grant version with guest amount 1;
- complete sandbox/real-device payment reconciliation acceptance. Legacy JSAPI credentials do not enable virtual checkout.


## 8. Implemented server contract

Implemented deterministic APIs:

- `GET /commercial/meta`
  - returns Assessment credit cost;
  - returns whether credit enforcement is enabled;
  - returns server-configured free-grant policy when one exists;
  - returns server-configured payment SKUs and WeChat Pay readiness.
- `GET /me/credits`
  - returns settled balance, held reservations, available balance and recent ledger.
- `POST /me/credits/free-grant`
  - accepts no client amount;
  - applies only the server-configured grant version/amount;
  - is idempotent through `free-assessment:<grantVersion>:<userId>`.
- `POST /me/payment-orders`
  - legacy JSAPI order creation is intentionally disabled with HTTP 503.
- `POST /me/virtual-payment-orders` and `POST /me/virtual-payment-orders/:id/reconcile`
  - create server-priced virtual orders bound to the authenticated openID and reconcile only verified WeChat query results; require explicit virtual-payment configuration and real-device validation.
- `GET /me/payment-orders/:id`
  - returns only the authenticated user's order state.
- `POST /payments/wechat/callback`
  - consumes the raw callback body;
  - verifies the WeChat Pay platform signature;
  - decrypts the APIv3 resource;
  - checks merchant/app identity and successful transaction state before settlement.

The legacy JSAPI adapter/callback remain in source for historical compatibility review; they are not the current credit checkout path. Virtual checkout uses `wx.requestVirtualPayment`, signed order parameters and server query/reconciliation.

## 9. Production-safe Assessment integration

The live Assessment route is wired to the commercial lifecycle behind:

`CREDIT_ENFORCEMENT_ENABLED`

Default is `false`.

When disabled:
- the existing Assessment runtime/persistence behavior remains unchanged;
- no credit/payment table is required for Assessment to run.

When explicitly enabled:
1. apply the configured free grant idempotently, if one exists;
2. lock the user commercial state;
3. create/reuse the Assessment reservation;
4. refuse to call the model if available credit is insufficient;
5. execute the already-selected Assessment runtime unchanged;
6. on terminal runtime failure, atomically persist failure and release the reservation;
7. on runtime success, persist the validated Assessment result and the one-credit debit in the same database transaction;
8. only then mark the reservation consumed and `assessments.credit_consumed=true`.

If model execution succeeds but result/debit persistence cannot commit, the Assessment remains non-terminal with the reservation held. No settled debit is created.

Retries reuse:
- unique reservation by `assessment_id`;
- debit key `assessment-debit:<assessmentId>`.

## 10. Concurrency and reservation semantics

Commercial mutations lock the canonical `users` row before balance-sensitive ledger/reservation work. This serializes concurrent credit decisions for one user.

Available balance is:

`SUM(credit_ledger_entries.delta) - SUM(held credit_reservations.amount)`

A held reservation continues to reduce available balance even after its `expires_at` timestamp. The timestamp is a recovery diagnostic boundary, not an automatic grant-back rule. This intentionally avoids overspending when an Assessment process has an unknown outcome.

A future recovery/reconciliation operation may release stale holds only after it can prove the Assessment is not still executing.

## 11. Server configuration contract

Current code fixes the assessment SKU catalog at 190/1690 fen and checks `CREDIT_FREE_GRANT_AMOUNT=1` when enforcement is enabled. Required deployment values:

- `CREDIT_ENFORCEMENT_ENABLED` (off until approval), `CREDIT_FREE_GRANT_VERSION` (stable), `CREDIT_FREE_GRANT_AMOUNT=1`;
- `CREDIT_PAYMENT_SKUS_JSON` is optional; if supplied under enforcement it must match the approved catalog exactly;
- `WECHAT_VIRTUAL_PAY_ENABLED`, `WECHAT_VIRTUAL_PAY_PRODUCTION_APPROVED`, `WECHAT_VIRTUAL_PAY_ENV`, `WECHAT_VIRTUAL_PAY_OFFER_ID`, `WECHAT_VIRTUAL_PAY_APP_KEY`, `WECHAT_VIRTUAL_PAY_PRODUCT_ONE`, `WECHAT_VIRTUAL_PAY_PRODUCT_TEN`, and the existing `WECHAT_APP_ID` for virtual checkout.

The `WECHAT_PAY_*` APIv3 JSAPI configuration is legacy and is not a substitute for virtual-payment eligibility or an approval. Check actual environment names/presence only; never reveal values.

Secrets remain server-side and are never committed to Git.

## 12. Read-only production schema gate

Run:

`npm run db:check:credit-payment`

The checker validates all four commercial tables, including:
- required columns and nullability;
- order number / transaction ID uniqueness;
- ledger idempotency-key uniqueness;
- reservation uniqueness by Assessment;
- notification ID uniqueness;
- required indexes and foreign keys.

This checker performs no schema write.

Production migration remains:

`npm run db:upgrade:credit-payment`

and still requires explicit main-control approval.
