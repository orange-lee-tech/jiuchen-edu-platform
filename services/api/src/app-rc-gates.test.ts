import assert from 'node:assert/strict'
import test from 'node:test'
import { buildApp } from './app.js'

const env={NODE_ENV:'test' as const,HOST:'127.0.0.1',PORT:3000,
 DATABASE_URL:undefined,WECHAT_APP_ID:undefined,WECHAT_APP_SECRET:undefined,
 WECHAT_OA_APP_ID:undefined,WECHAT_OA_APP_SECRET:undefined}

test('RC1 registered endpoints fail closed without a database, no phantom 404',async()=>{
 const app=buildApp(env)
 try {
  for(const spec of [
    {method:'GET' as const,url:'/me/read-only/students/student-id'},
    {method:'GET' as const,url:'/me/read-only/teachers/teacher-id'},
    {method:'GET' as const,url:'/me/read-only/students/student-id?stage=senior-fall&only=classroom'},
    {method:'PUT' as const,url:'/me/classroom/schedule-imports/import-id/term-start-date',
      payload:{termStartDate:'2026-09-07'}},
  ]){
    const response=await app.inject(spec)
    assert.equal(response.statusCode,503,spec.method+' '+spec.url)
    assert.deepEqual(response.json(),{ok:false,error:'database_not_configured'})
  }
 } finally {await app.close()}
})

test('read-only mirrors have no write-method endpoints',async()=>{
 const app=buildApp(env)
 try {
  for(const route of ['/me/read-only/students/another','/me/read-only/teachers/another']){
   for(const method of ['POST','PUT','PATCH','DELETE'] as const){
    const response=await app.inject({method,url:route})
    assert.equal(response.statusCode,404,method+' '+route)
   }
  }
 }finally{await app.close()}
})
