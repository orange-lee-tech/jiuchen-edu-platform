import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import type {DatabaseContext} from '../db/client.js'
import type mysql from 'mysql2/promise'
import {loadEnv} from '../config/env.js'
import {newsPosts,userSessions} from '../db/schema.js'
import {registerNewsRoutes} from './news.js'
import {registerMobileAdminRoutes} from './mobile-admin.js'
import {readAssessmentCommerceAnalytics} from '../services/commercial-analytics.js'

test('candidate keeps legacy news and admin identity reads independent of absent V2 and enrollment schema',async()=>{
 const session={userId:'synthetic-admin',role:'admin',expiresAt:new Date('2099-01-01')}
 const post={id:'synthetic-news',title:'合成旧资讯',summary:null,coverUrl:null,articleUrl:'https://mp.weixin.qq.com/s/synthetic',tagsJson:['已审核'],contentJson:{sourceUpdatedAt:'2026-10-12T00:00:00Z'},publishedAt:null,source:'wechat_official',status:'active'}
 const sql:string[]=[]
 const db={select(){let table:unknown;const q={from(value:unknown){table=value;return q},innerJoin(){return q},leftJoin(){return q},where(){return q},orderBy(){return q},async limit(){return table===userSessions?[session]:table===newsPosts?[post]:[]}};return q}}
 const database={configured:true,db,pool:{async query(statement:string){sql.push(statement);assert.doesNotMatch(statement,/enrollment_year|news_display_states|news_favorites|news_sync_runs|payment_orders|credit_ledger_entries|credit_reservations/);return [[]]}}} as unknown as DatabaseContext
 const env=loadEnv({NEWS_V2_ENABLED:'false'})
 const app=Fastify();registerNewsRoutes(app,database,env);registerMobileAdminRoutes(app,database,env)
 const headers={authorization:'Bearer synthetic'}
 for(const url of ['/news','/news/synthetic-news','/me/admin/news','/me/admin/internal-ids','/me/admin/read-only-directory']){
  const response=await app.inject({method:'GET',url,headers});assert.equal(response.statusCode,200,url+':'+response.body)
 }
 assert.equal((await app.inject({url:'/me/news-favorites',headers})).statusCode,404)
 assert.equal((await app.inject({url:'/me/admin/news',headers})).json().newsV2Enabled,false)
 assert.ok(sql.length>0);await app.close()
})

test('candidate retains successful assessment statistics with all three commercial tables absent',async()=>{
 const calls:string[]=[]
 const connection={async query(sql:string){calls.push(sql)
  if(sql.includes('@@session.time_zone'))return [[{timeZone:'SYSTEM'}]]
  if(sql.startsWith('SET '))return [[]]
  if(/payment_orders|credit_ledger_entries|credit_reservations/.test(sql))throw Object.assign(new Error('synthetic_missing_table'),{code:'ER_NO_SUCH_TABLE'})
  if(sql.includes('GROUP BY bucketKey'))return [[{bucketKey:'2026-10-12',cnt:sql.includes("status='succeeded'")?9:0}]]
  return [[{cnt:0}]]
 },release(){},destroy(){}}
 const pool={async getConnection(){return connection}} as unknown as mysql.Pool
 const result=await readAssessmentCommerceAnalytics(pool,'week',new Date('2026-10-12T04:00:00Z'))
 assert.equal(result.summary.assessmentCount,9)
 for(const source of ['payments','ledger','reservations'] as const)assert.equal(result.sources[source].error,'ER_NO_SUCH_TABLE')
 assert.equal(result.summary.rechargeAmountFen,null);assert.equal(result.summary.consumptionCount,null);assert.equal(result.reservations.held,null)
 assert.equal(calls.at(-1),'SET time_zone = ?')
})
