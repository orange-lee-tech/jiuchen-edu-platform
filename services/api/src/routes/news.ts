import type { FastifyInstance } from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import type { AppEnv } from '../config/env.js'
import {
  getActiveNewsPost,
  listActiveNewsPosts,
  newsTimeView,
  normalizeNewsTags,
} from '../services/news.js'
import { getNewsV2PostPhase, listNewsV2 } from '../services/news-v2-store.js'

import { resolveSessionUser } from '../services/session.js'

export function registerNewsRoutes(
  app: FastifyInstance,
  database: DatabaseContext,
  env?: AppEnv,
) {
  app.get('/news', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const user=await resolveSessionUser(request,database)
    const reviewer=Boolean(user&&['admin','teacher','staff'].includes(user.role))
    if (env?.NEWS_V2_ENABLED) {
      const rows=await listNewsV2(database.pool,reviewer)
      const mapped=rows.map(row=>({id:String(row.id),title:String(row.title),summary:row.summary,coverUrl:row.coverUrl,articleUrl:row.articleUrl,
        tags:normalizeNewsTags(row.tagsJson),source:row.source,...newsTimeView({source:row.source,publishedAt:row.publishedAt,contentJson:row.contentJson}),
        retireAt:row.retireAtEpoch===null?null:new Date(Number(row.retireAtEpoch)*1000).toISOString(),phase:row.phase}))
      return {ok:true,v2:true,posts:mapped.filter(row=>row.source==='manual'||row.phase==='normal'),retiring:mapped.filter(row=>row.phase==='buffering')}
    }
    const posts = await listActiveNewsPosts(database, 50, reviewer)

    return {
      ok: true,
      posts: posts.map((post) => ({
        ...post,
        publishedAt: post.publishedAt?.toISOString() ?? null,
        favoritesEnabled:Boolean(env?.NEWS_V2_ENABLED),
      })),
    }
  })

  app.get<{ Params: { id: string } }>('/news/:id', async (request, reply) => {
    if (!database.configured) {
      return reply.code(503).send({
        ok: false,
        error: 'database_not_configured',
      })
    }

    const user=await resolveSessionUser(request,database)
    const reviewer=Boolean(user&&['admin','teacher','staff'].includes(user.role))
    if(env?.NEWS_V2_ENABLED){
      const phase=await getNewsV2PostPhase(database.pool,request.params.id)
      if(!phase && !reviewer){
        const [manual]=await database.pool.query<import('mysql2/promise').RowDataPacket[]>("SELECT source FROM news_posts WHERE id=? AND source='manual' LIMIT 1",[request.params.id])
        if(!manual.length)return reply.code(404).send({ok:false,error:'news_post_not_found'})
      } else if(!reviewer && phase!=='normal' && phase!=='buffering')return reply.code(404).send({ok:false,error:'news_post_not_found'})
    }
    const post = await getActiveNewsPost(database, request.params.id, reviewer)
    if (!post) {
      return reply.code(404).send({
        ok: false,
        error: 'news_post_not_found',
      })
    }

    return {
      ok: true,
      post: {
        ...post,
        publishedAt: post.publishedAt?.toISOString() ?? null,
        favoritesEnabled:Boolean(env?.NEWS_V2_ENABLED && post.source==='wechat_official' && post.articleUrl),
      },
    }
  })
}
