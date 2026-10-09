# Identity-scoped read-only preview — product and backend security contract

Date: 2026-10-09. **Status: DESIGN APPROVED IN PRINCIPLE / NOT IMPLEMENTED**. User requests teacher to view any **authorized assigned student** as a student, and admin to view any student or teacher. This is **read-only scoped viewing**, not actual account login-as/impersonation.

## Authority

- A teacher (and staff only if explicitly authorized under current server policy) may inspect the **students actually assigned to that teacher** using the server's `teacher_assignments`/existing canonical relationship. Group membership and business identity alone must not broaden teacher permissions.
- An admin may inspect an active student or teacher using explicit server authorization. No cross-tenant/hidden/disabled target unless separately approved. Do not treat anonymous visitors or other admins as eligible without separate approval.
- Preview must never change the viewer's `authResult.user.role`, session bearer, WeChat openid, account ownership, business ID, current viewer account, or its own privileges.
- Read-only must be enforced by server-specific GET endpoints/field allowlists; **not only disabled buttons**, and not simply returning another student's complete authentication/session payload.

## Proposed minimum read model and UI

`GET /me/view-as/eligible-targets` (paginated, role-authorized) → only eligible student/teacher directory items: opaque ID, display name, school/role, assignment relation. Teacher result set filtered by verified assignment.

`GET /me/view-as/:targetId/overview` → safely bounded student or teacher summary, current planning stage, published/approved plan versions, visible official coaching records, and any authorized read-only experience blocks; no mobile, login tokens, private contacts, raw assessment prompt/materials, or draft/edit-write secrets by default. Refuse suspended/unauthorized targets. Confirm allowed fields with business owner before shipping.

Client provides clear banner `正在查看：某学员（只读）`, persistent `返回我的账号`, no AI run, no edit, save, delete, approve, pay, export, revoke, customer-support impersonation or group changes. Viewing an assessment outcome (if approved) requires a separate explicit per-record sharing grant; same for teacher private workspace. Navigation/account switching must not leave stale cached personal data when returning. Auditor sees viewer ID, target ID, reason, timestamp; avoid excessive personal data in log. Rate-limit to avoid scraping.

## Required regression gates

1. Teacher can read assigned student, cannot read an unrelated student even with a hand-edited URL.
2. Admin can read allowed student/teacher, cannot invoke any mutation on behalf of target.
3. Previous bearer token remains associated with actual viewer, never target.
4. Target suspension/revocation/relationship removal takes effect immediately on the next protected fetch; pagination/order cannot leak counts/identities.
5. Returning from preview restores original viewer context and clears target private state.
6. Deep links to private records without permission or from different logged-in accounts fail closed.
7. Correct handling of target consent, audit retention and student personal-data minimization reviewed before live.

**Stop condition:** no API/schema change or account impersonation may be committed from this product note alone. This requires a dedicated backend/security lane, isolated tests, migration only if approved, CI and operator production gate.
