# WeChat Integration V1 — ECS transport, CloudBase Storage, customer service

Status: implementation baseline for Lane C, 2026-10-01.

## 1. Scope and boundaries

The mini-program remains intentionally integrated with the WeChat ecosystem.

- Core business API target: `https://api.jiuchenedu.com` on Alibaba ECS.
- CloudRun: rollback / comparison path only, not the normal production transport.
- CloudBase Storage: retained for WeChat-native upload flow such as `wx.cloud.uploadFile`.
- Login, phone authorization, payment, customer service and other platform concerns should continue to prefer official WeChat / WeCom capabilities.
- This lane does not change ECS, Nginx Proxy Manager, server deployment, database, or backend AI provider implementation.

## 2. Transport decision

The client transport is explicit rather than inferred from whether CloudBase is initialized.

| Mini-program environment | Debug flag | Transport |
| --- | --- | --- |
| release | none | ECS HTTPS |
| trial | none | ECS HTTPS |
| develop | none | ECS HTTPS |
| develop | `jiuchen-use-local-api=true` | local HTTP `127.0.0.1:3000` |
| develop / trial | `jiuchen-use-cloudrun-api=true` | CloudRun |
| release | storage flags | ignored; ECS HTTPS |

Why:

1. A stale client storage flag must not silently send production users to localhost or the legacy CloudRun path.
2. Developers still need a low-friction local API path.
3. Trial/development builds retain a CloudRun comparison path during migration.
4. A production emergency rollback remains possible by changing the source-level default transport and issuing a new experience/release build; this is intentionally explicit and auditable.

## 3. CloudBase stays initialized

`wx.cloud.init` must run even when API transport is ECS.

Current schedule import flow is:

```text
choose spreadsheet / image
        ↓
wx.cloud.uploadFile
        ↓
CloudBase Storage fileID
        ↓
POST https://api.jiuchenedu.com/me/classroom/schedule-imports
        ↓
ECS reads temporary CloudBase object, parses, persists structured result
```

Therefore CloudBase initialization is a Storage dependency, not proof that CloudRun is the API transport.

Do not replace `wx.cloud.uploadFile` with self-hosted upload merely for architectural purity.

## 4. Login and session continuity

The migration does not change the authentication contract.

- Client obtains a one-time code with `wx.login`.
- Client sends the code to the ECS auth endpoint through the normal request wrapper.
- Server creates the Jiuchen session and returns the existing session token.
- Client persists the token under the existing local storage key.
- Every authenticated request keeps using `Authorization: Bearer <token>`.
- Logout and account deletion keep clearing the same local token/auth snapshot.

No cookie dependency is introduced, and the client never stores AppSecret or trusts a client-side identity assertion.

## 5. WeChat legal-domain minimum

Configure only origins actually used by mini-program network APIs.

### Required now

**request 合法域名**

```text
https://api.jiuchenedu.com
```

This covers `wx.request` calls to the ECS API.

### Not required by the current code path

**uploadFile 合法域名**

No custom origin is required today because schedule uploads use `wx.cloud.uploadFile`, not `wx.uploadFile`.

**downloadFile 合法域名**

No custom origin is required today because the current mini-program does not directly call `wx.downloadFile` for ECS resources.

**socket 合法域名**

None; the current V1 transport does not use WebSocket.

Do not add broad or speculative domains. If a later feature introduces direct `wx.uploadFile`, `wx.downloadFile`, remote media, or WebSocket, add the exact HTTPS/WSS origin at that time.

Development-tool "do not validate legal domains" is only a local debugging aid and is not an acceptance substitute.

## 6. Human customer service first

The current mini-program already exposes official mini-program customer-service entry points with `button open-type="contact"` on product detail and profile surfaces.

V1 default:

```text
user taps 在线咨询 / 联系客服
        ↓
official WeChat customer-service session
        ↓
human agent
```

Required console work is to enable/configure the mini-program customer-service capability and bind the actual agents. Do not build a parallel generic chat console.

### Optional WeCom / 微信客服 upgrade

If Jiuchen chooses enterprise WeChat customer service as the unified human-agent workbench:

1. Bind the mini-program to the Jiuchen WeCom / 微信客服 enterprise in the official consoles.
2. Obtain the enterprise ID and the customer-service link from the official workbench.
3. Add a small client wrapper around `wx.openCustomerServiceChat` only after those real values exist.
4. Call it only from a user gesture.
5. Keep `open-type="contact"` as the simplest fallback until the WeCom path passes real-device acceptance.

Do not hard-code fake enterprise IDs or placeholder service URLs into production code.

## 7. Simple AI FAQ / RAG in front of human handoff

AI customer service is a bounded pre-service assistant, not a replacement customer-service platform.

Recommended V1 flow:

```text
user question
   ↓
deterministic FAQ / intent match
   ↓ miss
small RAG over approved Jiuchen product/service knowledge
   ↓
cheap bounded CUSTOMER_AI model
   ↓
short answer + sources / uncertainty
   ↓
"转人工" always available
```

Rules:

- use the separate `CUSTOMER_AI_*` credential/budget family;
- no general web browsing mode;
- no unlimited conversation;
- compact recent context only;
- do not replay arbitrary assessment chat/history;
- rate/turn caps per session/day;
- low-confidence, complaints, payment/account issues, or explicit human request hand off immediately;
- human service remains usable even if AI is unavailable.

Backend endpoint/provider implementation belongs to the backend/AI lane, not this lane.

## 8. Console checklist

Before experience-version acceptance:

1. WeChat public platform → Development / Development Management → Development Settings → Server Domains:
   - add `https://api.jiuchenedu.com` to **request 合法域名**;
   - do not add upload/download/socket domains without an actual caller.
2. Confirm the mini-program remains associated with CloudBase environment `cloud1-d3geim00r03edb212`.
3. Confirm CloudBase Storage permissions still allow the existing authenticated upload path.
4. Enable/configure mini-program customer service and bind Jiuchen human agents.
5. If using WeCom 微信客服, complete the official mini-program ↔ enterprise binding and record the real enterprise ID/service link outside source secrets.
6. Confirm privacy disclosures cover account identity, phone authorization (when enabled), uploaded schedule files, and AI assessment/customer-service data actually collected.
7. Upload an experience version built from the accepted commit and perform the real-device checklist in `docs/testing/wechat-real-device-acceptance.md`.

## 9. Migration blockers outside Lane C

Lane C is code-ready but full acceptance depends on:

- `api.jiuchenedu.com` DNS/HTTPS/reverse proxy being live and routing to the accepted ECS API release;
- the request legal domain being saved successfully in the WeChat console;
- valid real-device test accounts / Jiuchen internal IDs;
- backend image-schedule AI provider and assessment provider being configured when those test cases are executed;
- human customer-service agents (and WeCom binding if selected) being configured in official consoles.
