# Assessment Background Execution — 2026-10-06

Status: IMPLEMENTED

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
