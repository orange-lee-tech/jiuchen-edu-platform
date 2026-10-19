import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import {registerNewsRoutes} from './news.js'
import {userSessions,newsPosts} from '../db/schema.js'
import type {DatabaseContext} from '../db/client.js'
import type {AppEnv} from '../config/env.js'

test('retired detail is available only to its saved owner; public list stays closed',async()=>{
  const id='00000000-0000-4000-8000-000000000001'
  const observed:Array<unknown[]>=[]
  const database={
    configured:true,
    db:{select(){
      let table:unknown
      const query={from(value:unknown){table=value;return query},innerJoin(){return query},leftJoin(){return query},where(){return query},
        async limit(){
          if(table===userSessions)return [{userId:'owner',role:'student',status:'active',internalIdStatus:'claimed',expiresAt:new Date('2099-01-01')}]
          if(table===newsPosts)return [{id,title:'已退役原文',summary:'摘要',coverUrl:null,articleUrl:'https://mp.weixin.qq.com/s/example',
            contentJson:{html:'<p>站内正文</p>'},tagsJson:['推免'],publishedAt:null,source:'wechat_official',status:'active'}]
          throw Error('unexpected table')
        }}
      return query
    }},
    pool:{async query(sql:string,values:unknown[]=[]){
      if(sql.includes('FROM news_display_states'))return [[{phase:'retired'}]]
      if(sql.includes('FROM news_favorites')){observed.push(values);return [values[0]==='owner'?[{post_id:id}]:[]]}
      throw Error('unexpected SQL')
    }},
  } as unknown as DatabaseContext
  const app=Fastify()
  registerNewsRoutes(app,database,{NEWS_V2_ENABLED:true} as AppEnv)
  const headers={authorization:'Bearer synthetic'}
  try{
    assert.equal((await app.inject({url:'/news/'+id})).statusCode,404)
    assert.equal((await app.inject({url:'/news/'+id,headers})).statusCode,200)
    assert.deepEqual(observed,[['owner',id]])
  }finally{await app.close()}
})
