import assert from 'node:assert/strict'
import test from 'node:test'
import { isMissingTableError, missingOptionalTableAsEmpty } from './optional-table.js'

test('optional unavailable growth_records returns empty, not HTTP 500',async()=>{
  assert.deepEqual(await missingOptionalTableAsEmpty(async()=>{throw {cause:{code:'ER_NO_SUCH_TABLE',errno:1146}}}),[])
  assert.deepEqual(await missingOptionalTableAsEmpty(async()=>[{id:'record'}]),[{id:'record'}])
})

test('any other error is rethrown, not hidden by optional growth fallback',async()=>{
  await assert.rejects(missingOptionalTableAsEmpty(async()=>{throw new Error('connection refused')}),/connection refused/)
  assert.equal(isMissingTableError({code:'ER_BAD_FIELD_ERROR',errno:1054}),false)
  assert.equal(isMissingTableError({code:'ER_NO_SUCH_TABLE'}),true)
})
