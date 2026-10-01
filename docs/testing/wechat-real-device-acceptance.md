# WeChat real-device acceptance checklist

Target: Jiuchen mini-program V1 after CloudRun → ECS transport migration.

Record for every run:

- mini-program experience version:
- Git commit:
- tester / device / WeChat version:
- test account role:
- test time:
- ECS API release:
- result: PASS / FAIL / BLOCKED

## 0. Preconditions

- [ ] Experience build is made from the intended commit.
- [ ] `https://api.jiuchenedu.com/health/live` is publicly reachable over valid HTTPS.
- [ ] WeChat console request legal domain contains exactly `https://api.jiuchenedu.com` for the ECS API.
- [ ] CloudBase environment is available and Storage upload permission is intact.
- [ ] At least one ordinary user, one student identity, and one teacher/admin path are available for role tests.
- [ ] Relevant backend migrations/seeds are present.
- [ ] If image schedule / AI assessment is in scope for this run, its backend provider is configured.
- [ ] Human customer-service agent is online or intentionally available for the test window.

## 1. Transport and health

- [ ] Fresh install / cleared storage opens without CloudBase initialization errors.
- [ ] Trial/release build loads data through ECS HTTPS, not CloudRun.
- [ ] `GET /health/live` succeeds through the mini-program request wrapper.
- [ ] `GET /health` reports database dependency as expected.
- [ ] Offline / DNS failure produces the existing friendly network error instead of a crash.
- [ ] Developer-only local flag works only in a develop build.
- [ ] CloudRun debug flag can be used in develop/trial for migration comparison.
- [ ] Release build ignores both client storage debug flags.

## 2. Login and session

### WeChat one-click login

- [ ] Logged-out user can invoke WeChat login.
- [ ] `wx.login` code reaches ECS `/auth/wechat/bootstrap`.
- [ ] Returned Jiuchen session is stored.
- [ ] Subsequent authenticated API calls carry the session and succeed.
- [ ] Closing/reopening the mini-program preserves a still-valid session.
- [ ] Expired/invalid token produces an unauthorized state and allows re-login.
- [ ] Logout invalidates/clears the local session.
- [ ] Account deletion clears local auth state after server success.

### Phone authorization, when enabled

- [ ] User gesture obtains the WeChat phone code.
- [ ] Phone code is exchanged only by the server.
- [ ] Refusal/cancel does not break normal WeChat login.
- [ ] Phone authorization alone does not grant student/teacher/admin role.

## 3. Profile and internal ID

- [ ] Guest profile displays guest state rather than a fake student state.
- [ ] Valid unclaimed Jiuchen internal ID can be claimed once.
- [ ] Invalid ID gets the expected friendly error.
- [ ] Already claimed/locked ID cannot be silently rebound by the client.
- [ ] Role/UI updates after a successful claim without requiring app reinstall.
- [ ] Profile fields can be edited and persist after reload.
- [ ] A different WeChat account cannot see another user's private profile.

## 4. Classroom editing and review

### Student

- [ ] Student opens the correct stage.
- [ ] Student can edit an allowed plan.
- [ ] Saving creates a pending revision.
- [ ] Student sees the pending version while it awaits review.
- [ ] Recent version history is readable.

### Teacher

- [ ] Teacher only sees assigned students.
- [ ] Teacher can open the assigned student's classroom.
- [ ] Pending student revision appears in teacher review queue.
- [ ] Approve makes the submitted revision the active/default version.
- [ ] Reject returns the student view to the previously accepted version.
- [ ] Teacher-authored allowed edits follow the backend's approved behavior.

## 5. Schedule import — CloudBase Storage + ECS parse

### Spreadsheet

- [ ] Choose a valid XLSX/XLS/CSV ≤ 5 MB.
- [ ] `wx.cloud.uploadFile` succeeds with ECS transport selected.
- [ ] A CloudBase `fileID` is sent to ECS.
- [ ] ECS parses the file and returns structured courses.
- [ ] Parsed course count/content is plausible.
- [ ] Oversize/invalid file produces a clear error.
- [ ] Temporary source object follows backend cleanup policy.

### Image

- [ ] Choose/capture a valid schedule image ≤ 5 MB.
- [ ] CloudBase upload succeeds.
- [ ] ECS image-schedule provider returns structured courses.
- [ ] Low-confidence / unreadable image fails clearly instead of fabricating a timetable.
- [ ] Provider-unconfigured state is reported as BLOCKED, not misrecorded as a client regression.

## 6. News

- [ ] News list loads from ECS.
- [ ] Service-account-sourced items show correct title/summary/date.
- [ ] WeChat official-account article opens through the official capability when supported.
- [ ] Fallback behavior copies the original URL instead of opening an unsafe arbitrary web-view.
- [ ] Empty news state is readable and does not look like a broken skeleton.

## 7. AI assessment

- [ ] Assessment form submits to ECS.
- [ ] Successful run returns schema-valid structured output.
- [ ] Evidence/source behavior matches the backend contract.
- [ ] Paid/free credit behavior matches server ledger state.
- [ ] Model/provider failure does not consume a paid assessment credit.
- [ ] Reopening the result does not trigger an accidental second paid inference.
- [ ] Provider-unconfigured state is recorded as BLOCKED if backend lane has not completed configuration.

## 8. Customer service

### Current mini-program customer service

- [ ] Product-detail "在线咨询" opens official customer service.
- [ ] Profile customer-service entry opens official customer service.
- [ ] Human agent receives the conversation in the configured official workbench.
- [ ] User can return to the mini-program normally.

### WeCom / 微信客服, if enabled for this release

- [ ] Mini-program is officially bound to the intended enterprise.
- [ ] User-gesture call opens the correct WeCom/微信客服 account.
- [ ] Conversation reaches the intended reception group/agent.
- [ ] Failure path still offers the normal mini-program customer-service entry.

### AI FAQ/RAG, when backend endpoint exists

- [ ] Known FAQ resolves without unnecessary model call when deterministic match exists.
- [ ] RAG answer stays inside approved Jiuchen product/service scope.
- [ ] Low-confidence answer exposes human handoff immediately.
- [ ] Explicit "转人工" works at any turn.
- [ ] Rate/turn caps are enforced.
- [ ] AI outage does not block human customer service.

## 9. Final release gate

- [ ] No production request uses localhost, raw IP, HTTP, or an unregistered origin.
- [ ] CloudBase Storage still works while the core API uses ECS.
- [ ] No AppSecret, payment key, AI key, CAM secret, database credential, or private test data is present in client code/logs.
- [ ] Student/teacher/admin authorization is enforced by the server, not UI visibility alone.
- [ ] Screenshots/log snippets are captured for each failed or blocked item.
- [ ] Every BLOCKED item has an owner (Lane A / Lane B / WeChat console / business operator).
