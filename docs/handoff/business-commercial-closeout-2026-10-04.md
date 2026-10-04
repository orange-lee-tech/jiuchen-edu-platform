# Business / commercial closeout — 2026-10-04

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Branch: `p1/foundation`  
Baseline HEAD: `d26f2bc4f0b17f34fb085f64a5cecab5095264aa`

Scope is limited to deterministic Credit / Payment closeout. Assessment Runtime,
Prompt, Provider, Experience Blueprint, navigation, News and Classroom are not part
of this closeout.

## DONE

### Credit Ledger / read model

Implemented:

- settled balance = ledger sum;
- held reservation balance;
- available balance = settled - held;
- recent ledger read model;
- server-only ledger writes;
- per-user transaction serialization by locking the canonical `users` row.

### Free grant contract

Implemented:

- no hard-coded free quota;
- server-only `CREDIT_FREE_GRANT_VERSION` + `CREDIT_FREE_GRANT_AMOUNT`;
- idempotency key `free-assessment:<grantVersion>:<userId>`;
- explicit `POST /me/credits/free-grant`;
- lazy idempotent grant before an Assessment reservation when enforcement is enabled.

### Assessment reservation / debit / release

Implemented behind `CREDIT_ENFORCEMENT_ENABLED=false` by default:

- one Assessment costs 1 credit;
- reserve before model execution;
- concurrent Assessment runs cannot overspend one user's balance;
- insufficient available credit prevents the model call;
- retry reuses the same reservation;
- runtime terminal failure persists failure + releases held credit atomically;
- provider-unavailable reset releases held credit;
- successful model output is not billable by itself;
- successful Assessment result persistence + `assessment_debit=-1` + reservation
  consumption + `assessments.credit_consumed=true` commit atomically;
- persistence/settlement failure keeps the reservation held and does not create a
  settled debit.

Assessment Runtime/provider/prompt code was not modified.

### Payment order

Implemented:

- client submits only `skuKey`;
- server SKU determines RMB fen and credit amount;
- server generates `out_trade_no`;
- authenticated order status readback;
- user WeChat openid comes from canonical server account data.

### WeChat Pay API v3 boundary

Implemented:

- JSAPI request signing with merchant RSA private key;
- signed WeChat Pay API response verification before trusting `prepay_id`;
- Mini Program payment parameters signed server-side;
- raw callback signature verification;
- platform serial validation;
- APIv3 AES-256-GCM resource decryption;
- merchant/app/success-state validation;
- encrypted callback payload SHA-256 diagnostic hash.

### Callback settlement / idempotency

Implemented transactionally:

- notification ID unique guard;
- payload-hash conflict guard;
- order row lock;
- exact server amount match;
- provider transaction ID uniqueness;
- already-paid/same-transaction idempotent success;
- conflicting transaction rejection;
- exactly one `payment_grant:<outTradeNo>` ledger grant;
- notification processed only in the committed settlement.

### Production readiness tooling

Implemented read-only:

`npm run db:check:credit-payment`

It validates the full four-table schema/index/FK contract.

## READY BUT NEEDS EXTERNAL CONFIG

Real WeChat Pay code path is ready but remains unconfigured until the owner provides
and deploys:

- merchant ID;
- APIv3 key;
- merchant certificate serial;
- merchant RSA private key;
- WeChat Pay platform certificate/public key and serial;
- HTTPS callback URL;
- approved server-side SKU JSON;
- approved free-grant version and numeric amount.

No placeholders are treated as production values.

## NEEDS PRODUCTION SCHEMA GATE

Not executed in this closeout:

`npm run db:upgrade:credit-payment`

Production still needs explicit approval to create/verify:

- `payment_orders`;
- `credit_ledger_entries`;
- `credit_reservations`;
- `payment_notifications`.

Do not set `CREDIT_ENFORCEMENT_ENABLED=true` before this gate passes.

## DEFERRED

Intentionally not included:

- recharge/payment Mini Program UI;
- production SKU/price decision;
- numeric free quota decision;
- refunds / automatic credit clawback;
- admin credit correction UI;
- automatic stale-reservation reconciliation;
- automatic pending-order expiry/closure worker;
- real-device WeChat Pay acceptance;
- Payment sandbox acceptance where applicable.

These are not required to preserve the current deterministic server boundary.

## Growth Profile

No Growth Profile feature expansion was performed in this closeout.

Existing state remains:

- canonical fact model;
- user-confirmed Assessment fact reuse;
- deterministic Resume/Application Projection;
- DOCX generation/opening;
- cache and stale-race fixes.

Its independent production `growth_records` gate is unchanged.

## Assessment route modification declaration

Yes: `services/api/src/routes/assessments.ts` was modified only to add the
feature-gated deterministic credit lifecycle described above.

No Assessment AI Provider, Prompt, retriever, model selection or Runtime behavior was
changed.

With `CREDIT_ENFORCEMENT_ENABLED=false`, the existing production Assessment path
does not depend on the new commercial tables.

## Files / modules owned by this closeout

Primary commercial modules:

- `services/api/src/domain/credit-policy.ts`
- `services/api/src/services/commercial-config.ts`
- `services/api/src/services/credit-ledger.ts`
- `services/api/src/services/payment-orders.ts`
- `services/api/src/services/wechat-pay.ts`
- `services/api/src/routes/commercial.ts`
- `services/api/src/db/credit-payment-schema-contract.ts`
- `services/api/src/db/check-credit-payment-foundation.ts`
- `services/api/src/db/upgrade-credit-payment-foundation.ts`
- `docs/product/credit-payment-contract.md`

## Stop boundary

After this closeout is committed and CI is green, this business lane stops modifying:

- Assessment Runtime / Provider / Prompt;
- Growth Profile feature scope;
- Experience Blueprint;
- app navigation / tabs;
- News;
- Classroom;
- ECS / NPM / HTTPS;
- payment UI.

Further work requires main-control reassignment.
