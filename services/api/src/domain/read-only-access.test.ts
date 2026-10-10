import test from 'node:test'
import assert from 'node:assert/strict'
import {mayViewStudent,mayViewTeacher,readOnlyMethodAllowed,pickClassroomStudent} from './read-only-access.js'
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

test('removed teacher assignment always invalidates permission without session swapping',()=>{
  assert.equal(mayViewStudent('teacher',true),true)
  assert.equal(mayViewStudent('teacher',false),false)
  assert.equal(mayViewStudent('admin',false),true)
  assert.equal(mayViewStudent('user',true),false)
})

test('read-only classroom student is a strict allowlist, including nested stage projection',()=>{
  const full={id:'s1',userId:'private-account-id',name:'Student',university:'CSU',
    major:'Energy',currentStage:'senior-fall',privateToken:'never-expose'}
  const projected=pickClassroomStudent(full)
  assert.deepEqual(projected,{id:'s1',name:'Student',university:'CSU',
    major:'Energy',currentStage:'senior-fall'})
  assert.equal(Object.hasOwn(projected,'userId'),false)
  assert.equal(JSON.stringify(projected).includes('private-account-id'),false)
})
