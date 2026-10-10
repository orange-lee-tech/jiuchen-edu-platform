import test from 'node:test'
import assert from 'node:assert/strict'
import {mayViewStudent,mayViewTeacher,readOnlyMethodAllowed} from './read-only-access.js'
test('teacher only sees an assigned student; no staff/user escalation',()=>{
  assert.equal(mayViewStudent('teacher',true),true)
  assert.equal(mayViewStudent('teacher',false),false)
  assert.equal(mayViewStudent('student',true),false)
  assert.equal(mayViewStudent('staff',true),false)
  assert.equal(mayViewStudent('admin',false),true)
})
test('only admin views teachers and mirror is GET-only',()=>{
  for(const role of ['student','user','staff','teacher'])assert.equal(mayViewTeacher(role),false)
  assert.equal(mayViewTeacher('admin'),true)
  for(const method of ['PUT','POST','PATCH','DELETE'])assert.equal(readOnlyMethodAllowed(method),false)
  assert.equal(readOnlyMethodAllowed('get'),true)
})
