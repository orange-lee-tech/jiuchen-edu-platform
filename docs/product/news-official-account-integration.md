# 九辰服务号资讯中心打通需求

Status: **approved requirement / implementation pending**

This document preserves the current product decision so future implementation does not depend on chat history.

## Goal

The mini-program News/资讯 module should not become an independent primary content source.

Primary content flow:

```text
九辰教育服务号已发布图文
-> 同步到 news 数据
-> 小程序资讯列表
-> 点击具体资讯
-> 打开对应服务号推文正文
```

The desired destination is the concrete published article, not the Official Account home/profile page.

## Existing baseline

Current repository already has the following foundation:

1. `services/api/src/services/official-account.ts`
   - uses WeChat `freepublish/batchget` to obtain published articles.

2. Existing sync fields include:
   - title
   - digest / summary
   - thumb / cover URL
   - article URL
   - published time

3. `services/api/src/services/news.ts`
   - upserts synchronized content into `news_posts`.

4. Production `news_posts` is known to exist.

5. `GET /news` already exists.

6. Mini-program `pages/news` exists.
   - for `mp.weixin.qq.com` URLs it prefers `wx.openOfficialAccountArticle(...)`.
   - therefore the desired article-level opening path already has a foundation.

7. Admin already has an entry similar to:
   - “九辰教育服务号 -> 立即同步最近动态”.

## Known gaps

### A. Classification is front-end hard-coded

Current visible categories:
- 推荐
- 推免
- 科研
- 九辰

### B. Current tag inference is heuristic

Current `inferTag()` derives categories from article-title keywords.

This must not remain the formal production classification contract.

### C. News data model has no formal tags / collection model

`news_posts` currently lacks a stable server-side tags/collection structure suitable for filtering and future reuse.

### D. Admin cannot edit tags per article

An administrator needs to be able to assign one or more tags to an individual news item when official collection metadata cannot be relied on.

### E. Official Account collection metadata is unverified

Before implementation, verify from current official WeChat documentation / actual API behavior whether published-article “合集/分类” metadata can be stably obtained with the Jiuchen account's available permissions.

Do not invent or assume an unsupported WeChat API capability.

## Product rules

1. If the official WeChat API can stably return usable collection/category metadata:
   - prefer synchronizing those collections as mini-program news tags.

2. If the official API does not expose it, permissions are insufficient, or behavior is unstable:
   - continue automatic article synchronization;
   - allow Jiuchen administrators to assign one or more tags manually.

3. Mini-program category filtering must use server-side tags.
   - remove title-keyword `inferTag()` as the formal source of truth.

4. The same tags may later support personalization.
   - do **not** implement recommendation algorithms in this phase.

5. Preserve the original `articleUrl`.
   - mini-program article opening should continue to prefer the official WeChat article-opening capability.

## Work slicing

### Backend / data
- verify WeChat official collection-metadata capability;
- design news tag / collection data model;
- define official-account sync contract;
- add admin tag-management API.

### Admin
- article list;
- per-article tag editing.

### WeChat / mini-program
- category/filter UI driven by server-side tags;
- real-device validation that a concrete service-account article opens correctly.

### Production Guardian
- re-enter only if a production schema write or backend release is required.

## Explicit non-goals for this phase

- no personalized recommendation algorithm;
- no duplicate independent editorial CMS as the primary news source;
- no title-keyword classification as production truth;
- no speculative WeChat collection API implementation;
- do not attach this work to the AI-assessment implementation lane.

## Deferred-input rule

Some implementation inputs may still be pending from the human owner.

Do not block or repeatedly ask for them now. At the point where an implementation step truly requires a missing artifact, account detail, screenshot, permission result, or business decision, ask the human owner for that specific missing input.
