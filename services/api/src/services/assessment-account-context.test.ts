import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeConfirmedCourseFacts,summarizeHistory,summarizePlanning } from './assessment-account-context.js'
const report={
  profileSummary:'背景情况',strengths:[{title:'英语',detail:'英语较好',evidenceRefs:['input:profile']}],
  risks:[], targetAssessments:[{schoolName:'甲大学',programName:null,tier:'insufficient_data',
    rationale:'未有证据',gapItems:[],actions:[],evidenceRefs:['input:target:1']}],
  recommendedActions:[],similarCases:[],uncertainties:[],disclaimer:'仅供规划参考',
}
test('planning context uses saved plan and ignores historical pending drafts',()=>{
  const text=summarizePlanning({
    plans:[{id:'a',stageCode:'junior-fall',type:'gpa',title:'正式规划'}],
    items:[{planId:'a',name:'旧目标',target:null,status:'done'}],
    schedules:[{parsedJson:{stageCode:'junior-fall',courses:[{name:'传热学'},{name:'传热学'}]}}],
  })
  assert.match(text,/正式规划/);assert.match(text,/已保存规划/);assert.match(text,/旧目标/)
  assert.doesNotMatch(text,/待审核|老师认可/)
  assert.match(text,/传热学/)
  assert.equal((text.match(/传热学/g)||[]).length,1)
})
test('no real plans or courses yields empty context',()=>{
  assert.equal(summarizePlanning({plans:[],items:[],schedules:[{parsedJson:{courses:[]}}]}),'')
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

test('assessment reads confirmed course grades once and never infers GPA', () => {
  const courseKey = '3ba737aa-5af4-42ca-b24e-b85e56d9bb85'
  const row = { title: '高等数学', type: 'course', status: 'active', userConfirmed: true,
    metadataJson: { schemaVersion: 'course-academic-fact-v1', stageCode: 'freshman-fall', courseKey,
      credits: 3.5, gradeScale: 'percentage', gradeValue: '89' } }
  const text = summarizeConfirmedCourseFacts([row, row, { ...row, userConfirmed: false },
    { ...row, metadataJson: { ...row.metadataJson, gradeValue: null } },
    { ...row, metadataJson: { ...row.metadataJson, gradeValue: '101' } },
    { ...row, type: 'other' }])
  assert.match(text, /大一上\/高等数学：3.5 学分；百分制 89/)
  assert.equal((text.match(/高等数学/g) || []).length, 1)
  assert.match(text, /不作 GPA 换算/)
  assert.doesNotMatch(text, /101/)
})
