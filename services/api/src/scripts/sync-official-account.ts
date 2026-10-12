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
    `${result.failed ? 'PARTIAL' : 'CHECKED'} official account sync: total=${result.total}, created=${result.created}, updated=${result.updated}, unchanged=${result.unchanged}, failed=${result.failed}, truncated=${result.truncated}`,
  )

  if(result.failed)process.exitCode=2
} finally {
  await database.pool.end()
}
