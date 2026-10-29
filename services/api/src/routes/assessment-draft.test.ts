import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import { assessments, userProfiles, userSessions } from '../db/schema.js'
import { registerAssessmentRoutes } from './assessments.js'
import type { AssessmentRuntime } from '../services/assessment-runtime.js'

test('draft create, update and read preserve partial input; incomplete run never reserves or calls AI', async () => {
  let row: Record<string, unknown> | null = null, providerRefreshes=0, queued=0
  const db={
    select(){let table:unknown;const q={from(t:unknown){table=t;return q},innerJoin(){return q},leftJoin(){return q},where(){return q},orderBy(){return q},
      async limit(){return table===userSessions?[{userId:'u1',role:'student',status:'active',internalIdStatus:'claimed',expiresAt:new Date('2099-01-01')}]:
        table===userProfiles?[{university:'某校',major:'物理',currentGrade:'大三',gpaText:null,rankText:null}]:table===assessments&&row?[row]:[]} };return q},
    insert(){return {async values(value:Record<string,unknown>){row={...value,createdAt:new Date(),updatedAt:new Date()}}}},
    update(){return {set(value:Record<string,unknown>){return {async where(){row={...row,...value}}}}}},
  }
  const app=Fastify()
  const runtime={provider:{isConfigured:()=>true}} as unknown as AssessmentRuntime
  const dispatcher={wake(){queued++},completionNotification:{channel:'none' as const,configured:false}}
  registerAssessmentRoutes(app,{configured:true,db,pool:null} as unknown as DatabaseContext,runtime,undefined,dispatcher,undefined,async()=>{providerRefreshes++})
  const headers={authorization:'Bearer synthetic'}
  try {
    const created=await app.inject({method:'POST',url:'/me/assessments',headers,payload:{input:{}}})
    assert.equal(created.statusCode,201);const id=created.json().assessment.id
    const partial={profile:{university:'某校'},targets:[{schoolName:'',programName:'待定'}]}
    const updated=await app.inject({method:'PUT',url:'/me/assessments/'+id,headers,payload:{input:partial}})
    assert.equal(updated.statusCode,200)
    assert.deepEqual((await app.inject({url:'/me/assessments/'+id,headers})).json().assessment.input,partial)
    const run=await app.inject({method:'POST',url:'/me/assessments/'+id+'/run',headers})
    assert.equal(run.statusCode,422);assert.equal(run.json().error,'assessment_input_invalid')
    assert.equal(providerRefreshes,0);assert.equal(updated.json().assessment.creditConsumed,false)
    const invalid=await app.inject({method:'PUT',url:'/me/assessments/'+id,headers,payload:{input:{targets:Array(6).fill({})}}})
    assert.equal(invalid.statusCode,400);assert.equal(invalid.json().error,'invalid_assessment_draft')
    const complete={profile:{university:'某校',major:'物理',currentGrade:'大三'},targets:[{schoolName:'目标院校'}]}
    assert.equal((await app.inject({method:'PUT',url:'/me/assessments/'+id,headers,payload:{input:complete}})).statusCode,200)
    const accepted=await app.inject({method:'POST',url:'/me/assessments/'+id+'/run',headers})
    assert.equal(accepted.statusCode,202);assert.equal(accepted.json().assessment.status,'running')
    assert.equal(providerRefreshes,1);assert.equal(queued,1)
  } finally {await app.close()}
})
