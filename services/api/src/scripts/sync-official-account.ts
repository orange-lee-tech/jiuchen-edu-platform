import 'dotenv/config'
import { loadEnv } from '../config/env.js'
import { createDatabaseContext } from '../db/client.js'
import { syncOfficialAccountPosts } from '../services/news.js'

const env = loadEnv(process.env)
const database = createDatabaseContext(env)

if (!database.configured) {
  throw new Error('Database is not configured')
}

try {
  const result = await syncOfficialAccountPosts(database, env)
  console.log(
    `✓ official account sync complete: total=${result.total}, created=${result.created}, updated=${result.updated}`,
  )

  for (const post of result.posts.slice(0, 10)) {
    console.log(
      [
        post.publishedAt?.toISOString() ?? '-',
        post.title,
        post.articleUrl ?? '-',
      ].join('\t'),
    )
  }
} finally {
  await database.pool.end()
}
