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
  publish_time?: number
  create_time?: number
  content?: {
    news_item?: PublishedArticle[]
    update_time?: number
    publish_time?: number
    create_time?: number
  }
}

type BatchGetResponse = {
  item?: PublishedItem[]
  total_count?: number
  item_count?: number
  errcode?: number
  errmsg?: string
}

let cachedToken: {
  token: string
  appId: string
  expiresAt: number
} | null = null

async function getAccessToken(env: AppEnv) {
  if (!env.WECHAT_OA_APP_ID || !env.WECHAT_OA_APP_SECRET) {
    throw new Error('official_account_not_configured')
  }

  if (cachedToken && cachedToken.appId === env.WECHAT_OA_APP_ID && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token
  }

  const url = new URL('https://api.weixin.qq.com/cgi-bin/token')
  url.searchParams.set('grant_type', 'client_credential')
  url.searchParams.set('appid', env.WECHAT_OA_APP_ID)
  url.searchParams.set('secret', env.WECHAT_OA_APP_SECRET)

  const response = await fetch(url, {signal: AbortSignal.timeout(15000)})
  const payload = (await response.json()) as AccessTokenResponse

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.errcode
        ? `official_account_token_${payload.errcode}`
        : 'official_account_token_failed',
    )
  }

  cachedToken = {
    token: payload.access_token,
    appId: env.WECHAT_OA_APP_ID,
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
    sourceUpdatedAt: string | null
    sourceCreatedAt: string | null
    publicationTimeSource: 'explicit_publish_time' | 'unverified'
    mediaType?: 'article' | 'video'
  }
}

export type OfficialAccountScan = {
  posts: OfficialAccountPost[]; checkedAt: string; groupsFetched: number;
  totalGroups: number | null; truncated: boolean; maxGroups: number;
  latestSourcePublishedAt: string | null; latestSourceUpdatedAt: string | null;
  pagesFetched: number; uniqueGroups: number;
  latestArticles: Array<{title:string;articleUrl:string|null;sourceUpdatedAt:string|null;publishedAt:string|null}>;
}
function sourceDate(value: number | undefined): Date | null {
  if(!value || !Number.isFinite(value) || value<=0)return null
  const date=new Date(value*1000)
  return Number.isNaN(date.getTime())?null:date
}
export async function scanOfficialAccountPosts(env: AppEnv, maxGroups=200): Promise<OfficialAccountScan> {
  if(!Number.isInteger(maxGroups)||maxGroups<20||maxGroups>1000)throw new Error('official_account_invalid_scan_limit')
  const token=await getAccessToken(env)
  const url=new URL('https://api.weixin.qq.com/cgi-bin/freepublish/batchget')
  url.searchParams.set('access_token',token)
  const posts:OfficialAccountPost[]=[]
  const seen=new Set<string>()
  const seenGroups=new Set<string>()
  let pagesFetched=0
  let contentBytes=0
  let groupsFetched=0,totalGroups:number|null=null,finished=false
  while(groupsFetched<maxGroups){
    const count=Math.min(20,maxGroups-groupsFetched)
    const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},
      signal:AbortSignal.timeout(15000),body:JSON.stringify({offset:groupsFetched,count,no_content:0})})
    const payload=await response.json() as BatchGetResponse
    if(!response.ok||payload.errcode)throw new Error(payload.errcode?'official_account_publish_'+payload.errcode:'official_account_publish_failed')
    if(!Array.isArray(payload.item))throw new Error('official_account_invalid_publish_response')
    pagesFetched++
    if(typeof payload.total_count==='number')totalGroups=payload.total_count
    for(const item of payload.item){
      if(!item.article_id)throw new Error('official_account_missing_article_id')
      if(seenGroups.has(item.article_id))throw new Error('official_account_pagination_duplicate_group')
      seenGroups.add(item.article_id)
      // Only an explicit publication timestamp is treated as publication time.
      // update_time/create_time are kept separately, never silently relabeled.
      const publishedAt=sourceDate(item.publish_time??item.content?.publish_time)
      const sourceUpdatedAt=sourceDate(item.update_time??item.content?.update_time)?.toISOString()??null
      const sourceCreatedAt=sourceDate(item.create_time??item.content?.create_time)?.toISOString()??null
      if(!Array.isArray(item.content?.news_item))throw new Error('official_account_missing_article_content')
      item.content.news_item.forEach((article,index)=>{
        if(!article.title)throw new Error('official_account_missing_article_title')
        const sourceKey=item.article_id+':'+index
        if(seen.has(sourceKey))return
        seen.add(sourceKey)
        contentBytes+=Buffer.byteLength(article.content||'', 'utf8')
        if(contentBytes>8*1024*1024)throw new Error('official_account_content_budget_exceeded')
        posts.push({sourceKey,title:article.title,summary:article.digest?.trim()||null,
          coverUrl:normalizeRemoteUrl(article.thumb_url),articleUrl:normalizeRemoteUrl(article.url),publishedAt,
          content:{html:normalizePublishedHtml(article.content),author:article.author?.trim()||null,
            contentSourceUrl:normalizeRemoteUrl(article.content_source_url),sourceUpdatedAt,sourceCreatedAt,
            mediaType:/<video\b|<iframe\b[^>]*(?:video|vid=)|video_iframe/i.test(article.content||'')?'video':'article',
            publicationTimeSource:publishedAt?'explicit_publish_time':'unverified'}})
      })
    }
    groupsFetched+=payload.item.length
    if(totalGroups!==null&&groupsFetched>=totalGroups){finished=true;break}
    // A short page is terminal only when the source did not provide a total.
    // With a larger advertised total it is an incomplete scan, never a
    // successful empty/short result that may retire or hide existing posts.
    if(payload.item.length<count){
      if(totalGroups===null)finished=true
      break
    }
  }
  const latest=(values:Array<string|null>)=>values.filter((v):v is string=>Boolean(v)).sort().at(-1)??null
  const latestArticles=[...posts].sort((a,b)=>(b.publishedAt?.toISOString()||b.content.sourceUpdatedAt||'')
    .localeCompare(a.publishedAt?.toISOString()||a.content.sourceUpdatedAt||''))
    .slice(0,3).map(post=>({title:post.title,articleUrl:post.articleUrl,sourceUpdatedAt:post.content.sourceUpdatedAt,publishedAt:post.publishedAt?.toISOString()||null}))
  return {posts,checkedAt:new Date().toISOString(),groupsFetched,totalGroups,maxGroups,truncated:!finished,pagesFetched,uniqueGroups:seenGroups.size,latestArticles,
    latestSourcePublishedAt:latest(posts.map(p=>p.publishedAt?.toISOString()??null)),
    latestSourceUpdatedAt:latest(posts.map(p=>p.content.sourceUpdatedAt))}
}
export async function fetchLatestOfficialAccountPosts(env:AppEnv):Promise<OfficialAccountPost[]> {
  return (await scanOfficialAccountPosts(env)).posts
}
