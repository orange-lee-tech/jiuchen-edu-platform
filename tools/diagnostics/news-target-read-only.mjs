// Run from /opt/jiuchen-api/current/services/api with the existing env loaded.
// Reads official pages + news_posts only. Never imports app/server or starts workers.
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const targetUrl = process.env.NEWS_AUDIT_URL || 'https://mp.weixin.qq.com/s/WnhmDWF30adA5OM_BipHgQ'
const targetTitle = process.env.NEWS_AUDIT_TITLE?.trim() || ''
const require = createRequire(resolve('package.json'))
const mysql = require('mysql2/promise')
const { scanOfficialAccountPosts } = await import(pathToFileURL(resolve(process.env.NEWS_AUDIT_SCANNER_PATH || 'dist/services/official-account.js')).href)
const fingerprint = value => createHash('sha256').update(String(value)).digest('hex').slice(0,12)
const report = { mode:'READ_ONLY', targetUrl, targetTitle, checkedAt:new Date().toISOString() }
let connection
try {
  const scan = await scanOfficialAccountPosts(process.env)
  let title = targetTitle
  try {
    const html = await (await fetch(targetUrl,{signal:AbortSignal.timeout(15000)})).text()
    title ||= html.match(/property=["']og:title["'][^>]*content=["']([^"']+)/i)?.[1]
      || html.match(/var\s+msg_title\s*=\s*["']([^"']+)/)?.[1] || ''
  } catch { report.articleMetadata = 'unavailable_use_NEWS_AUDIT_TITLE' }
  const matches = scan.posts.filter(post => post.articleUrl === targetUrl || title && post.title === title)
  const coverageVerified=Number.isInteger(scan.pagesFetched)&&Number.isInteger(scan.uniqueGroups)&&scan.uniqueGroups===scan.groupsFetched&&!scan.truncated
  report.source = { groupsFetched:scan.groupsFetched,totalGroups:scan.totalGroups,truncated:scan.truncated,
    pagesFetched:scan.pagesFetched??null,uniqueGroups:scan.uniqueGroups??null,coverageVerified,
    latestSourceUpdatedAt:scan.latestSourceUpdatedAt,latestSourcePublishedAt:scan.latestSourcePublishedAt,
    posts:scan.posts.length, matchedTitle:title || null,
    matches:matches.map(post=>({sourceKey:post.sourceKey,title:post.title,url:post.articleUrl,
      sourceUpdatedAt:post.content.sourceUpdatedAt,publishedAt:post.publishedAt})),
    // Public source titles only; no article body or secret-bearing request URL.
    latestBySourceTime:[...scan.posts].sort((a,b)=>(b.content.sourceUpdatedAt||'').localeCompare(a.content.sourceUpdatedAt||''))
      .slice(0,5).map(post=>({title:post.title,sourceKey:post.sourceKey,url:post.articleUrl,time:post.content.sourceUpdatedAt})) }
  const env=process.env
  connection=await mysql.createConnection(env.DATABASE_URL?{uri:env.DATABASE_URL,dateStrings:true,connectTimeout:10000}:
    {host:env.DB_HOST,port:Number(env.DB_PORT||3306),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,dateStrings:true,connectTimeout:10000})
  await connection.query('START TRANSACTION READ ONLY')
  const [rows]=await connection.query(`SELECT id,source_key AS sourceKey,title,article_url AS articleUrl,status,
    JSON_LENGTH(tags_json) AS tagCount,published_at AS storedTime,
    JSON_UNQUOTE(JSON_EXTRACT(content_json,'$.sourceUpdatedAt')) AS sourceUpdatedAt
    FROM news_posts WHERE article_url=? OR (?<>'' AND title=?)`,[targetUrl,title,title])
  const keys=new Set(matches.map(post=>post.sourceKey))
  if(keys.size){
    const [byKey]=await connection.query(`SELECT id,source_key AS sourceKey,title,status,JSON_LENGTH(tags_json) AS tagCount
      FROM news_posts WHERE source_key IN (?)`,[[...keys]])
    for(const row of byKey)if(!rows.some(existing=>existing.id===row.id))rows.push(row)
  }
  report.database={matches:rows.map(({id,...row})=>({...row,sampleKey:fingerprint(id)}))}
  await connection.query('COMMIT')
  report.verdict = !matches.length&&!coverageVerified ? 'SOURCE_COVERAGE_UNVERIFIED_DO_NOT_CONCLUDE_ARTICLE_ABSENT'
    : !title && !matches.length ? 'TARGET_NOT_IDENTIFIED_SHORT_URL_NEEDS_TITLE'
    : !matches.length ? 'NOT_IN_FREEPUBLISH_SOURCE_VERIFY_ACCOUNT_AND_PUBLICATION_CHANNEL'
    : !rows.length ? 'SOURCE_PRESENT_DATABASE_MISSING'
    : rows.every(row=>row.status!=='active'||!Number(row.tagCount)) ? 'DATABASE_PRESENT_HIDDEN_OR_UNCLASSIFIED'
    : 'DATABASE_VISIBLE_CANDIDATE_COMPARE_PUBLIC_LIST_ORDER_AND_WINDOW'
} catch(error) {
  report.failure = /^[A-Z0-9_]+$/.test(String(error?.code||'')) ? error.code
    : /^official_account_[a-z_0-9]+$/.test(String(error?.message||'')) ? error.message : 'READ_ONLY_DIAGNOSTIC_FAILED'
  process.exitCode=1
} finally { if(connection)await connection.end() }
console.log(JSON.stringify(report,null,2))
