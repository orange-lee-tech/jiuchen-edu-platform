# Assessment Background Execution — 2026-10-06

Status: **CLOSED — implementation and CI PASS; production rollout pending main-control scheduling**

## Scope

Convert the accepted Assessment Runtime from synchronous HTTP waiting to durable background execution only.

Untouched: News, Schedule, Blueprint, Payment implementation, model/provider selection, prompt/RAG quality work.

## Contract

`POST /me/assessments/:id/run` now persists `running`, returns HTTP 202, and wakes a background dispatcher. Persisted `assessments.status='running'` rows are the durable queue. The single production API process executes one Assessment at a time and rescans running rows on startup, so the user can leave and a process restart can recover unfinished work.

History observes `running/succeeded/failed` and polls only while visible and work is running.

## Notification adapter

A reusable terminal-notification adapter contract exists.

Current/default adapter:
- channel: `none`
- configured: `false`
- result: `not_configured`

No WeChat subscribe-message template, consent flow, or verified delivery configuration is claimed in this change.


## Verification

Final branch head at closeout:

`ada821a2894652b24d41a2593550fe06fa812c6e`

CI:
- Push CI: PASS
- PR CI: PASS
- Mini Program typecheck: PASS
- Admin build: PASS
- API typecheck/test/build: PASS
- API tests: 131 PASS / 0 FAIL

## WeChat notification integration boundary

The official WeChat completion-notification path is the native subscribe-message flow:

1. select/configure a real subscription-message template in WeChat Public Platform and obtain the template ID;
2. request explicit user subscription permission in the Mini Program with `wx.requestSubscribeMessage`;
3. send the terminal notification from the backend through the WeChat subscribe-message send API.

The current code intentionally stops before step 1 because no verified Assessment completion template ID and user-consent flow have been supplied.

The reusable adapter is therefore present, but its production/default state remains:

- `channel=none`
- `configured=false`
- `reason=not_configured`

Do not describe WeChat subscription-message delivery as complete until a real template, user authorization path, server delivery implementation and real-device delivery acceptance all pass.

## Rollout status

No production rollout was performed in this lane.

Reason: the current `p1/foundation` branch contains work beyond the currently active production Assessment hotfix baseline. Main control should schedule an isolated API release and a matching WeChat experience-version upload rather than promoting unrelated branch changes accidentally.
