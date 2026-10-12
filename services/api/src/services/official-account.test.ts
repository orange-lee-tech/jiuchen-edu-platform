import test from 'node:test'
import assert from 'node:assert/strict'
import { scanOfficialAccountPosts } from './official-account.js'
import {newsTimeView} from './news.js'
import type {AppEnv} from '../config/env.js'

test('official scan pages beyond 20 groups and never treats update time as publication time',async()=>{
 const before=globalThis.fetch,offsets:number[]=[]
 globalThis.fetch=async(url,options)=>{
  if(String(url).includes('/token'))return new Response(JSON.stringify({access_token:'synthetic-token',expires_in:7200}))
  const offset=JSON.parse(String(options?.body)).offset;offsets.push(offset)
  const n=offset===0?20:1
  return new Response(JSON.stringify({total_count:21,item:Array.from({length:n},(_,i)=>({article_id:'g'+(offset+i),update_time:1800000000,
   ...(offset===20?{publish_time:1800000001}:{}),content:{news_item:[{title:'合成文章'+(offset+i),content:'正文'}]}}))}))
 }
 try{
  const result=await scanOfficialAccountPosts({WECHAT_OA_APP_ID:'synthetic-pagination',WECHAT_OA_APP_SECRET:'synthetic-secret'} as AppEnv)
  assert.deepEqual(offsets,[0,20]);assert.equal(result.posts.length,21);assert.equal(result.truncated,false)
  assert.equal(result.posts[0].publishedAt,null);assert.ok(result.posts[0].content.sourceUpdatedAt)
  assert.equal(result.posts[20].content.publicationTimeSource,'explicit_publish_time')
  assert.equal(result.latestSourcePublishedAt,new Date(1800000001*1000).toISOString())
 }finally{globalThis.fetch=before}
})
test('truncated scan reports its real coverage and API errors never return an empty success',async()=>{
 const before=globalThis.fetch
 globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('/token')?{access_token:'synthetic'}:{total_count:100,item:Array.from({length:20},(_,i)=>({article_id:'g'+i,content:{news_item:[{title:'合成'}]}}))}))
 const env={WECHAT_OA_APP_ID:'synthetic-truncated',WECHAT_OA_APP_SECRET:'synthetic'} as AppEnv
 try{
  const scan=await scanOfficialAccountPosts(env,20);assert.equal(scan.truncated,true);assert.equal(scan.groupsFetched,20)
  globalThis.fetch=async()=>new Response(JSON.stringify({errcode:48001,errmsg:'do not echo remote message'}))
  await assert.rejects(scanOfficialAccountPosts(env),/official_account_publish_48001/)
 }finally{globalThis.fetch=before}
})
test('legacy update timestamps remain visible as source updates, never publication dates',()=>{
 const time=new Date('2026-09-25T01:00:02Z')
 const old=newsTimeView({source:'wechat_official',publishedAt:time})
 assert.equal(old.publishedAt,null);assert.equal(old.sourceUpdatedAt,time.toISOString())
 assert.equal(newsTimeView({source:'manual',publishedAt:time}).publishedAt,time)
})
