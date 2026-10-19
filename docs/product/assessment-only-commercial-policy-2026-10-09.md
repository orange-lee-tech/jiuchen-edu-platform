# Assessment-only payment, free allowance, and analytics contract
Date: 2026-10-09
Authority: product owner; code status: IN GITHUB / NOT PRODUCTION RELEASED.

## 2026-10-17 correction (overrides historical JSAPI client and adapter status)

Fixed API e590 and active-source 8cc4 contain the virtual-payment adapter and server catalog; fixed frontend 449 calls `wx.requestVirtualPayment` and exposes order reconciliation. The old `POST /me/payment-orders` remains 503 and `wx.requestPayment` is not the current checkout. This is code/unit-test status only: production schema, official merchant-console eligibility and API contract, real-device payment/cancel/delivery/refund are pending. [Exact release review](../handoff/p1-paid-release-scope-and-schema-review-2026-10-17.md). Historical statements below are superseded where they conflict.

## Commercial source of truth

- **No course checkout.** Courses are informational and go to human consultation; no course SKU, online course order, or merchant payment. Do not remove shared WeChat payment infrastructure merely to pretend RAM savings; measure bundle/service utilization and only delete demonstrably unused course checkout code.
- Assessment: 1 credit per **completed and durably persisted successful** AI assessment; failure releases, unknown outcome reserves; history rereads cost zero.
- Guest: authenticated WeChat account with server role `user` receives **1** lifetime grant under a stable grant version. Student: same account receives +4 under a separate idempotent version after verified role change, for **5 total**; it does not receive 1+5. Teachers, staff, administrators cannot run or buy assessment credits.
- Server-approved WeChat Pay SKUs:
  - `assessment-1`: 1 credit, **190 fen / ¥1.90**.
  - `assessment-10`: 10 credits, **1690 fen / ¥16.90**.
  - Both provider order `description` = **小程序AI评估费用**; never include name, resume or school.
  - ¥1.90 × 10 = ¥19.00; compared with ¥16.90 the valid saving is **¥2.10**, not ¥3.10. This corrects the user's conflicting discount annotation without altering the approved selling price.

## Server-side enforcement

Existing `credit_ledger_entries` is the truth of settled credits, `credit_reservations` guard concurrent runs, `payment_orders` and verified WeChat Pay API v3 callbacks settle payment idempotently. Prices and quantities determined by server SKU keys, not amount from request. Current backend rejects course/unknown SKU and refuses order creation unless `CREDIT_ENFORCEMENT_ENABLED` is on.

Grant implementation when enabled needs `CREDIT_FREE_GRANT_VERSION` to be a stable, never-reused policy version and `CREDIT_FREE_GRANT_AMOUNT=1`. Bonus grant is `<version>:student-bonus` with amount 4, idempotently inserted for student. **Do not change a production grant version** without a fresh approval and migration analysis (it would regrant). Disable commercial charging in production until read-only schema readiness, authorized production migration, live merchant credentials, refunds, callback replay and device gates are complete. No secret belongs in Git.

Client credit panel appears only when enforcement is enabled. Fixed frontend 449 obtains virtual-payment parameters from server and calls `wx.requestVirtualPayment`. Client success is not proof of settlement; only a verified server order query and idempotent ledger transaction grant credits. Pending order can be manually rechecked. Production merchant behavior is still unverified. Some types of virtual services and Apple/iOS purchase restrictions require a separate WeChat platform compliance verification before enabling digital checkout.

## Assessment academic record invariant

Only `我的 → 编辑个人资料` may change the five academic fields: university, major, current grade, GPA/average, and ranking. Assessment and historical Position landing pages render canonical values read-only; resume import may fill English, research, competitions, targets, background note and other optional assessment fields, but must not silently alter five account fields. Server `POST /me/assessments`, `PUT /me/assessments/:id` and `POST /me/assessments/:id/run` compare all five fields against `user_profiles`; a stale/forged draft gets HTTP 409 `assessment_academic_profile_outdated` and requires re-opening the form with saved canonical profile. Existing successfully saved outputs are historical and must not be edited.

## Admin analytics definition

Access exclusively via role-authenticated admin GET `/me/admin/assessment-analytics?period=week|month|year`. Week = last seven days daily; month = last twelve months monthly; year = last five years yearly. Every period has zero-filled date buckets. **AI usage** = real `assessments.status=succeeded` counted by `completed_at`; **recharge frequency** = real `payment_orders.status=paid` counted by `paid_at`. The two are different measures. Switch line/bar on the same actual data and put integer labels on every bar/point. Cumulative spender leaderboard all-time sum of `amount_fen` in paid orders DESC, capped 20, minimize PII. Refund semantics still unapproved and would require adjusted net-paid reporting if refunded orders are present.

MySQL calendar bucket boundary currently follows fixed Chinese +08 date calculations; production operational gate must independently confirm MySQL session timezone +08:00, and sufficient indexes for the bounded aggregation. No new always-running process, DB, chart library or ECS resident service.

## Explicit remaining verification gates

- CI for final commit; WeChat Developer Tools compile, iOS/Android test payment cancel/confirm/delayed callback/duplicate callback; zero-credit refusal and no charge on retry/failed save; runtime quota transition from guest to student; authentication role change and account deletion/refunds.
- Production payment order and callback readiness, legal/compliance review and operator approval. No production schema writes, ECS promotion, payment credentials or official domain changes in this GitHub-only batch.
- Prior 2026-10-09 device UI check: four role tabs genuinely distinct, stage↔week sync, button width/whitespace, website link copy and onboarding. Secure teacher/admin read-only preview, Group / News scoped visibility, official-school research and AI human-case quality tests remain separate code/security gates (not completed by commercial work).

## 2026-10-09 virtual-payment compliance correction (overrides old JSAPI plan)

A historical secondary report described a 2026 move to mini-program **virtual payment** for digital products. The applicable policy must be confirmed in the official merchant console for this account. Ordinary JSAPI `wx.requestPayment` must NOT be treated as an approved channel for AI assessment credits. Recheck original developer docs and the merchant's specific eligibility in WeChat official console. The existing client `wx.requestPayment` flow and backend WeChat Pay v3 JSAPI are **retained as non-executable legacy scaffolding**, not production ready. Server always responds 503 `wechat_virtual_payment_adapter_required` to the old create-order endpoint; meta `checkoutEnabled=false` even if an operator changes `CREDIT_ENFORCEMENT_ENABLED`. Do not disable this safety gate with an env flag. A virtual-payment adapter and NEW endpoint now exist in e590/8cc4 source. Official console contract, server delivery, refunds/reconciliation and real-device payment remain to be verified before enabling. Server credit enforcement and user free grants are independent of checkout readiness. Secondary reporting of WeChat 2026 announcement: https://www.mpaypass.com.cn/news/202603/02164733.html (official console is final arbiter).
