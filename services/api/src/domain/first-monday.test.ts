import assert from 'node:assert/strict'
import test from 'node:test'
import { isFirstMonday } from './first-monday.js'

test('Monday-only schedule date accepts real ISO Mondays without timezone ambiguity',()=>{
  assert.equal(isFirstMonday('2026-09-07'),true)
  assert.equal(isFirstMonday('2024-03-04'),true)
  for(const invalid of ['2026-09-06','2026-09-08','2026-02-30',
    '2024-02-29','2026-13-04','2026-00-07','2026-9-7','2026-09-07T00:00:00Z',
    '',null,undefined,{},42]) assert.equal(isFirstMonday(invalid),false,String(invalid))
})
