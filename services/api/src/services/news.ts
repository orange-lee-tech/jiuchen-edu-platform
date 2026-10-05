import { randomUUID } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import type { AppEnv } from '../config/env.js'
import type { DatabaseContext } from '../db/client.js'
import { newsPosts } from '../db/schema.js'
import {
  fetchLatestOfficialAccountPosts,
  type OfficialAccountPost,
} from './official-account.js'

export type NewsPostContent = {
  html: string | null
  author: string | null
  contentSourceUrl: string | null
}

export function normalizeNewsTags(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8)
}

export function normalizeNewsContent(value: unknown): NewsPostContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      html: null,
      author: null,
      contentSourceUrl: null,
    }
  }

  const record = value as Record<string, unknown>
  return {
    html: typeof record.html === 'string' && record.html.trim()
      ? record.html
      : null,
    author: typeof record.author === 'string' && record.author.trim()
      ? record.author
      : null,
    contentSourceUrl:
      typeof record.contentSourceUrl === 'string' && record.contentSourceUrl.trim()
        ? record.contentSourceUrl
        : null,
  }
}

export async function upsertOfficialAccountPosts(
  database: DatabaseContext & { configured: true },
  posts: OfficialAccountPost[],
) {
  let created = 0
  let updated = 0

  for (const post of posts) {
    const [existing] = await database.db
      .select({ id: newsPosts.id })
      .from(newsPosts)
      .where(eq(newsPosts.sourceKey, post.sourceKey))
      .limit(1)

    if (existing) {
      await database.db
        .update(newsPosts)
        .set({
          title: post.title,
          summary: post.summary,
          coverUrl: post.coverUrl,
          articleUrl: post.articleUrl,
          contentJson: post.content,
          publishedAt: post.publishedAt,
          status: 'active',
        })
        .where(eq(newsPosts.id, existing.id))
      updated += 1
      continue
    }

    await database.db.insert(newsPosts).values({
      id: randomUUID(),
      source: 'wechat_official',
      sourceKey: post.sourceKey,
      title: post.title,
      summary: post.summary,
      coverUrl: post.coverUrl,
      articleUrl: post.articleUrl,
      contentJson: post.content,
      tagsJson: [],
      publishedAt: post.publishedAt,
      status: 'active',
    })
    created += 1
  }

  return {
    total: posts.length,
    created,
    updated,
  }
}

export async function syncOfficialAccountPosts(
  database: DatabaseContext & { configured: true },
  env: AppEnv,
) {
  const posts = await fetchLatestOfficialAccountPosts(env)
  const result = await upsertOfficialAccountPosts(database, posts)
  return {
    ...result,
    posts,
  }
}

export async function listActiveNewsPosts(
  database: DatabaseContext & { configured: true },
  limit = 50,
) {
  const rows = await database.db
    .select({
      id: newsPosts.id,
      title: newsPosts.title,
      summary: newsPosts.summary,
      coverUrl: newsPosts.coverUrl,
      articleUrl: newsPosts.articleUrl,
      tagsJson: newsPosts.tagsJson,
      publishedAt: newsPosts.publishedAt,
      source: newsPosts.source,
    })
    .from(newsPosts)
    .where(eq(newsPosts.status, 'active'))
    .orderBy(desc(newsPosts.publishedAt), desc(newsPosts.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    ...row,
    tags: normalizeNewsTags(row.tagsJson),
  }))
}

export async function getActiveNewsPost(
  database: DatabaseContext & { configured: true },
  id: string,
) {
  const [row] = await database.db
    .select({
      id: newsPosts.id,
      title: newsPosts.title,
      summary: newsPosts.summary,
      coverUrl: newsPosts.coverUrl,
      articleUrl: newsPosts.articleUrl,
      contentJson: newsPosts.contentJson,
      tagsJson: newsPosts.tagsJson,
      publishedAt: newsPosts.publishedAt,
      source: newsPosts.source,
      status: newsPosts.status,
    })
    .from(newsPosts)
    .where(eq(newsPosts.id, id))
    .limit(1)

  if (!row || row.status !== 'active') return null

  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    coverUrl: row.coverUrl,
    articleUrl: row.articleUrl,
    publishedAt: row.publishedAt,
    source: row.source,
    tags: normalizeNewsTags(row.tagsJson),
    content: normalizeNewsContent(row.contentJson),
  }
}
