import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import {upsertOfficialAccountPosts} from './news.js'
import {registerNewsRoutes} from '../routes/news.js'
import {userSessions} from '../db/schema.js'
import type {DatabaseContext} from '../db/client.js'
import type {OfficialAccountPost} from './official-account.js'
const content={html:'合成正文',author:null,contentSourceUrl:null,sourceUpdatedAt:null,sourceCreatedAt:null,publicationTimeSource:'unverified' as const}
test('sync counts genuine changes, keeps reviewed tags and hidden state, and reports row failures',async()=>{
 const post:OfficialAccountPost={sourceKey:'synthetic',title:'合成标题',summary:null,coverUrl:null,articleUrl:null,publishedAt:null,content}
 const row={id:'synthetic',...post,contentJson:content,tagsJson:['已分类'],status:'hidden'}
 let written:Record<string,unknown>|null=null
 const db={select(){return {from(){return this},where(){return this},async limit(){return [row]}}},update(){return {set(value:Record<string,unknown>){written=value;return {async where(){}}}}}}
 const database={configured:true,db} as unknown as DatabaseContext&{configured:true}
 assert.equal((await upsertOfficialAccountPosts(database,[post])).unchanged,1)
 const changed=await upsertOfficialAccountPosts(database,[{...post,title:'更新合成标题'}])
 assert.equal(changed.updated,1);assert.ok(written);assert.equal('tagsJson' in written!,false);assert.equal('status' in written!,false)
 db.select=()=>{throw new Error('do not echo query or data')}
 const failed=await upsertOfficialAccountPosts(database,[post]);assert.equal(failed.failed,1);assert.equal(failed.errors[0].reason,'news_write_failed')
})
test('unclassified detail is blocked for anonymous/student but server-authenticated reviewers may read',async()=>{
 for(const role of [null,'student','teacher','admin']){
  const app=Fastify()
  const db={select(){let table:unknown;const q={from(t:unknown){table=t;return q},innerJoin(){return q},leftJoin(){return q},where(){return q},async limit(){return table===userSessions?[{userId:'synthetic',role,status:'active',internalIdStatus:'claimed',expiresAt:new Date('2099-01-01')}]:[{id:'synthetic',source:'wechat_official',status:'active',tagsJson:[],publishedAt:null,contentJson:content}]}};return q}}
  registerNewsRoutes(app,{configured:true,db} as unknown as DatabaseContext)
  const reply=await app.inject({url:'/news/synthetic',headers:role?{authorization:'Bearer synthetic'}:{}})
  assert.equal(reply.statusCode,role==='teacher'||role==='admin'?200:404)
  await app.close()
 }
})
