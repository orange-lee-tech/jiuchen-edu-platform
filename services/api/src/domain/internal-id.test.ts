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

test('normalizes full-width and mixed punctuation consistently with mini-program', () => {
  assert.equal(normalizeInternalBusinessId('ＪＣＡ－４７７７－ＲＮＮＺ'), 'JCA-4777-RNNZ')
  assert.equal(normalizeInternalBusinessId('jca4777rnnz'), 'JCA-4777-RNNZ')
  assert.equal(normalizeInternalBusinessId('JCA—4777—RNNZ'), 'JCA-4777-RNNZ')
})

test('one-time admin can bootstrap without existing admin, but cannot claim twice', async () => {
  const { classifyInternalIdClaim } = await import('./internal-id.js')
  const available = {
    type: 'admin' as const,
    claimMode: 'admin' as const,
    status: 'available' as const,
    userId: null,
    entityId: null,
  }
  assert.equal(classifyInternalIdClaim(available), null)
  assert.equal(classifyInternalIdClaim({ ...available, status: 'claimed', userId: 'u1' }), 'internal_id_not_available')
  assert.equal(classifyInternalIdClaim({ ...available, status: 'disabled' }), 'internal_id_not_available')
  assert.equal(classifyInternalIdClaim(undefined), 'invalid_internal_id')
})

test('student/teacher still require their entities and self-claim mode', async () => {
  const { classifyInternalIdClaim } = await import('./internal-id.js')
  const student = {
    type: 'student' as const,
    claimMode: 'self' as const,
    status: 'available' as const,
    userId: null,
    entityId: 'student-1',
  }
  assert.equal(classifyInternalIdClaim(student), null)
  assert.equal(classifyInternalIdClaim({ ...student, entityId: null }), 'internal_id_not_ready')
  assert.equal(classifyInternalIdClaim({ ...student, claimMode: 'admin' }), 'internal_id_restricted')
})
