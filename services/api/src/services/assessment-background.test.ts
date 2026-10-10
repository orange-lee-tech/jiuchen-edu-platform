import assert from 'node:assert/strict'
import test from 'node:test'
import {
  processAssessmentBackgroundJob,
  type AssessmentBackgroundStore,
} from './assessment-background.js'
import type { AssessmentNotificationAdapter } from './assessment-notification.js'
import type {
  AssessmentModelProvider,
  AssessmentRetriever,
  AssessmentRuntime,
} from './assessment-runtime.js'

const assessmentInput = {
  profile: {
    university: '示例大学',
    major: '人工智能',
    currentGrade: '大三',
    rankText: '5/100',
  },
  english: [],
  research: [],
  competitions: [],
  targets: [{ schoolName: '目标大学' }],
}

const silentLogger = {
  info() {},
  warn() {},
  error() {},
}

function createSuccessRuntime(): AssessmentRuntime {
  const retriever: AssessmentRetriever = {
    async retrieve() {
      return {
        version: 'knowledge-v1',
        evidence: [{
          ref: 'case:real',
          kind: 'case',
          sourceType: 'external',
          sourceId: 'real',
          title: '真实案例',
          sourceLabel: '案例库',
        }],
      }
    },
  }

  const provider: AssessmentModelProvider = {
    provider: 'mock-provider',
    model: 'mock-model',
    isConfigured: () => true,
    async analyze() {
      return {
        profileSummary: '背景摘要',
        strengths: [],
        risks: [],
        targetAssessments: [{
          schoolName: '目标大学',
          tier: 'match',
          rationale: '基于真实案例进行有限判断。',
          gapItems: [],
          actions: [],
          evidenceRefs: ['case:real'],
        }],
        recommendedActions: [],
        similarCases: [],
        uncertainties: [],
        disclaimer: '仅用于规划辅助。',
      }
    },
  }

  return { retriever, provider }
}

test('background assessment persists success and emits terminal notification', async () => {
  let succeeded = false
  let failed = false
  const events: string[] = []
  const store: AssessmentBackgroundStore = {
    async nextRunning() { return null },
    async persistSuccess() { succeeded = true },
    async persistFailure() { failed = true },
  }
  const notification: AssessmentNotificationAdapter = {
    channel: 'wechat_subscribe',
    isConfigured: () => true,
    async notify(event) {
      events.push(`${event.assessmentId}:${event.status}`)
      return { delivered: true, channel: 'wechat_subscribe', reason: 'delivered' }
    },
  }

  const result = await processAssessmentBackgroundJob({
    job: { id: 'assessment-1', userId: 'user-1', inputJson: assessmentInput },
    store,
    runtime: createSuccessRuntime(),
    notification,
    logger: silentLogger,
  })

  assert.equal(result, 'succeeded')
  assert.equal(succeeded, true)
  assert.equal(failed, false)
  assert.deepEqual(events, ['assessment-1:succeeded'])
})

test('background assessment persists failed state instead of surfacing model errors to HTTP callers', async () => {
  let failureCode = ''
  const events: string[] = []
  const runtime = createSuccessRuntime()
  runtime.provider = {
    provider: 'mock-provider',
    model: 'mock-model',
    isConfigured: () => true,
    async analyze() { throw new Error('provider failure') },
  }
  const store: AssessmentBackgroundStore = {
    async nextRunning() { return null },
    async persistSuccess() { assert.fail('success must not persist') },
    async persistFailure(_job, code) { failureCode = code },
  }
  const notification: AssessmentNotificationAdapter = {
    channel: 'none',
    isConfigured: () => false,
    async notify(event) {
      events.push(`${event.assessmentId}:${event.status}`)
      return { delivered: false, channel: 'none', reason: 'not_configured' }
    },
  }

  const result = await processAssessmentBackgroundJob({
    job: { id: 'assessment-2', userId: 'user-2', inputJson: assessmentInput },
    store,
    runtime,
    notification,
    logger: silentLogger,
  })

  assert.equal(result, 'failed')
  assert.equal(failureCode, 'assessment_execution_failed')
  assert.deepEqual(events, ['assessment-2:failed'])
})

test('background context includes only server loader result with default-on toggles', async () => {
  const records: Array<{userId:string;assessmentId:string;includePlanning:boolean;includeRecentAssessments:boolean}> = []
  const runtime=createSuccessRuntime()
  runtime.provider.analyze = async ({knowledge}) => {
    assert.ok(knowledge.evidence.some(x=>x.ref==='account:planning'))
    return {profileSummary:'有规划',strengths:[],risks:[],targetAssessments:[{
      schoolName:'目标大学',tier:'insufficient_data',rationale:'缺少官方依据',
      gapItems:[],actions:[],evidenceRefs:['account:planning'],
    }],recommendedActions:[],similarCases:[],uncertainties:[],disclaimer:'仅供参考'}
  }
  const notifications:AssessmentNotificationAdapter={channel:'none',isConfigured:()=>false,
    async notify(){return {delivered:false,channel:'none',reason:'not_configured'}}}
  const result=await processAssessmentBackgroundJob({
    job:{id:'new-run',userId:'owner',inputJson:{...assessmentInput}},
    store:{async nextRunning(){return null},async persistSuccess(){},async persistFailure(){assert.fail('unexpected failure')}},
    runtime,notification:notifications,logger:silentLogger,
    accountContextLoader:async args=>{
      records.push(args)
      return [{ref:'account:planning',kind:'other',sourceType:'internal',sourceId:null,
        title:'本人规划',sourceLabel:'本人资料',sourceUrl:null,excerpt:'有进度'}]
    },
  })
  assert.equal(result,'succeeded')
  assert.deepEqual(records,[{userId:'owner',assessmentId:'new-run',includePlanning:true,includeRecentAssessments:true}])
})
test('background account-context preferences can disable both sources', async () => {
  const calls:unknown[]=[]
  const notification:AssessmentNotificationAdapter={channel:'none',isConfigured:()=>false,
    async notify(){return {delivered:false,channel:'none',reason:'not_configured'}}}
  const result=await processAssessmentBackgroundJob({
    job:{id:'skip',userId:'owner',inputJson:{...assessmentInput,
      contextOptions:{includePlanning:false,includeRecentAssessments:false}}},
    store:{async nextRunning(){return null},async persistSuccess(){},async persistFailure(){assert.fail('unexpected failure')}},
    runtime:createSuccessRuntime(),notification,logger:silentLogger,
    accountContextLoader:async args=>{calls.push(args);return []},
  })
  assert.equal(result,'succeeded')
  assert.deepEqual(calls,[{userId:'owner',assessmentId:'skip',includePlanning:false,includeRecentAssessments:false}])
})
