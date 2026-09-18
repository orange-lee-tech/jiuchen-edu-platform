import assert from 'node:assert/strict'
import test from 'node:test'
import { canEnterPortal, needsStudentBinding } from './auth-policy.js'

test('teacher portal never trusts an ordinary user role', () => {
  assert.equal(canEnterPortal('user', 'teacher'), false)
  assert.equal(canEnterPortal('student', 'teacher'), false)
  assert.equal(canEnterPortal('teacher', 'teacher'), true)
})

test('staff and admin can enter teacher portal for internal support', () => {
  assert.equal(canEnterPortal('staff', 'teacher'), true)
  assert.equal(canEnterPortal('admin', 'teacher'), true)
})

test('new ordinary users may enter student onboarding without gaining student privileges', () => {
  assert.equal(canEnterPortal('user', 'student'), true)
  assert.equal(needsStudentBinding('user', 'student'), true)
  assert.equal(needsStudentBinding('student', 'student'), false)
})
