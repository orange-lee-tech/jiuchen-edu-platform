import type { AppEnv } from '../config/env.js'

type AccessTokenResponse = {
  access_token?: string
  expires_in?: number
  errcode?: number
  errmsg?: string
}

type PublishedArticle = {
  title?: string
  author?: string
  digest?: string
  content?: string
  content_source_url?: string
  thumb_url?: string
  url?: string
}

type PublishedItem = {
  article_id?: string
  update_time?: number
  content?: {
    news_item?: PublishedArticle[]
  }
}

type BatchGetResponse = {
  item?: PublishedItem[]
  errcode?: number
  errmsg?: string
}

let cachedToken: {
  token: string
  expiresAt: number
} | null = null

async function getAccessToken(env: AppEnv) {
  if (!env.WECHAT_OA_APP_ID || !env.WECHAT_OA_APP_SECRET) {
    throw new Error('official_account_not_configured')
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token
  }

  const url = new URL('https://api.weixin.qq.com/cgi-bin/token')
  url.searchParams.set('grant_type', 'client_credential')
  url.searchParams.set('appid', env.WECHAT_OA_APP_ID)
  url.searchParams.set('secret', env.WECHAT_OA_APP_SECRET)

  const response = await fetch(url)
  const payload = (await response.json()) as AccessTokenResponse

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.errcode
        ? `official_account_token_${payload.errcode}:${payload.errmsg ?? 'unknown'}`
        : 'official_account_token_failed',
    )
  }

  cachedToken = {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(300, (payload.expires_in ?? 7200) - 120) * 1000,
  }

  return cachedToken.token
}

function normalizePublishedHtml(value: string | undefined) {
  if (!value?.trim()) return null

  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\sdata-src=/gi, ' src=')
    .replace(
      /<img\b([^>]*)>/gi,
      (_full, attributes: string) =>
        `<img${attributes} style="max-width:100%;height:auto;box-sizing:border-box;" />`,
    )
}

function normalizeRemoteUrl(value: string | undefined) {
  const normalized = value?.trim()
  if (!normalized) return null
  return normalized.replace(/^http:\/\//i, 'https://')
}

export type OfficialAccountPost = {
  sourceKey: string
  title: string
  summary: string | null
  coverUrl: string | null
  articleUrl: string | null
  publishedAt: Date | null
  content: {
    html: string | null
    author: string | null
    contentSourceUrl: string | null
  }
}

export async function fetchLatestOfficialAccountPosts(
  env: AppEnv,
): Promise<OfficialAccountPost[]> {
  const token = await getAccessToken(env)
  const url = new URL('https://api.weixin.qq.com/cgi-bin/freepublish/batchget')
  url.searchParams.set('access_token', token)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      offset: 0,
      count: 20,
      no_content: 0,
    }),
  })

  const payload = (await response.json()) as BatchGetResponse

  if (!response.ok || payload.errcode) {
    throw new Error(
      payload.errcode
        ? `official_account_publish_${payload.errcode}:${payload.errmsg ?? 'unknown'}`
        : 'official_account_publish_failed',
    )
  }

  const posts: OfficialAccountPost[] = []

  for (const item of payload.item ?? []) {
    const articleId = item.article_id
    if (!articleId) continue

    const publishedAt = item.update_time
      ? new Date(item.update_time * 1000)
      : null

    const articles = item.content?.news_item ?? []
    articles.forEach((article, index) => {
      if (!article.title) return
      posts.push({
        sourceKey: `${articleId}:${index}`,
        title: article.title,
        summary: article.digest?.trim() || null,
        coverUrl: normalizeRemoteUrl(article.thumb_url),
        articleUrl: normalizeRemoteUrl(article.url),
        publishedAt,
        content: {
          html: normalizePublishedHtml(article.content),
          author: article.author?.trim() || null,
          contentSourceUrl: normalizeRemoteUrl(article.content_source_url),
        },
      })
    })
  }

  return posts
}
