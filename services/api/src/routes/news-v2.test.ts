import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import { registerNewsV2Routes } from './news-v2.js'

function fixture(role:'student'|'teacher'|'admin'|null){
  const app=Fastify({logger:false})
  let calls=0
  const query={from(){return this},innerJoin(){return this},leftJoin(){return this},where(){return this},async limit(){
    return role?[{userId:'synthetic-user',role,status:'active',internalIdStatus:'claimed',expiresAt:new Date('2099-01-01')}]:[]
  }}
  const database={configured:true,db:{select(){return query}},pool:{async query(){calls++;return [[]]}}} as unknown as DatabaseContext
  registerNewsV2Routes(app,database)
  return {app,getCalls:()=>calls}
}

function adminFixture(userId:string,pool:Record<string,unknown>){
  const app=Fastify({logger:false})
  const query={from(){return this},innerJoin(){return this},leftJoin(){return this},where(){return this},async limit(){
    return [{userId,role:'admin',status:'active',internalIdStatus:'claimed',expiresAt:new Date('2099-01-01')}]
  }}
  const database={configured:true,db:{select(){return query}},pool} as unknown as DatabaseContext
  registerNewsV2Routes(app,database)
  return app
}

test('favorites are session scoped; unauthenticated and invalid IDs never touch the store',async()=>{
  const {app,getCalls}=fixture(null)
  assert.equal((await app.inject({method:'GET',url:'/me/news-favorites'})).statusCode,401)
  assert.equal((await app.inject({method:'PUT',url:'/me/news-favorites/invalid',headers:{authorization:'Bearer synthetic'}})).statusCode,401)
  assert.equal(getCalls(),0)
  await app.close()
  const student=fixture('student')
  assert.equal((await student.app.inject({method:'PUT',url:'/me/news-favorites/invalid',headers:{authorization:'Bearer synthetic'}})).statusCode,400)
  assert.equal(student.getCalls(),0)
  await student.app.close()
})

test('students and teachers cannot change retirement task state or mark admin alerts read',async()=>{
  for(const role of ['student','teacher'] as const){
    const {app,getCalls}=fixture(role)
    const headers={authorization:'Bearer synthetic'}
    assert.equal((await app.inject({method:'GET',url:'/me/news-retirements',headers})).statusCode,role==='student'?403:200)
    assert.equal((await app.inject({method:'POST',url:'/me/news-retirements/00000000-0000-4000-8000-000000000001/read',headers})).statusCode,403)
    assert.equal((await app.inject({method:'PUT',url:'/me/news-retirement-tasks/00000000-0000-4000-8000-000000000001',headers,payload:{state:'doing',note:''}})).statusCode,403)
    assert.equal(getCalls(),role==='teacher'?1:0)
    await app.close()
  }
})

test('each administrator reads retirement alerts through their own user-scoped receipt',async()=>{
  for(const userId of ['admin-one','admin-two']){
    const params:unknown[][]=[]
    const app=adminFixture(userId,{async query(sql:string,values:unknown[]=[]){
      params.push(values)
      return sql.includes('FROM news_retirement_batches')?[[{id:'batch-for-'+userId}]]:[[]]
    }})
    const response=await app.inject({method:'GET',url:'/me/news-retirements',headers:{authorization:'Bearer synthetic'}})
    assert.equal(response.statusCode,200)
    assert.equal(response.json().unreadBatches[0].id,'batch-for-'+userId)
    assert.deepEqual(params.at(-1),[userId])
    await app.close()
  }
})

test('only an administrator can persist an internal task note and audit its actor',async()=>{
  const calls:Array<{sql:string;params:unknown[]}>=[]
  const connection={
    async beginTransaction(){},async commit(){},async rollback(){},release(){},
    async query(sql:string,params:unknown[]=[]){
      calls.push({sql,params})
      if(sql.includes('SELECT state,note'))return [[{state:'todo',note:''}]]
      return [{affectedRows:1}]
    },
  }
  const app=adminFixture('admin-note-author',{async getConnection(){return connection}})
  const id='00000000-0000-4000-8000-000000000001'
  const response=await app.inject({method:'PUT',url:'/me/news-retirement-tasks/'+id,
    headers:{authorization:'Bearer synthetic'},payload:{state:'doing',note:'仅管理员内部备注'}})
  assert.equal(response.statusCode,200)
  const update=calls.find(call=>call.sql.includes('UPDATE news_retirement_tasks'))
  const audit=calls.find(call=>call.sql.includes('INSERT INTO news_task_audit'))
  assert.deepEqual(update?.params,['doing','仅管理员内部备注','admin-note-author',id])
  assert.equal(audit?.params[2],'admin-note-author')
  assert.equal(audit?.params[5],'仅管理员内部备注')
  await app.close()
})

test('personal favorites are idempotent, owner-scoped and retain original URLs after retirement',async()=>{
 const saved=new Map<string,{postId:string;title:string;articleUrl:string;phase:string}>()
 const id='00000000-0000-4000-8000-000000000001'
 for(const owner of ['one','two']){
  const app=adminFixture(owner,{async query(sql:string,params:unknown[]=[]){
   if(sql.includes('SELECT n.id'))return [[{id,title:'视频原文',articleUrl:'https://mp.weixin.qq.com/s/synthetic',publishedAt:null,phase:'normal'}]]
   if(sql.includes('INSERT INTO news_favorites')){const key=params[0]+':'+params[1];if(!saved.has(key))saved.set(key,{postId:id,title:String(params[3]),articleUrl:String(params[2]),phase:'retired'});return [{affectedRows:1}]}
   if(sql.includes('FROM news_favorites')){
    assert.ok(!sql.includes('JOIN news_posts'),'saved original URL must not depend on public article visibility')
    return [[...saved.entries()].filter(([key])=>key.startsWith(params[0]+':')).map(([,value])=>value)]
   }
   return [[]]
  }})
  const headers={authorization:'Bearer synthetic'}
  for(let i=0;i<2;i++)assert.equal((await app.inject({method:'PUT',url:'/me/news-favorites/'+id,headers})).statusCode,200)
  const list=(await app.inject({url:'/me/news-favorites',headers})).json().favorites
  assert.equal(list.length,1);assert.equal(list[0].phase,'retired');assert.equal(list[0].articleUrl,'https://mp.weixin.qq.com/s/synthetic')
  await app.close()
 }
 assert.equal(saved.size,2)
})

test('verified official fallback is admin-only, URL restricted and idempotent within the 30-item window',async()=>{
  const student=fixture('student')
  const payload={title:'合成保研资讯',articleUrl:'https://mp.weixin.qq.com/s/synthetic-original',
    publishedAt:'2026-10-12T13:00:00+08:00',tags:['保研'],mediaType:'article'}
  assert.equal((await student.app.inject({method:'POST',url:'/me/admin/news/verified-official',
    headers:{authorization:'Bearer synthetic'},payload})).statusCode,403)
  assert.equal(student.getCalls(),0)
  await student.app.close()

  const writes:Array<{sql:string;params:unknown[]}>=[]
  const state:{stored:{id:string;articleUrl:string;sourceKey:string}|null}={stored:null}
  const connection={
    async beginTransaction(){},async commit(){},async rollback(){},release(){},destroy(){},
    async query(sql:string,params:unknown[]=[]){
      if(sql.includes('GET_LOCK'))return [[{acquired:1}]]
      if(sql.includes('@@session.time_zone'))return [[{zone:'+00:00'}]]
      if(sql.includes('SELECT id,article_url AS articleUrl'))return [state.stored?[{id:state.stored.id,articleUrl:state.stored.articleUrl}]:[]]
      if(sql.includes("source='wechat_official' AND title=?"))return [[]]
      if(sql.includes('FROM news_posts WHERE source='))return [state.stored?[{id:state.stored.id,status:'active',tagCount:1,sortTime:'2026-10-12T05:00:00Z'}]:[]]
      if(sql.includes('FROM news_display_states FOR UPDATE'))return [[]]
      if(sql.includes('INSERT INTO news_posts')){
        writes.push({sql,params})
        state.stored={id:String(params[0]),sourceKey:String(params[1]),articleUrl:String(params[5])}
      }
      return [[]]
    },
  }
  const app=adminFixture('synthetic-admin',{async getConnection(){return connection}})
  const headers={authorization:'Bearer synthetic'}
  for(const badUrl of ['https://evil.example/s/abc','http://mp.weixin.qq.com/s/abc',
    'https://mp.weixin.qq.com.evil.example/s/abc']){
    assert.equal((await app.inject({method:'POST',url:'/me/admin/news/verified-official',
      headers,payload:{...payload,articleUrl:badUrl}})).statusCode,400)
  }
  const first=await app.inject({method:'POST',url:'/me/admin/news/verified-official',headers,payload})
  assert.equal(first.statusCode,200)
  assert.equal(first.json().created,true)
  const again=await app.inject({method:'POST',url:'/me/admin/news/verified-official',headers,payload})
  assert.equal(again.statusCode,200)
  assert.equal(again.json().created,false)
  assert.equal(again.json().id,first.json().id)
  assert.equal(writes.length,1)
  assert.equal(writes[0].params[5],payload.articleUrl)
  assert.equal(writes[0].params[8],'2026-10-12 05:00:00')
  assert.equal(JSON.parse(String(writes[0].params[6])).publicationTimeSource,'admin_verified_publish_record')
  await app.close()
})
