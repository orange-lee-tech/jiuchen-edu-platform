import { randomUUID } from 'node:crypto'
import type mysql from 'mysql2/promise'
import { planNewsWindow, shouldCreateRetirementEvent, type DisplayCandidate, type DisplayState } from './news-lifecycle.js'

const toSql = (value: string) => value.slice(0, 19).replace('T', ' ')
const fromSql = (value: unknown) => value instanceof Date ? value.toISOString() : typeof value === 'string' ? new Date(value.replace(' ', 'T') + (value.endsWith('Z') ? '' : 'Z')).toISOString() : null

/** One MySQL advisory lock covers timer, manual sync and tag-triggered reconcile.
 * It is connection scoped and releases even when a request fails.
 */
export async function withNewsLock<T>(pool: mysql.Pool, work: (connection: mysql.PoolConnection) => Promise<T>) {
  const connection = await pool.getConnection()
  let locked = false
  try {
    const [rows] = await connection.query<mysql.RowDataPacket[]>("SELECT GET_LOCK('jiuchen_news_v2',0) AS acquired")
    if (Number(rows[0]?.acquired) !== 1) throw new Error('news_sync_busy')
    locked = true
    return await work(connection)
  } finally {
    try { if (locked) await connection.query("SELECT RELEASE_LOCK('jiuchen_news_v2')") }
    finally { connection.release() }
  }
}

export async function reconcileNewsWindow(connection: mysql.PoolConnection, now = new Date(), mutate?:()=>Promise<void>) {
  const [zone] = await connection.query<mysql.RowDataPacket[]>('SELECT @@session.time_zone AS zone')
  const original = String(zone[0]?.zone ?? 'SYSTEM')
  try {
    await connection.query("SET time_zone = '+00:00'")
    await connection.beginTransaction()
    if(mutate)await mutate()
    const [posts] = await connection.query<mysql.RowDataPacket[]>(`SELECT id, status,
      JSON_LENGTH(tags_json) AS tagCount,
      COALESCE(JSON_UNQUOTE(JSON_EXTRACT(content_json,'$.sourceUpdatedAt')), DATE_FORMAT(published_at,'%Y-%m-%dT%H:%i:%sZ')) AS sortTime
      FROM news_posts WHERE source='wechat_official' ORDER BY id`)
    const [previous] = await connection.query<mysql.RowDataPacket[]>(`SELECT post_id AS postId,phase,buffered_at AS bufferedAt,retire_at AS retireAt FROM news_display_states FOR UPDATE`)
    const candidates: DisplayCandidate[] = posts.map(row => ({ id:String(row.id),sortTime:row.sortTime?String(row.sortTime):null,approved:Number(row.tagCount)>0,hidden:row.status!=='active' }))
    const existing: DisplayState[] = previous.map(row => ({postId:String(row.postId),phase:row.phase,bufferedAt:fromSql(row.bufferedAt),retireAt:fromSql(row.retireAt)}))
    const plan=planNewsWindow(candidates,existing,now,true)
    for(const state of plan.changes) {
      await connection.query(`INSERT INTO news_display_states(post_id,phase,buffered_at,retire_at) VALUES(?,?,?,?)
        ON DUPLICATE KEY UPDATE phase=VALUES(phase),buffered_at=VALUES(buffered_at),retire_at=VALUES(retire_at)`,
        [state.postId,state.phase,state.bufferedAt?toSql(state.bufferedAt):null,state.retireAt?toSql(state.retireAt):null])
    }
    let batchId: string | null = null
    if(shouldCreateRetirementEvent(plan)) {
      batchId=randomUUID()
      await connection.query(`INSERT INTO news_retirement_batches(id,entered_json,affected_json) VALUES(?,?,?)`,
        [batchId,JSON.stringify(plan.entered),JSON.stringify(plan.leaving.map(row=>({postId:row.postId,retireAt:row.retireAt})))])
      for(const row of plan.leaving) await connection.query(`INSERT INTO news_retirement_tasks(id,batch_id,post_id) VALUES(?,?,?)`,[randomUUID(),batchId,row.postId])
    }
    await connection.commit()
    return {normalCount:plan.normalIds.length,bufferedCount:plan.leaving.length,enteredCount:plan.entered.length,batchId}
  } catch(error) { try { await connection.rollback() } catch {} throw error }
  finally { try { await connection.query('SET time_zone = ?', [original]) } catch { connection.destroy() } }
}

export async function recordNewsSync(pool:mysql.Pool, record:{status:'checked'|'partial'|'failed';fetched:number;created:number;updated:number;failed:number;latestSourceTime:string|null;errorCode:string|null}){
  // Bounded retention: a scheduled maintenance command can prune old runs only
  // after a separately reviewed retention policy. No implicit DELETE here.
  const connection=await pool.getConnection()
  try{
    await connection.query("SET time_zone = '+00:00'")
    await connection.query(`INSERT INTO news_sync_runs(id,status,fetched,created_count,updated_count,failed_count,latest_source_time,error_code)
      VALUES(?,?,?,?,?,?,?,?)`,[randomUUID(),record.status,record.fetched,record.created,record.updated,record.failed,record.latestSourceTime?toSql(record.latestSourceTime):null,record.errorCode])
  }finally{connection.destroy()}
}

export async function listNewsV2(pool:mysql.Pool, includeUnclassified=false){
  const [rows]=await pool.query<mysql.RowDataPacket[]>(`SELECT n.id,n.title,n.summary,n.cover_url AS coverUrl,n.article_url AS articleUrl,n.tags_json AS tagsJson,
    n.content_json AS contentJson,n.published_at AS publishedAt,n.source,n.status,s.phase,UNIX_TIMESTAMP(s.retire_at) AS retireAtEpoch
    FROM news_posts n LEFT JOIN news_display_states s ON s.post_id=n.id
    WHERE n.status='active' AND (n.source='manual' OR s.phase IN ('normal','buffering')) AND (? OR JSON_LENGTH(n.tags_json)>0)
    ORDER BY CASE WHEN n.source='manual' OR s.phase='normal' THEN 0 ELSE 1 END,
      COALESCE(JSON_UNQUOTE(JSON_EXTRACT(n.content_json,'$.sourceUpdatedAt')),DATE_FORMAT(n.published_at,'%Y-%m-%dT%H:%i:%sZ')) DESC,n.id ASC LIMIT 100`,[includeUnclassified?1:0])
  return rows
}

export async function getNewsV2PostPhase(pool:mysql.Pool,postId:string){
 const [rows]=await pool.query<mysql.RowDataPacket[]>(`SELECT phase FROM news_display_states WHERE post_id=? LIMIT 1`,[postId])
 return rows[0]?.phase as string|undefined
}
