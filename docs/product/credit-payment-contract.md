# Credit Ledger + WeChat Pay V1 business contract

Status: **implementation foundation / production schema gate required**

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

The repository baseline confirms that a free quota exists but does **not** confirm its numeric amount.

Therefore:
- the grant quantity must be approved as an explicit product/deployment value before production;
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

No production SKU/price is invented by this batch.

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
- Assessment production schema must exist first because credit reservations/ledger reference `assessments`;
- run a read-only readiness check;
- obtain main-control approval;
- run only `db:upgrade:credit-payment`;
- configure official WeChat Pay merchant credentials/certificates outside Git;
- approve free-grant quantity and payment SKU/price;
- complete sandbox/real-device payment callback acceptance.
