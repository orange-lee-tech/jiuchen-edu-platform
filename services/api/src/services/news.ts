import { randomUUID } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import type { AppEnv } from '../config/env.js'
import type { DatabaseContext } from '../db/client.js'
import { newsPosts } from '../db/schema.js'
import {
  fetchLatestOfficialAccountPosts,
  type OfficialAccountPost,
} from './official-account.js'

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
  return database.db
    .select({
      id: newsPosts.id,
      title: newsPosts.title,
      summary: newsPosts.summary,
      coverUrl: newsPosts.coverUrl,
      articleUrl: newsPosts.articleUrl,
      publishedAt: newsPosts.publishedAt,
      source: newsPosts.source,
    })
    .from(newsPosts)
    .where(eq(newsPosts.status, 'active'))
    .orderBy(desc(newsPosts.publishedAt), desc(newsPosts.createdAt))
    .limit(limit)
}
