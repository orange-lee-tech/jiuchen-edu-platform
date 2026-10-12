#!/usr/bin/env bash
# No synchronization writes, DDL, account mutation, restart or deployment.
# May be pasted as a subshell by an already authorized ECS operator.
(
set -euo pipefail
readlink -f /opt/jiuchen-api/current
systemctl is-active jiuchen-api.service
cd /opt/jiuchen-api/current/services/api
node --env-file=/etc/jiuchen-api/production.env --input-type=module <<'NODE'
import mysql from 'mysql2/promise'
import {createHash} from 'node:crypto'
const hash=value=>createHash('sha256').update(String(value)).digest('hex').slice(0,12)
const env=process.env
let db
const report={mode:'READ_ONLY',checkedAt:new Date().toISOString(),schema:[],sources:{},officialSource:null}
try{
 const target=env.DATABASE_URL?new URL(env.DATABASE_URL):null
 const connection=env.DATABASE_URL?{uri:env.DATABASE_URL,dateStrings:true,connectTimeout:5000}:{host:env.DB_HOST,port:Number(env.DB_PORT||3306),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,dateStrings:true,connectTimeout:5000}
 db=await mysql.createConnection(connection)
 const [identity]=await db.query('SELECT DATABASE() AS databaseName,@@session.time_zone AS sessionTimezone,@@system_time_zone AS systemTimezone, NOW() AS sessionNow, UTC_TIMESTAMP() AS utcNow')
 report.database={...identity[0],timeBasis:'Raw SQL timestamp strings; interpret using recorded sessionTimezone/sessionNow/utcNow.',instance:hash((target?.hostname||env.DB_HOST)+':'+(target?.port||env.DB_PORT||3306))}
 const tables=['assessments','payment_orders','credit_ledger_entries','credit_reservations','users','internal_ids','students','teachers','user_profiles','student_teacher_assignments','news_posts']
 const [columns]=await db.query('SELECT table_name AS tableName,column_name AS columnName,data_type AS type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN (?) ORDER BY table_name,ordinal_position',[tables])
 report.schema=columns
 await db.query('START TRANSACTION READ ONLY')
 async function read(name,sql){try{const [rows]=await db.query(sql);report.sources[name]={status:'ok',rows}}catch(error){report.sources[name]={status:'error',code:/^[A-Z0-9_]+$/.test(String(error.code))?error.code:'query_failed'}}}
 await read('assessments',`SELECT status,COUNT(*) AS tasks,SUM(completed_at IS NULL) AS withoutCompletedAt,SUM(started_at IS NOT NULL) AS everStarted,SUM(credit_consumed) AS consumedFlag FROM assessments GROUP BY status`)
 await read('recentAssessments',`SELECT id,status,completed_at AS completedAt,updated_at AS updatedAt FROM assessments WHERE status='succeeded' ORDER BY updated_at DESC LIMIT 5`)
 if(report.sources.recentAssessments?.status==='ok')report.sources.recentAssessments.rows=report.sources.recentAssessments.rows.map(({id,...rest})=>({sampleKey:hash(id),...rest}))
 await read('payments',`SELECT status,COUNT(*) AS orders,COALESCE(SUM(amount_fen),0) AS amountFen,COALESCE(SUM(credit_amount),0) AS credits FROM payment_orders GROUP BY status`)
 await read('ledger',`SELECT type,COUNT(*) AS entries,COALESCE(SUM(delta),0) AS credits FROM credit_ledger_entries GROUP BY type`)
 await read('reservations',`SELECT status,COUNT(*) AS entries,COALESCE(SUM(amount),0) AS credits FROM credit_reservations GROUP BY status`)
 await read('successWithoutDebit',`SELECT COUNT(*) AS tasks FROM assessments a WHERE a.status='succeeded' AND NOT EXISTS(SELECT 1 FROM credit_ledger_entries l WHERE l.assessment_id=a.id AND l.type='assessment_debit' AND l.delta<0)`)
 await read('news',`SELECT source_key AS sourceKey,title,published_at AS legacyStoredTime,source,status,JSON_LENGTH(tags_json) AS tagCount FROM news_posts ORDER BY published_at DESC LIMIT 10`)
 await read('identitySamples',`SELECT i.id,i.type,i.status,(i.user_id IS NOT NULL) AS bound,
 CASE WHEN i.type='student' THEN COALESCE(s.name<>'',0) WHEN i.type='teacher' THEN COALESCE(t.name<>'',0) ELSE 0 END AS hasCanonicalName,
 CASE WHEN i.type='student' THEN COALESCE(COALESCE(NULLIF(p.university,''),s.university)<>'',0) ELSE NULL END AS hasSchool,
 CASE WHEN i.type='student' THEN COALESCE(s.name REGEXP '测试|体验|演示|test|demo',0) WHEN i.type='teacher' THEN COALESCE(t.name REGEXP '测试|体验|演示|test|demo',0) ELSE COALESCE(u.display_name REGEXP '测试|体验|演示|test|demo',0) END AS testNamed,
 CASE WHEN i.type='student' THEN (SELECT COUNT(DISTINCT a.teacher_id) FROM student_teacher_assignments a WHERE a.student_id=s.id) WHEN i.type='teacher' THEN (SELECT COUNT(DISTINCT a.student_id) FROM student_teacher_assignments a JOIN students sx ON sx.id=a.student_id WHERE a.teacher_id=t.id AND sx.user_id IS NOT NULL) ELSE NULL END AS assignments,
 u.status AS userStatus,t.status AS teacherStatus
 FROM internal_ids i LEFT JOIN users u ON u.id=i.user_id LEFT JOIN students s ON i.type='student' AND s.id=i.entity_id LEFT JOIN teachers t ON i.type='teacher' AND t.id=i.entity_id LEFT JOIN user_profiles p ON p.user_id=i.user_id ORDER BY i.type,i.created_at`)
 if(report.sources.identitySamples?.status==='ok'){
  const all=report.sources.identitySamples.rows.map(({id,...rest})=>({sampleKey:hash(id),...rest}))
  report.sources.identitySamples.totalRows=all.length
  report.sources.identitySamples.rows=all.slice(0,20)
  const samples={studentUnclaimed:all.find(r=>r.type==='student'&&!r.bound&&r.status==='available')||null,
    studentBoundUnassigned:all.find(r=>r.type==='student'&&r.bound&&r.assignments===0)||null,
    studentAssigned:all.find(r=>r.type==='student'&&r.bound&&r.assignments>0)||null,
    teacher:all.find(r=>r.type==='teacher'&&r.bound)||null,admin:all.find(r=>r.type==='admin'&&r.bound)||null}
  report.sampleCoverage=Object.fromEntries(Object.entries(samples).map(([key,value])=>[key,value||{status:'MISSING_REAL_SAMPLE'}]))
 }
 await db.query('COMMIT')
}catch{report.databaseFailure='read_only_audit_failed_inspect_locally_without_sharing_credentials'}
finally{if(db)await db.end()}
// Official WeChat read only; it does not upsert any article.
try{
 if(!env.WECHAT_OA_APP_ID||!env.WECHAT_OA_APP_SECRET){report.officialSource={status:'not_configured'}}
 else{
  const url=new URL('https://api.weixin.qq.com/cgi-bin/token');url.searchParams.set('grant_type','client_credential');url.searchParams.set('appid',env.WECHAT_OA_APP_ID);url.searchParams.set('secret',env.WECHAT_OA_APP_SECRET)
  const tokenResponse=await fetch(url,{signal:AbortSignal.timeout(15000)}),token=await tokenResponse.json()
  if(!tokenResponse.ok||!token.access_token){report.officialSource={status:'error',code:token.errcode||'token_failed'}}
  else{
   const published=new URL('https://api.weixin.qq.com/cgi-bin/freepublish/batchget');published.searchParams.set('access_token',token.access_token)
   const scan={status:'ok',requestedGroupsPerPage:20,maxGroups:200,totalGroups:null,receivedGroups:0,truncated:false,firstItemKeys:[],firstContentKeys:[],samples:[]}
   const seen=new Set()
   let finished=false
   while(scan.receivedGroups<scan.maxGroups){
    const response=await fetch(published,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({offset:scan.receivedGroups,count:20,no_content:0}),signal:AbortSignal.timeout(15000)})
    const source=await response.json()
    if(!response.ok||source.errcode||!Array.isArray(source.item)){scan.status='error';scan.code=source.errcode||'invalid_response';break}
    if(typeof source.total_count==='number')scan.totalGroups=source.total_count
    if(scan.receivedGroups===0){scan.firstItemKeys=Object.keys(source.item[0]||{});scan.firstContentKeys=Object.keys(source.item[0]?.content||{})}
    let fresh=0
    for(const item of source.item){
     if(!item.article_id){scan.status='error';scan.code='missing_article_id';break}
     if(seen.has(item.article_id))continue
     seen.add(item.article_id);fresh++
     if(scan.samples.length<10){
      for(const [index,article] of (item.content?.news_item||[]).entries()){
       if(scan.samples.length>=10)break
       const sourceKey=item.article_id+':'+index
       const match=report.sources.news?.rows?.find(row=>row.sourceKey===sourceKey)
       scan.samples.push({sourceKey,title:article.title,rawPublishTime:item.publish_time??item.content?.publish_time??null,rawCreateTime:item.create_time??item.content?.create_time??null,rawUpdateTime:item.update_time??item.content?.update_time??null,databaseMatch:match||null})
      }
     }
    }
    scan.receivedGroups+=source.item.length
    if(scan.status==='error')break
    if(source.item.length<20||scan.totalGroups!==null&&scan.receivedGroups>=scan.totalGroups){finished=true;break}
    if(!fresh){scan.status='error';scan.code='pagination_no_progress';break}
   }
   scan.truncated=!finished
   scan.checkedAt=new Date().toISOString()
   scan.note='Source samples follow API order; raw update/create fields are not verified publication timestamps. No DB upsert occurred.'
   report.officialSource=scan
  }
 }
}catch{report.officialSource={status:'error',code:'official_read_failed_do_not_share_raw_errors'}}
console.log(JSON.stringify(report,null,2))
NODE
)
