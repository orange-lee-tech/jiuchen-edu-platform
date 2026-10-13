import test from 'node:test'
import assert from 'node:assert/strict'
import {identityDirectoryState} from './admin-identity-directory.js'
const base={type:'student',status:'claimed',userId:'synthetic',name:'合成姓名',university:'合成学校',assignmentCount:0,userStatus:'active'}
test('identity read model distinguishes claim, allocation and incomplete records without changing grants',()=>{
 assert.equal(identityDirectoryState({...base,status:'available',userId:null}).assignmentState,'unclaimed')
 assert.equal(identityDirectoryState({...base,status:'available',userId:null}).nameLabel,'未认领')
 assert.equal(identityDirectoryState(base).assignmentState,'unassigned')
 assert.equal(identityDirectoryState({...base,assignmentCount:1}).assignmentState,'assigned')
 const incomplete=identityDirectoryState({...base,name:'测试学员',university:null})
 assert.equal(incomplete.profileState,'incomplete');assert.equal(incomplete.nameLabel,'待完善实名');assert.equal(incomplete.auditCategory,'test_named_bound')
 const disabled=identityDirectoryState({...base,status:'disabled',assignmentCount:2})
 assert.equal(disabled.status,'disabled');assert.equal(disabled.assignmentState,'assigned')
 const teacher=identityDirectoryState({...base,type:'teacher',university:null});assert.equal(teacher.assignmentState,'unassigned');assert.equal(teacher.profileState,'recorded')
 const admin=identityDirectoryState({...base,type:'admin',name:null,assignmentCount:null});assert.equal(admin.assignmentState,'not_recorded');assert.equal(admin.nameLabel,'待完善实名');assert.equal(admin.assignmentLabel,'未分配');assert.equal(admin.assignmentCount,null)
})
