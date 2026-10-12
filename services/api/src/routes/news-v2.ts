import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import { resolveSessionUser } from '../services/session.js'
import { z } from 'zod'

const uuid = z.string().uuid()
const taskUpdate=z.object({state:z.enum(['todo','acknowledged','doing','feedback']),note:z.string().trim().max(1000)}).strict()

function isOfficialUrl(value:string){
  try { const url=new URL(value);return url.protocol==='https:'&&url.hostname==='mp.weixin.qq.com' } catch { return false }
}

export function registerNewsV2Routes(app:FastifyInstance,database:DatabaseContext){
  if(!database.configured)return
  const pool=database.pool
  async function requireRole(request:FastifyRequest,reply:FastifyReply,roles:string[]){
    const user=await resolveSessionUser(request,database)
    if(!user){reply.code(401).send({ok:false,error:'unauthorized'});return null}
    if(!roles.includes(user.role)){reply.code(403).send({ok:false,error:'news_forbidden'});return null}
    return user
  }
  app.get('/me/news-favorites',async(request,reply)=>{
    const user=await requireRole(request,reply,['student','teacher','staff','admin']);if(!user)return
    const [rows]=await pool.query(`SELECT f.post_id AS postId,f.title,f.original_url AS articleUrl,
      f.created_at AS favoritedAt,s.phase
      FROM news_favorites f LEFT JOIN news_display_states s ON s.post_id=f.post_id
      WHERE f.user_id=? ORDER BY f.created_at DESC LIMIT 200`,[user.userId])
    return {ok:true,favorites:rows}
  })
  app.put<{Params:{id:string}}>('/me/news-favorites/:id',async(request,reply)=>{
    const user=await requireRole(request,reply,['student','teacher','staff','admin']);if(!user)return
    if(!uuid.safeParse(request.params.id).success)return reply.code(400).send({ok:false,error:'invalid_news_id'})
    const [rows]=await pool.query<import('mysql2/promise').RowDataPacket[]>(`SELECT n.id,n.title,n.article_url AS articleUrl,
      n.published_at AS publishedAt,s.phase FROM news_posts n JOIN news_display_states s ON s.post_id=n.id
      WHERE n.id=? AND n.status='active' AND JSON_LENGTH(n.tags_json)>0 LIMIT 1`,[request.params.id])
    const article=rows[0]
    if(!article||!isOfficialUrl(String(article.articleUrl||'')))return reply.code(404).send({ok:false,error:'official_article_unavailable'})
    await pool.query(`INSERT INTO news_favorites(user_id,post_id,original_url,title,source_time) VALUES(?,?,?,?,?)
      ON DUPLICATE KEY UPDATE user_id=user_id`,[user.userId,article.id,article.articleUrl,article.title,article.publishedAt])
    return {ok:true,articleUrl:article.articleUrl}
  })
  app.delete<{Params:{id:string}}>('/me/news-favorites/:id',async(request,reply)=>{
    const user=await requireRole(request,reply,['student','teacher','staff','admin']);if(!user)return
    if(!uuid.safeParse(request.params.id).success)return reply.code(400).send({ok:false,error:'invalid_news_id'})
    await pool.query(`DELETE FROM news_favorites WHERE user_id=? AND post_id=?`,[user.userId,request.params.id])
    return {ok:true}
  })
  app.get('/me/news-retirements',async(request,reply)=>{
    const user=await requireRole(request,reply,['teacher','staff','admin']);if(!user)return
    const [rows]=await pool.query(`SELECT t.id AS taskId,t.batch_id AS batchId,t.state,t.note,t.updated_at AS updatedAt,
      n.title,JSON_UNQUOTE(JSON_EXTRACT(n.content_json,'$.sourceUpdatedAt')) AS sourceTime,
      UNIX_TIMESTAMP(s.retire_at) AS retireAtEpoch,s.phase,
      CASE WHEN t.updated_by IS NULL THEN NULL ELSE RIGHT(t.updated_by,6) END AS operatorSuffix
      FROM news_retirement_tasks t JOIN news_posts n ON n.id=t.post_id
      JOIN news_display_states s ON s.post_id=t.post_id ORDER BY t.updated_at DESC LIMIT 100`)
    const tasks=(rows as import('mysql2/promise').RowDataPacket[]).map(row=>({...row,retireAt:row.retireAtEpoch===null?null:new Date(Number(row.retireAtEpoch)*1000).toISOString(),retireAtEpoch:undefined}))
    if(user.role!=='admin')return {ok:true,tasks,unreadBatches:[]}
    const [unread]=await pool.query(`SELECT b.id,b.created_at AS createdAt,b.entered_json AS entered,
      b.affected_json AS affected FROM news_retirement_batches b
      LEFT JOIN news_retirement_reads r ON r.batch_id=b.id AND r.user_id=?
      WHERE r.batch_id IS NULL ORDER BY b.created_at DESC LIMIT 20`,[user.userId])
    return {ok:true,tasks,unreadBatches:unread}
  })
  app.post<{Params:{id:string}}>('/me/news-retirements/:id/read',async(request,reply)=>{
    const user=await requireRole(request,reply,['admin']);if(!user)return
    if(!uuid.safeParse(request.params.id).success)return reply.code(400).send({ok:false,error:'invalid_batch_id'})
    const [result]=await pool.query<import('mysql2/promise').ResultSetHeader>(`INSERT INTO news_retirement_reads(batch_id,user_id)
      SELECT id,? FROM news_retirement_batches WHERE id=? ON DUPLICATE KEY UPDATE user_id=user_id`,[user.userId,request.params.id])
    return result.affectedRows?{ok:true}:reply.code(404).send({ok:false,error:'batch_not_found'})
  })
  app.put<{Params:{id:string};Body:unknown}>('/me/news-retirement-tasks/:id',async(request,reply)=>{
    const user=await requireRole(request,reply,['admin']);if(!user)return
    const parsed=taskUpdate.safeParse(request.body)
    if(!uuid.safeParse(request.params.id).success||!parsed.success)return reply.code(400).send({ok:false,error:'invalid_task_update'})
    const conn=await pool.getConnection()
    try{
      await conn.beginTransaction()
      const [rows]=await conn.query<import('mysql2/promise').RowDataPacket[]>(`SELECT state,note FROM news_retirement_tasks WHERE id=? FOR UPDATE`,[request.params.id])
      const old=rows[0]
      if(!old){await conn.rollback();return reply.code(404).send({ok:false,error:'task_not_found'})}
      if(old.state!==parsed.data.state||String(old.note||'')!==parsed.data.note){
        await conn.query(`UPDATE news_retirement_tasks SET state=?,note=?,updated_by=? WHERE id=?`,[parsed.data.state,parsed.data.note,user.userId,request.params.id])
        await conn.query(`INSERT INTO news_task_audit(id,task_id,actor_id,from_state,to_state,note) VALUES(?,?,?,?,?,?)`,
          [randomUUID(),request.params.id,user.userId,old.state,parsed.data.state,parsed.data.note])
      }
      await conn.commit();return {ok:true}
    }catch(error){await conn.rollback();throw error}finally{conn.release()}
  })
}
