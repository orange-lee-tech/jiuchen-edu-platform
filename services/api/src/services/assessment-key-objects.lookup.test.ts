import assert from 'node:assert/strict'
import test from 'node:test'
import { pinnedAssessmentLookup } from './assessment-key-objects.js'

test('pinned HTTPS lookup honors Node 22 all-address callback contract', () => {
  const lookup = pinnedAssessmentLookup({ address: '8.8.8.8', family: 4 })
  lookup('api.example', { all: true }, (error, addresses, family) => {
    assert.equal(error, null)
    assert.deepEqual(addresses, [{ address: '8.8.8.8', family: 4 }])
    assert.equal(family, undefined)
  })
  lookup('api.example', { all: false }, (error, address, family) => {
    assert.equal(error, null)
    assert.equal(address, '8.8.8.8')
    assert.equal(family, 4)
  })
})
