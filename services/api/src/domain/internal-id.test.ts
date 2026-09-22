import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeInternalBusinessId } from './internal-id.js'

test('normalizes internal id with or without separators', () => {
  assert.equal(normalizeInternalBusinessId('jcs-ud7d-2f9z'), 'JCS-UD7D-2F9Z')
  assert.equal(normalizeInternalBusinessId('JCSUD7D2F9Z'), 'JCS-UD7D-2F9Z')
  assert.equal(normalizeInternalBusinessId(' jct ud7d 2f9z '), 'JCT-UD7D-2F9Z')
})

test('keeps unknown values uppercase for normal validation path', () => {
  assert.equal(normalizeInternalBusinessId('unknown-id'), 'UNKNOWN-ID')
})
