import { randomUUID } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { AppEnv } from '../config/env.js'
import type { DatabaseContext } from '../db/client.js'
import { newsPosts } from '../db/schema.js'
import {
  scanOfficialAccountPosts,
  type OfficialAccountPost,
} from './official-account.js'
import { recordNewsSync, reconcileNewsWindow, withNewsLock } from './news-v2-store.js'

export type NewsPostContent = {
  html: string | null
  author: string | null
  contentSourceUrl: string | null
  sourceUpdatedAt: string | null
  sourceCreatedAt: string | null
  publicationTimeSource: 'explicit_publish_time' | 'admin_verified_publish_record' | 'unverified'
  mediaType?: 'article' | 'image' | 'video'
  blocks?: Array<{type:'text';text:string}|{type:'image';url:string}>
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
      sourceUpdatedAt: null, sourceCreatedAt: null, publicationTimeSource: 'unverified', blocks:[],
    }
  }

  const record = value as Record<string, unknown>
  return {
    mediaType:record.mediaType==='video'?'video':record.mediaType==='image'?'image':'article',
    blocks:Array.isArray(record.blocks)?record.blocks.filter((block):block is {type:'text';text:string}|{type:'image';url:string}=>{
      if(!block || typeof block!=='object' || Array.isArray(block))return false
      const item=block as Record<string,unknown>
      return item.type==='text'&&typeof item.text==='string' ||
        item.type==='image'&&typeof item.url==='string'&&/^https:\/\/mmbiz\.qpic\.cn\//.test(item.url)
    }).slice(0,100):[],

    sourceUpdatedAt: typeof record.sourceUpdatedAt==='string'?record.sourceUpdatedAt:null,
    sourceCreatedAt: typeof record.sourceCreatedAt==='string'?record.sourceCreatedAt:null,
    publicationTimeSource: record.publicationTimeSource==='explicit_publish_time'?'explicit_publish_time':
      record.publicationTimeSource==='admin_verified_publish_record'?'admin_verified_publish_record':'unverified',
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
  let created=0,updated=0,unchanged=0
  const errors:Array<{sourceKey:string;reason:string}>=[]
  for(const post of posts){
    try {
      const [byKey]=await database.db.select().from(newsPosts).where(eq(newsPosts.sourceKey,post.sourceKey)).limit(1)
      const [byUrl]=byKey||!post.articleUrl?[]:await database.db.select().from(newsPosts)
        .where(and(eq(newsPosts.source,'wechat_official'),eq(newsPosts.articleUrl,post.articleUrl))).limit(1)
      const existing=byKey??byUrl
      const previous=existing?normalizeNewsContent(existing.contentJson):null
      const contentJson=previous?.blocks?.length && !post.content.html
        ? {...post.content,blocks:previous.blocks} : post.content
      const publishedAt=post.publishedAt??(previous?.publicationTimeSource==='admin_verified_publish_record'?existing?.publishedAt??null:null)
      const values={title:post.title,summary:post.summary,coverUrl:post.coverUrl,articleUrl:post.articleUrl,
        contentJson,publishedAt}
      if(existing){
        const identical=existing.title===post.title && existing.summary===post.summary && existing.coverUrl===post.coverUrl &&
          existing.articleUrl===post.articleUrl && existing.publishedAt?.toISOString()===publishedAt?.toISOString() &&
          JSON.stringify(normalizeNewsContent(existing.contentJson))===JSON.stringify(normalizeNewsContent(contentJson))
        if(identical){unchanged++;continue}
        // Do not change labels or resurrect a deliberately hidden article.
        await database.db.update(newsPosts).set({...values,sourceKey:post.sourceKey}).where(eq(newsPosts.id,existing.id));updated++
      }else{
        await database.db.insert(newsPosts).values({id:randomUUID(),source:'wechat_official',sourceKey:post.sourceKey,
          ...values,tagsJson:[],status:'active'});created++
      }
    }catch(error){
      const code=error&&typeof error==='object'&&'code' in error?String(error.code):'news_write_failed'
      errors.push({sourceKey:post.sourceKey,reason:/^[A-Z0-9_]+$/.test(code)?code:'news_write_failed'})
    }
  }
  return {total:posts.length,created,updated,unchanged,failed:errors.length,errors}
}

export async function syncOfficialAccountPosts(database:DatabaseContext&{configured:true},env:AppEnv){
  return withNewsLock(database.pool,async connection=>{
    try{
      const scan=await scanOfficialAccountPosts(env)
      const result=await upsertOfficialAccountPosts(database,scan.posts)
      let window=null
      const incomplete=Boolean(result.failed || scan.truncated)
      if(env.NEWS_V2_ENABLED&&!incomplete)window=await reconcileNewsWindow(connection)
      if(env.NEWS_V2_ENABLED)await recordNewsSync(database.pool,{status:incomplete?'partial':'checked',fetched:result.total,created:result.created,updated:result.updated,failed:result.failed,
        latestSourceTime:scan.latestSourceUpdatedAt,errorCode:incomplete?'news_sync_incomplete':null})
      return {...result,...scan,window,message:incomplete?'检查未完整，已保留原展示窗口':result.created===0?'已检查，暂无新文章':'同步检查完成'}
    }catch(error){
      if(env.NEWS_V2_ENABLED)try{await recordNewsSync(database.pool,{status:'failed',fetched:0,created:0,updated:0,failed:1,latestSourceTime:null,errorCode:'official_source_or_storage_failed'})}catch{}
      throw error
    }
  })
}

/** Legacy timestamps were populated from update_time, so do not label them as publication time. */
export function newsTimeView(row:{source:string;publishedAt:Date|null;contentJson?:unknown}){
  const content=normalizeNewsContent(row.contentJson)
  const verified=row.source==='manual'||content.publicationTimeSource==='explicit_publish_time'||
    content.publicationTimeSource==='admin_verified_publish_record'
  return {publishedAt:verified?row.publishedAt:null,sourceUpdatedAt:content.sourceUpdatedAt??(!verified?row.publishedAt?.toISOString()??null:null),
    publicationTimeSource:row.source==='manual'?'manual':content.publicationTimeSource}
}

/**
 * Sort by the best verifiable source timestamp without relabelling an update
 * as a publication. New official-account rows keep update_time in JSON while
 * legacy rows stored it in published_at, so both representations must sort.
 */
export function newsSourceTimeOrder() {
  return sql<number>`COALESCE(
    UNIX_TIMESTAMP(${newsPosts.publishedAt}),
    TIMESTAMPDIFF(
      SECOND,
      '1970-01-01 00:00:00',
      STR_TO_DATE(
        SUBSTRING(JSON_UNQUOTE(JSON_EXTRACT(${newsPosts.contentJson}, '$.sourceUpdatedAt')), 1, 19),
        '%Y-%m-%dT%H:%i:%s'
      )
    ),
    UNIX_TIMESTAMP(${newsPosts.createdAt})
  )`
}

export async function listActiveNewsPosts(
  database: DatabaseContext & { configured: true },
  limit = 50,
  includeUnclassified = false,
) {
  const rows = await database.db
    .select({
      id: newsPosts.id,
      title: newsPosts.title,
      summary: newsPosts.summary,
      coverUrl: newsPosts.coverUrl,
      articleUrl: newsPosts.articleUrl,
      tagsJson: newsPosts.tagsJson,
      contentJson: newsPosts.contentJson,
      publishedAt: newsPosts.publishedAt,
      source: newsPosts.source,
    })
    .from(newsPosts)
    .where(and(eq(newsPosts.status, 'active'), ...(includeUnclassified ? [] : [sql`JSON_LENGTH(${newsPosts.tagsJson}) > 0`])))
    .orderBy(desc(newsSourceTimeOrder()), desc(newsPosts.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    ...row,
    ...newsTimeView(row),
    mediaType:normalizeNewsContent(row.contentJson).mediaType,
    contentJson: undefined, tagsJson: undefined,
    tags: normalizeNewsTags(row.tagsJson),
  }))
}

export async function getActiveNewsPost(
  database: DatabaseContext & { configured: true },
  id: string,
  includeUnclassified = false,
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

  if (!row || row.status !== 'active' || !includeUnclassified && normalizeNewsTags(row.tagsJson).length===0) return null

  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    coverUrl: row.coverUrl,
    articleUrl: row.articleUrl,
    ...newsTimeView(row),
    source: row.source,
    tags: normalizeNewsTags(row.tagsJson),
    content: normalizeNewsContent(row.contentJson),
  }
}
