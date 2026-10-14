import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectProfileSchema, PROFILE_COLUMNS } from './profile-schema-contract.js'
const columns=PROFILE_COLUMNS.map(name=>({name,dataType:['created_at','updated_at'].includes(name)?'timestamp':name==='enrollment_year'?'int':'varchar',nullable:['id','user_id','created_at','updated_at'].includes(name)?'NO':'YES'}))
test('profile schema permits only the exact missing nullable enrollment column migration',()=>{
  assert.equal(inspectProfileSchema(columns).ready,true)
  assert.equal(inspectProfileSchema(columns.filter(c=>c.name!=='enrollment_year')).migrationNeeded,true)
  assert.equal(inspectProfileSchema(columns.filter(c=>!['enrollment_year','current_grade'].includes(c.name))).migrationNeeded,false)
  assert.equal(inspectProfileSchema([]).migrationNeeded,false)
  assert.equal(inspectProfileSchema(columns.map(c=>c.name==='enrollment_year'?{...c,nullable:'NO'}:c)).ready,false)
  assert.equal(inspectProfileSchema(columns.map(c=>c.name==='enrollment_year'?{...c,dataType:'varchar'}:c)).ready,false)
})
