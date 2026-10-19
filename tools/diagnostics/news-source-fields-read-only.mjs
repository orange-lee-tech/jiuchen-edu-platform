// Public metadata only; no app, DB, scraper, publication, worker or sync imports.
// Does not repeat the already-evidenced freepublish/batchget scan (40 groups/41 articles).
const env=process.env
const title=env.NEWS_AUDIT_TITLE||'中南大学保研看什么？成绩、综测与学院细则'
const secondTitle=env.NEWS_AUDIT_SECOND_TITLE||''
const day=env.NEWS_AUDIT_DATE||'2026-10-12'
if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z')))throw new Error('INVALID_AUDIT_DATE')
const report={mode:'READ_ONLY_SOURCE_COMPARISON',checkedAt:new Date().toISOString(),appIdSuffix:(env.WECHAT_OA_APP_ID||'').slice(-6),targetTitle:title,secondTitle:secondTitle||null,date:day,sources:[]}
const official=value=>{try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='mp.weixin.qq.com'}catch{return false}}
async function json(url,body){
 const response=await fetch(url,{signal:AbortSignal.timeout(15000),...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})})
 const data=await response.json()
 if(!response.ok||data.errcode)throw Object.assign(new Error('OFFICIAL_READ_FAILED'),{safeCode:data.errcode||'HTTP_'+response.status})
 return data
}
try{
 if(!env.WECHAT_OA_APP_ID||!env.WECHAT_OA_APP_SECRET)throw Object.assign(new Error(),{safeCode:'OFFICIAL_ACCOUNT_NOT_CONFIGURED'})
 const tokenUrl=new URL('https://api.weixin.qq.com/cgi-bin/token')
 tokenUrl.search=new URLSearchParams({grant_type:'client_credential',appid:env.WECHAT_OA_APP_ID,secret:env.WECHAT_OA_APP_SECRET}).toString()
 const auth=await json(tokenUrl)
 if(!auth.access_token)throw Object.assign(new Error(),{safeCode:'TOKEN_MISSING'})
 const endpoint=path=>{const url=new URL(path,'https://api.weixin.qq.com');url.searchParams.set('access_token',auth.access_token);return url}
 // Analytics is an authorized official read. A matching title/msgid alone is NOT an importable original URL.
 for(const date of [day,new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10)]){
  try{
   const payload=await json(endpoint('/datacube/getarticlesummary'),{begin_date:date,end_date:date})
   const items=Array.isArray(payload.list)?payload.list:[]
   report.sources.push({source:'getarticlesummary',date,returned:items.length,rows:items.map(row=>({title:row.title||null,msgid:row.msgid||null,refDate:row.ref_date||null,
    targetMatch:row.title===title,secondMatch:Boolean(secondTitle&&row.title===secondTitle)})),publicationAndUrlVerified:false})
  }catch(error){report.sources.push({source:'getarticlesummary',date,errorCode:error.safeCode||'READ_FAILED'})}
 }
 // Permanent materials may include unpublished content. Never classify these as published or auto-sync them.
 const materialRows=[],seen=new Set();let offset=0,total=null,complete=false,errorCode=null,pages=0
 try{
  for(;pages<3;){
   const payload=await json(endpoint('/cgi-bin/material/batchget_material'),{type:'news',offset,count:20})
   pages++;total=Number.isInteger(payload.total_count)?payload.total_count:total
   const groups=Array.isArray(payload.item)?payload.item:[]
   for(const group of groups){
    const id=String(group.media_id||'')
    if(!id||seen.has(id))throw Object.assign(new Error(),{safeCode:'MATERIAL_DUPLICATE_OR_MISSING_GROUP_ID'})
    seen.add(id)
    for(const row of group.content?.news_item||[])materialRows.push({title:row.title||null,mediaId:id,articleUrl:official(row.url)?row.url:null,
     updateTime:group.update_time||null,targetMatch:row.title===title,secondMatch:Boolean(secondTitle&&row.title===secondTitle)})
   }
   offset+=groups.length
   if(total!==null&&offset>=total){complete=true;break}
   if(groups.length<20){if(total===null)complete=true;break}
  }
 }catch(error){errorCode=error.safeCode||'READ_FAILED'}
 report.sources.push({source:'permanent_news_materials',pages,groups:seen.size,total,complete,errorCode,
  notPublicationEvidence:true,matches:materialRows.filter(row=>row.targetMatch||row.secondMatch),sample:materialRows.slice(0,10)})
 if(env.NEWS_AUDIT_ARTICLE_ID){
  try{
   const payload=await json(endpoint('/cgi-bin/freepublish/getarticle'),{article_id:env.NEWS_AUDIT_ARTICLE_ID})
   const items=payload.news_item||payload.content?.news_item||[]
   report.sources.push({source:'getarticle_supplied_id',rows:items.map(row=>({title:row.title||null,articleUrl:official(row.url)?row.url:null}))})
  }catch(error){report.sources.push({source:'getarticle_supplied_id',errorCode:error.safeCode||'READ_FAILED'})}
 }
 report.verdict='SOURCE_ADAPTER_NOT_APPROVED_REVIEW_FIELDS_AND_TWO_RECENT_ARTICLES'
}catch(error){report.errorCode=error.safeCode||'READ_FAILED';process.exitCode=1}
console.log(JSON.stringify(report,null,2))
