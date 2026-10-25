import assert from 'node:assert/strict'
import test from 'node:test'
import {
  acquireAssessmentLease,
  createAssessmentBackgroundWorker,
  createConfiguredStore,
  processAssessmentBackgroundJob,
  type AssessmentBackgroundStore,
} from './assessment-background.js'
import type { AssessmentNotificationAdapter } from './assessment-notification.js'
import type {
  AssessmentModelProvider,
  AssessmentRetriever,
  AssessmentRuntime,
} from './assessment-runtime.js'
import { JsonModelProviderHttpError, JsonModelProviderInvalidJsonError,
  JsonModelProviderTimeoutError } from './ai-provider.js'

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

test('background classifies provider failures, releases reservation through store, and never logs raw output', async () => {
  const failures: Array<[Error, string]> = [
    [new JsonModelProviderHttpError(401), 'assessment_ai_authentication'],
    [new JsonModelProviderHttpError(429), 'assessment_ai_quota_limited'],
    [new JsonModelProviderTimeoutError(), 'assessment_ai_timeout'],
    [new JsonModelProviderInvalidJsonError('private student and model output'), 'assessment_ai_invalid_json'],
  ]
  for (const [failure, expectedCode] of failures) {
    const logs: unknown[] = []
    const runtime = createSuccessRuntime()
    runtime.provider.analyze = async () => { throw failure }
    let released = false
    let notificationStatus = ''
    const result = await processAssessmentBackgroundJob({
      job: { id: 'assessment-failure', userId: 'user', inputJson: assessmentInput },
      runtime,
      store: { async nextRunning() { return null },
        async persistSuccess() { assert.fail('must not consume') },
        async persistFailure(_job, code) { assert.equal(code, expectedCode); released = true } },
      notification: { channel: 'none', isConfigured: () => false,
        async notify(event) { notificationStatus = event.status
          return { delivered: false, channel: 'none', reason: 'not_configured' } } },
      logger: { info(value: unknown) { logs.push(value) }, warn(value: unknown) { logs.push(value) },
        error(value: unknown) { logs.push(value) } } as any,
      creditEnforcementEnabled: true,
    })
    assert.equal(result, 'failed')
    assert.equal(released, true)
    assert.equal(notificationStatus, 'failed')
    assert.ok(logs.some(value => (value as { failureStage?: string }).failureStage === 'model_request'))
    assert.doesNotMatch(JSON.stringify(logs), /private student|private details/)
  }
})

test('database persistence error never emits success or claims a debit', async () => {
  const logs: unknown[] = []
  let notified = false
  await assert.rejects(processAssessmentBackgroundJob({
    job: { id: 'assessment-db-error', userId: 'user', inputJson: assessmentInput },
    runtime: createSuccessRuntime(),
    store: { async nextRunning() { return null },
      async persistSuccess() { throw new Error('private sql details') },
      async persistFailure() { assert.fail('ambiguous commit must not be blindly reversed') } },
    notification: { channel: 'none', isConfigured: () => false,
      async notify() { notified = true; return { delivered: false, channel: 'none', reason: 'not_configured' } } },
    logger: { info(value: unknown) { logs.push(value) }, warn(value: unknown) { logs.push(value) },
      error(value: unknown) { logs.push(value) } } as any,
  }), /private sql details/)
  assert.equal(notified, false)
  assert.doesNotMatch(JSON.stringify(logs), /private sql details|"creditConsumed":true/)
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

test('invalid report after one repair logs only schema paths and exact call count', async () => {
  const logs: unknown[] = []
  let repairs = 0
  const runtime = createSuccessRuntime()
  runtime.provider.analyze = async () => ({ secretStudentText: 'private student details' })
  runtime.provider.repair = async () => {
    repairs += 1
    return { secretStudentText: 'private student details' }
  }
  const result = await processAssessmentBackgroundJob({
    job: { id: 'assessment-schema', userId: 'user', inputJson: assessmentInput },
    runtime,
    store: { async nextRunning() { return null },
      async persistSuccess() { assert.fail('invalid report must not persist') },
      async persistFailure(_job, code) {
        assert.equal(code, 'assessment_ai_invalid_schema')
        return { creditSettlement: 'release_committed' }
      } },
    notification: { channel: 'none', isConfigured: () => false,
      async notify() { return { delivered: false, channel: 'none', reason: 'not_configured' } } },
    logger: { info(value: unknown) { logs.push(value) },
      warn(value: unknown) { logs.push(value) }, error(value: unknown) { logs.push(value) } } as any,
    creditEnforcementEnabled: true,
  })
  assert.equal(result, 'failed')
  assert.equal(repairs, 1)
  const failure = logs.find(value => (value as { failureCode?: string }).failureCode ===
    'assessment_ai_invalid_schema') as Record<string, unknown>
  assert.equal(failure.failureStage, 'report_validation')
  assert.equal(failure.modelRequestCount, 2)
  assert.equal(failure.repairResult, 'report_invalid')
  const issues = failure.validationIssues as Array<{ fieldPath: string; ruleCode: string }>
  assert.ok(issues.some(issue => issue.fieldPath === 'targetAssessments' &&
    issue.ruleCode === 'invalid_type'))
  assert.doesNotMatch(JSON.stringify(logs), /private student details|secretStudentText/)
})

function leaseFixture() {
  const status = new Map<string, string>([['job-1', 'running']])
  const held = new Set<string>()
  const state = { releases: 0, destroys: 0,
    failAcquire: false, failStatus: false, failRelease: false,
    failPoolRelease: false, inputJson: assessmentInput as unknown }
  const pool = { async getConnection() { return {
    async query(sql: string, params: unknown[] = []) {
      const id = String(params[0]).replace('jiuchen:assessment:', '')
      if (sql.includes('GET_LOCK')) {
        if (state.failAcquire) throw new Error('lock query failed')
        if (held.has(id)) return [[{ acquired: 0 }]]
        held.add(id)
        return [[{ acquired: 1 }]]
      }
      if (sql.includes('FROM assessments')) {
        if (state.failStatus) throw new Error('status query failed')
        return [status.has(id) ? [{ id, userId: 'user',
          inputJson: state.inputJson, status: status.get(id) }] : []]
      }
      if (sql.includes('RELEASE_LOCK')) {
        if (state.failRelease) throw new Error('release query failed')
        held.delete(id)
        return [[{ released: 1 }]]
      }
      assert.fail('unexpected SQL')
    },
    release() {
      if (state.failPoolRelease) throw new Error('pool release failed')
      state.releases += 1
    },
    destroy() { state.destroys += 1; held.clear() },
  } } } as any
  return { pool, status, held, state }
}

test('stale scanned task is rechecked under the lock and never claimed', async () => {
  const fixture = leaseFixture()
  fixture.status.set('job-1', 'succeeded')
  assert.equal(await acquireAssessmentLease(fixture.pool, 'job-1'), null)
  assert.equal(fixture.held.size, 0)
  assert.equal(fixture.state.releases, 1)
  assert.equal(fixture.state.destroys, 0)
})

test('duplicate claimant skips held task; final state blocks a later claimant', async () => {
  const fixture = leaseFixture()
  const first = await acquireAssessmentLease(fixture.pool, 'job-1')
  assert.ok(first)
  assert.equal(first.inputJson, assessmentInput)
  assert.equal(await acquireAssessmentLease(fixture.pool, 'job-1'), null)
  fixture.status.set('job-1', 'succeeded')
  await first.releaseLease()
  await first.releaseLease()
  assert.equal(await acquireAssessmentLease(fixture.pool, 'job-1'), null)
  assert.equal(fixture.held.size, 0)
  assert.equal(fixture.state.releases, 3)
})

test('contended lock with pool release failure destroys the connection', async () => {
  const fixture = leaseFixture()
  fixture.held.add('job-1')
  fixture.state.failPoolRelease = true
  await assert.rejects(acquireAssessmentLease(fixture.pool, 'job-1'), /pool release failed/)
  assert.equal(fixture.state.releases, 0)
  assert.equal(fixture.state.destroys, 1)
})

test('lock or status query failure cannot return a named lock to the pool', async () => {
  const lockFailure = leaseFixture()
  lockFailure.state.failAcquire = true
  await assert.rejects(acquireAssessmentLease(lockFailure.pool, 'job-1'), /lock query failed/)
  assert.equal(lockFailure.state.releases, 0)
  assert.equal(lockFailure.state.destroys, 1)

  const statusFailure = leaseFixture()
  statusFailure.state.failStatus = true
  await assert.rejects(acquireAssessmentLease(statusFailure.pool, 'job-1'), /status query failed/)
  assert.equal(statusFailure.held.size, 0)
  assert.equal(statusFailure.state.releases, 1)
})

test('release failure destroys the lock-owning connection', async () => {
  const fixture = leaseFixture()
  const job = await acquireAssessmentLease(fixture.pool, 'job-1')
  assert.ok(job)
  fixture.state.failRelease = true
  await assert.rejects(job.releaseLease(), /release query failed/)
  assert.equal(fixture.state.releases, 0)
  assert.equal(fixture.state.destroys, 1)
  assert.equal(fixture.held.size, 0)
})

test('bounded candidate scan reaches a later job when first batch is held', async () => {
  const fixture = leaseFixture()
  const ids = Array.from({ length: 33 }, (_, index) => `job-${index + 1}`)
  ids.forEach(id => fixture.status.set(id, 'running'))
  ids.slice(0, 32).forEach(id => fixture.held.add(id))
  const offsets: number[] = []
  const query = {
    from() { return this }, where() { return this }, orderBy() { return this },
    limit() { return this },
    async offset(value: number) {
      offsets.push(value)
      return ids.slice(value, value + 32).map(id => ({ id }))
    },
  }
  const database = { configured: true, pool: fixture.pool,
    db: { select() { return query } } } as any
  const store = createConfiguredStore(database, {
    creditEnforcementEnabled: false, freeGrant: null,
  })
  assert.equal(await store.nextRunning(), null)
  const next = await store.nextRunning()
  assert.equal(next?.id, 'job-33')
  assert.deepEqual(offsets, [0, 32])
  await next?.releaseLease?.()
})

function workerDatabase(ids: string[], failPersistId?: string) {
  const fixture = leaseFixture()
  fixture.state.inputJson = { ...assessmentInput,
    contextOptions: { includePlanning: false, includeRecentAssessments: false } }
  fixture.status.clear()
  ids.forEach(id => fixture.status.set(id, 'running'))
  const query = {
    from() { return this }, where() { return this }, orderBy() { return this },
    limit() { return this },
    async offset(value: number) {
      return ids.filter(id => fixture.status.get(id) === 'running')
        .slice(value, value + 32).map(id => ({ id }))
    },
  }
  const database = { configured: true, pool: fixture.pool,
    db: {
      select() { return query },
      update() { return { set(values: { status: string }) { return {
        async where() {
          const [id] = fixture.held
          assert.ok(id, 'terminal write must happen while the lease is held')
          if (id === failPersistId) throw new Error('private sql details')
          fixture.status.set(id, values.status)
        },
      } } } },
    },
  } as any
  return { database, ...fixture }
}

async function waitUntil(check: () => boolean) {
  const deadline = Date.now() + 3000
  while (!check()) {
    if (Date.now() > deadline) assert.fail('worker did not reach expected state')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

function workerOptions(database: any, runtime: AssessmentRuntime, logger: any = silentLogger) {
  return { database, runtime,
    commercial: { creditEnforcementEnabled: false, freeGrant: null },
    notification: { channel: 'none' as const, isConfigured: () => false,
      async notify() { return { delivered: false as const, channel: 'none' as const,
        reason: 'not_configured' as const } } },
    logger: logger as any, pollIntervalMs: 500 }
}

test('terminal persistence failure stops polling and prevents another provider call', async () => {
  const fixture = workerDatabase(['job-1'], 'job-1')
  const runtime = createSuccessRuntime()
  let providerCalls = 0
  const analyze = runtime.provider.analyze
  runtime.provider.analyze = async request => {
    providerCalls += 1
    return analyze(request)
  }
  const errors: unknown[] = []
  const worker = createAssessmentBackgroundWorker(workerOptions(fixture.database, runtime, {
    info() {}, warn() {}, error(value: unknown) { errors.push(value) },
  }))
  worker.start()
  try {
    await waitUntil(() => errors.some(value =>
      (value as { workerStopped?: boolean }).workerStopped === true))
    worker.wake()
    worker.start()
    await new Promise(resolve => setTimeout(resolve, 600))
    assert.equal(providerCalls, 1)
    assert.equal(fixture.status.get('job-1'), 'running')
    assert.equal(fixture.held.size, 0)
    assert.deepEqual(errors.filter(value =>
      (value as { workerStopped?: boolean }).workerStopped === true), [{ assessmentId: 'job-1',
      failureStage: 'terminal_persistence', errorCategory: 'internal',
      workerStopped: true, manualReviewRequired: true }])
    assert.doesNotMatch(JSON.stringify(errors), /private sql details/)
  } finally {
    worker.stop()
  }
})

test('successful terminal writes allow the worker to claim the next assessment', async () => {
  const fixture = workerDatabase(['job-1', 'job-2'])
  const runtime = createSuccessRuntime()
  let providerCalls = 0
  const analyze = runtime.provider.analyze
  runtime.provider.analyze = async request => {
    providerCalls += 1
    return analyze(request)
  }
  const worker = createAssessmentBackgroundWorker(workerOptions(fixture.database, runtime))
  worker.start()
  try {
    await waitUntil(() => fixture.status.get('job-2') === 'succeeded')
    assert.equal(fixture.status.get('job-1'), 'succeeded')
    assert.equal(providerCalls, 2)
  } finally {
    worker.stop()
  }
})

test('persisted failed assessment does not halt later work', async () => {
  const fixture = workerDatabase(['job-1', 'job-2'])
  const runtime = createSuccessRuntime()
  let providerCalls = 0
  const analyze = runtime.provider.analyze
  runtime.provider.analyze = async request => {
    providerCalls += 1
    if (providerCalls === 1) throw new Error('provider failure')
    return analyze(request)
  }
  const worker = createAssessmentBackgroundWorker(workerOptions(fixture.database, runtime))
  worker.start()
  try {
    await waitUntil(() => fixture.status.get('job-2') === 'succeeded')
    assert.equal(fixture.status.get('job-1'), 'failed')
    assert.equal(providerCalls, 2)
  } finally {
    worker.stop()
  }
})
