import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canAccessAdminWorkspace,
  canAccessTeacherWorkspace,
  canEditAcademicProfile,
  roleLabel,
} from './auth-policy.js'

test('guest and student may edit academic profile', () => {
  assert.equal(canEditAcademicProfile('user'), true)
  assert.equal(canEditAcademicProfile('student'), true)
  assert.equal(canEditAcademicProfile('teacher'), false)
})

test('teacher workspace requires teaching or internal role', () => {
  assert.equal(canAccessTeacherWorkspace('student'), false)
  assert.equal(canAccessTeacherWorkspace('teacher'), true)
  assert.equal(canAccessTeacherWorkspace('staff'), true)
  assert.equal(canAccessTeacherWorkspace('admin'), true)
})

test('mobile admin workspace requires admin role', () => {
  assert.equal(canAccessAdminWorkspace('admin'), true)
  assert.equal(canAccessAdminWorkspace('staff'), false)
  assert.equal(canAccessAdminWorkspace('teacher'), false)
})

test('ordinary unbound user is displayed as guest', () => {
  assert.equal(roleLabel('user'), '游客')
  assert.equal(roleLabel('student'), '学员')
})
