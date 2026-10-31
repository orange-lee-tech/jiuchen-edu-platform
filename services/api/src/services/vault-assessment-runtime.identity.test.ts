import assert from 'node:assert/strict'
import test from 'node:test'
import type mysql from 'mysql2/promise'
import type { AppEnv } from '../config/env.js'
import { createVaultAssessmentRuntime } from './vault-assessment-runtime.js'
import type { readActiveAssessmentKey } from './assessment-key-objects.js'
test('a vault refresh cannot replace the prepared provider, model or identity used by an in-flight job',async()=>{
  const active=(id:string)=>({initialized:true as const,objectId:id,version:id==='first'?5:6,objectVersion:2,
    configurationFingerprint:id+'-fingerprint',config:{provider:'deepseek',model:id,temperature:.7,
      apiBaseUrl:'https://api.deepseek.com',apiKey:'synthetic-not-real'}})
  let current=active('first'),releaseValidation:()=>void=()=>{},entered:()=>void=()=>{}
  const validationEntered=new Promise<void>(resolve=>{entered=resolve})
  const waitValidation=new Promise<void>(resolve=>{releaseValidation=resolve})
  let firstValidation=true
  const vault=createVaultAssessmentRuntime({NODE_ENV:'test'} as AppEnv,{} as mysql.Pool,{
    readActive:(async()=>current) as typeof readActiveAssessmentKey,
    validateUrl:async url=>{if(firstValidation){firstValidation=false;entered();await waitValidation};return url},
    createProvider:config=>({provider:config.ASSESSMENT_AI_PROVIDER!,model:config.ASSESSMENT_AI_MODEL!,
      isConfigured:()=>true,async analyze(){return {model:config.ASSESSMENT_AI_MODEL}}}),
  })
  const prepared=vault.runtime.provider.prepare!();await validationEntered
  current=active('second');await vault.refresh();releaseValidation();await prepared
  assert.equal(vault.runtime.provider.model,'first')
  assert.equal(vault.runtime.diagnostics!().objectId,'first')
  assert.equal(vault.runtime.diagnostics!().objectVersion,2)
  assert.equal(vault.runtime.diagnostics!().version,5)
  await vault.refresh()
  assert.equal(vault.runtime.diagnostics!().objectId,'first')
  assert.equal(vault.runtime.provider.model,'first')
  await vault.runtime.provider.prepare!()
  assert.equal(vault.runtime.provider.model,'second')
  assert.equal(vault.runtime.diagnostics!().objectId,'second')
})
