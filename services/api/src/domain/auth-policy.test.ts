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


test('academic profile editing stays on the student side', async () => {
  const { canEditAcademicProfile } = await import('./auth-policy.js')
  assert.equal(canEditAcademicProfile('user'), true)
  assert.equal(canEditAcademicProfile('student'), true)
  assert.equal(canEditAcademicProfile('teacher'), false)
})

test('teacher workspace requires an internal teaching role', async () => {
  const { canAccessTeacherWorkspace } = await import('./auth-policy.js')
  assert.equal(canAccessTeacherWorkspace('student'), false)
  assert.equal(canAccessTeacherWorkspace('teacher'), true)
  assert.equal(canAccessTeacherWorkspace('staff'), true)
  assert.equal(canAccessTeacherWorkspace('admin'), true)
})
