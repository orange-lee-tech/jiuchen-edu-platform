import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { HistoricalMoeSchoolSource } from './school-directory-knowledge.js'
import { assessmentInputSchema } from '../domain/assessment.js'
const source=new HistoricalMoeSchoolSource()
const target=(schoolName:string)=>assessmentInputSchema.parse({
  profile:{university:'中南大学',major:'能动',currentGrade:'大三'},
  targets:[{schoolName}],
})
test('school directory API mirror matches the miniprogram canonical school data',()=>{
  const command=fileURLToPath(new URL('../../../../tools/testing/generate-school-directory.cjs',import.meta.url))
  const output=execFileSync(process.execPath,[command,'--check'],{encoding:'utf8'})
  assert.match(output,/116 records/)
})
test('exact known target has official dated roster citation, not admissions proof',async()=>{
  const result=await source.retrieve(target('南京大学'))
  assert.equal(result.evidence.length,1)
  const item=result.evidence[0]
  assert.equal(item.kind,'other')
  assert.equal(item.year,2006)
  assert.equal(item.sourceType,'official')
  assert.match(item.excerpt||'',/不能证明2026年推免政策/)
})
test('unknown schools never receive guessed or fuzzy matched provenance',async()=>{
  const result=await source.retrieve(target('南京大学某某学院'))
  assert.deepEqual(result.evidence,[])
})
