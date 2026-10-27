import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import { loadEnv } from '../config/env.js'
import type { WechatPayGateway } from '../services/wechat-pay.js'
import { registerCommercialRoutes } from './commercial.js'

function fixture(role:'student'|'admin') {
  const db={select(){const query={from(){return query},innerJoin(){return query},
    leftJoin(){return query},where(){return query},async limit(){return [{
      sessionId:'session',userId:'00000000-0000-4000-8000-000000000001',role,
      displayName:role,status:'active',internalIdStatus:'claimed',
      expiresAt:new Date('2099-01-01T00:00:00Z'),
    }]}};return query}}
  const statements:Array<{sql:string;params:unknown[]|undefined}>=[]
  const pool={async query(sql:string,params?:unknown[]){statements.push({sql,params});return [[]]}}
  const database={configured:true,db,pool} as unknown as DatabaseContext
  const app=Fastify()
  registerCommercialRoutes(app,database,async()=>({creditEnforcementEnabled:false,
    platformPriceConfirmed:false,adminSettingsApplied:false,paymentSkus:[]}) as never,
  {} as WechatPayGateway,loadEnv({}))
  return {app,statements}
}

test('student may read only own purchase list and cannot inspect administrator cases',async()=>{
  const {app,statements}=fixture('student')
  try {
    const unauthorized=await app.inject({method:'GET',url:'/me/virtual-payment-orders'})
    assert.equal(unauthorized.statusCode,401)
    const own=await app.inject({method:'GET',url:'/me/virtual-payment-orders',
      headers:{authorization:'Bearer synthetic'}})
    assert.equal(own.statusCode,200)
    assert.equal(own.json().orders.length,0)
    assert.deepEqual(statements[0]?.params,['00000000-0000-4000-8000-000000000001'])
    for(const url of ['/me/admin/virtual-payment-orders','/me/admin/virtual-payment-cases',
      '/me/admin/virtual-payment-reconciliation']) {
      const response=await app.inject({method:'GET',url,
        headers:{authorization:'Bearer synthetic'}})
      assert.equal(response.statusCode,403)
    }
  } finally {await app.close()}
})

test('after-sales request cannot be created for another or unverified order',async()=>{
  const {app}=fixture('student')
  try {
    const response=await app.inject({method:'POST',
      url:'/me/virtual-payment-orders/00000000-0000-4000-8000-000000009001/after-sales',
      headers:{authorization:'Bearer synthetic'},payload:{}})
    assert.equal(response.statusCode,404)
  } finally {await app.close()}
})
