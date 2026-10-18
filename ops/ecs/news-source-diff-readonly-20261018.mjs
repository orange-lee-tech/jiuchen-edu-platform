#!/usr/bin/env node
// One-shot, read-only comparison of operator-supplied articles with the
// fixed candidate's official-account scan and the production news table.
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const candidateSha = '1b8ae8b3c5a1285b84ab6b5f573ca9db5d93d0a7'
const apiDir = '/opt/jiuchen-api/staging/verify-1b8ae8b3c5a1285b84ab6b5f573ca9db5d93d0a7-20261018-013849-4193193/services/api'
const targets = [
  ['2028届推免前移：现在该怎样准备？', 'https://mp.weixin.qq.com/s/ul2gk6Xo1TKi_PXvgRpqBA'],
  ['保研完整时间轴，大一到大四全覆盖（速收藏', 'https://mp.weixin.qq.com/s/dG__zmMfO5UvVa7D4iMfgA'],
  ['10月竞赛清单来啦～', 'https://mp.weixin.qq.com/s/nATlCGc9mXAl6WDYfs_H2Q'],
  ['2027秋招启动：本科生最该补齐的4项准备', 'https://mp.weixin.qq.com/s/DJW3ka4lF8KZc4HPRG9VEQ'],
  ['中南大学保研看什么？成绩、综测与学院细则', null],
]

function moduleUrl(file) {
  return pathToFileURL(resolve(apiDir, 'dist', file)).href
}
const [{ loadEnv }, { createDatabaseContext }, { scanOfficialAccountPosts }] = await Promise.all([
  import(moduleUrl('config/env.js')),
  import(moduleUrl('db/client.js')),
  import(moduleUrl('services/official-account.js')),
])
const env = loadEnv(process.env)
if (!env.WECHAT_OA_APP_ID || !env.WECHAT_OA_APP_SECRET) throw new Error('OFFICIAL_ACCOUNT_CONFIG_MISSING')
const database = createDatabaseContext(env)
if (!database.configured) throw new Error('DATABASE_CONFIG_MISSING')

const normalized = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const canonicalUrl = value => {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'mp.weixin.qq.com') return null
    url.hash = ''
    return url.toString()
  } catch { return null }
}
const matching = (row, title, articleUrl) => {
  const exactUrl = Boolean(articleUrl && canonicalUrl(row.articleUrl) === canonicalUrl(articleUrl))
  const rowTitle = normalized(row.title), targetTitle = normalized(title)
  const exactTitle = rowTitle === targetTitle
  const similarTitle = !exactTitle && targetTitle.length >= 8 &&
    (rowTitle.includes(targetTitle) || targetTitle.includes(rowTitle) && rowTitle.length >= 8)
  return exactUrl || exactTitle || similarTitle ? { row, match: exactUrl ? 'url' : exactTitle ? 'exact_title' : 'similar_title' } : null
}
let connection
try {
  const scan = await scanOfficialAccountPosts(env)
  if (scan.truncated || scan.totalGroups === null || scan.groupsFetched !== scan.totalGroups)
    throw new Error('SOURCE_SCAN_INCOMPLETE')
  connection = await database.pool.getConnection()
  await connection.query('START TRANSACTION READ ONLY')
  const [rows] = await connection.query(`SELECT title, article_url AS articleUrl, status,
    JSON_LENGTH(tags_json) AS tagCount,
    CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(content_json,'$.html'))) AS bodyChars
    FROM news_posts WHERE source='wechat_official'`)
  await connection.rollback()
  const results = targets.map(([title, articleUrl]) => {
    const source = scan.posts.map(row => matching(row, title, articleUrl)).filter(Boolean)
    const stored = rows.map(row => matching(row, title, articleUrl)).filter(Boolean)
    return {
      suppliedTitle: title,
      suppliedUrl: articleUrl,
      source: source.map(({ row, match }) => ({
        match, title: row.title, url: row.articleUrl, hasBody: Boolean(row.content.html),
        publicationTimePresent: Boolean(row.publishedAt),
      })),
      database: stored.map(({ row, match }) => ({
        match, title: row.title, url: row.articleUrl, hasBody: Number(row.bodyChars) > 0,
        tagCount: Number(row.tagCount), status: row.status,
      })),
    }
  })
  console.log(JSON.stringify({
    mode: 'READ_ONLY_SOURCE_AND_DATABASE_DIFF',
    candidateSha,
    accountAppIdSuffix: env.WECHAT_OA_APP_ID.slice(-4),
    sourceGroups: scan.groupsFetched,
    reportedGroups: scan.totalGroups,
    sourcePosts: scan.posts.length,
    oldSourceControlPresent: scan.posts.some(row => normalized(row.title).includes(normalized('9月21日志愿怎么填'))),
    targets: results,
    productionWrites: false,
    note: 'Short URLs may differ from official long URLs; similar-title matches require review. No article page was fetched.',
  }))
} finally {
  if (connection) connection.release()
  await database.pool.end()
}
