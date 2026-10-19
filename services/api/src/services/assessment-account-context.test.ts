import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeHistory,summarizePlanning } from './assessment-account-context.js'
const report={
  profileSummary:'背景情况',strengths:[{title:'英语',detail:'英语较好',evidenceRefs:['input:profile']}],
  risks:[], targetAssessments:[{schoolName:'甲大学',programName:null,tier:'insufficient_data',
    rationale:'未有证据',gapItems:[],actions:[],evidenceRefs:['input:target:1']}],
  recommendedActions:[],similarCases:[],uncertainties:[],disclaimer:'仅供规划参考',
}
test('pending plan supersedes approved version and skips empty items',()=>{
  const text=summarizePlanning({
    plans:[{id:'a',stageCode:'junior-fall',type:'gpa',title:'已审核'}],
    pending:[{stageCode:'junior-fall',type:'gpa',title:'新稿',itemsJson:[{name:'高数',status:'in_progress'},{}]}],
    items:[{planId:'a',name:'旧目标',target:null,status:'done'}],
    schedules:[{parsedJson:{stageCode:'junior-fall',courses:[{name:'传热学'},{name:'传热学'}]}}],
  })
  assert.match(text,/新稿/);assert.match(text,/待审核/);assert.match(text,/高数/)
  assert.match(text,/传热学/);assert.equal(text.includes('旧目标'),false)
  assert.equal((text.match(/传热学/g)||[]).length,1)
})
test('no real plans or courses yields empty context',()=>{
  assert.equal(summarizePlanning({plans:[],pending:[],items:[],schedules:[{parsedJson:{courses:[]}}]}),'')
})
test('history is limited to 3 and deduplicates repeated advice',()=>{
  const rows=Array.from({length:5},(_,index)=>({completedAt:new Date(2026,9,index+1),outputJson:report}))
  const text=summarizeHistory(rows)
  assert.ok((text.match(/历史评估/g)||[]).length<=3)
  assert.equal((text.match(/优势：英语/g)||[]).length,1)
  assert.ok(text.length<=1450)
})
test('invalid prior report contributes no fabricated evidence',()=>{
  assert.equal(summarizeHistory([{completedAt:null,outputJson:{wrong:true}}]),'')
})
