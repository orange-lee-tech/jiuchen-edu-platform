const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../../apps/miniprogram/node_modules/typescript')
const base = path.resolve(__dirname, '../../apps/miniprogram/miniprogram')

function load(relative, mocks = {}) {
  let definition
  const modals = [], calls = []
  const wx = { showModal(options) { modals.push(options) }, showToast() {}, navigateTo() {} }
  const source = ts.transpileModule(fs.readFileSync(path.join(base, relative), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText
  vm.runInNewContext(source, {
    exports: {}, Component(value) { definition = value }, Page(value) { definition = value },
    require(target) {
      if (target.endsWith('read-only-context')) return { isReadOnly: () => false }
      if (target.endsWith('request')) return { request: async (...args) => { calls.push(args); return { results: [{studentId:'a',ok:true},{studentId:'b',ok:false,error:'student_not_assigned'}] } }, ...mocks }
      if (target.endsWith('navigation')) return { INITIAL_SHELL: {} }
      return mocks
    }, wx, console, Date, Set, Map, Promise,
  }, { filename: relative })
  const instance = { ...definition, ...definition.methods, data: JSON.parse(JSON.stringify(definition.data)),
    setData(value) { Object.assign(this.data, value) } }
  return { instance, modals, calls }
}

test('classroom full-week handler expands, folds and repeatedly toggles without changing the selected semester', () => {
  const { instance } = load('pages/classroom/classroom.ts')
  let reads = 0
  instance.loadCurrentWeek = () => { reads++ }
  Object.assign(instance.data, { selectedView: 'stage', currentStageCode: 'junior-fall', actualStageCode: 'senior-fall' })
  instance.onCurrentWeekSchedule()
  assert.equal(instance.data.selectedView, 'week'); assert.equal(reads, 1)
  instance.onCurrentWeekSchedule()
  assert.equal(instance.data.selectedView, 'stage'); assert.equal(reads, 1)
  instance.onCurrentWeekSchedule(); instance.onCurrentWeekSchedule()
  assert.equal(instance.data.selectedView, 'stage'); assert.equal(reads, 2)
  assert.equal(instance.data.currentStageCode, 'junior-fall'); assert.equal(instance.data.actualStageCode, 'senior-fall')
})

test('teacher workbench sends selected learners and custom plan to the real batch contract, displaying each result', async () => {
  const { instance, modals, calls } = load('components/teacher-workbench/teacher-workbench.ts')
  Object.assign(instance.data, {
    students: [{ studentId:'a',name:'合成甲' },{ studentId:'b',name:'合成乙' }], selectedIds:['a','b'],
    studentIndex:0,stageIndex:12,plans:[{type:'custom'}],planIndex:0,title:'个人安排',
    items:[{name:'任务',target:'目标',dueDate:null,status:'pending'}],
  })
  instance.onApply()
  assert.equal(calls.length,0)
  await modals[0].success({ confirm:true })
  assert.equal(calls[0][0],'/me/teacher/plans/apply')
  assert.equal(calls[0][1],'POST')
  assert.equal(calls[0][2].plan.type,'custom');assert.equal(calls[0][2].plan.stageCode,'senior-fall')
  assert.equal(JSON.stringify(calls[0][2].studentIds),JSON.stringify(['a','b']))
  assert.equal(instance.data.results[0].message,'已保存独立规划')
  assert.equal(instance.data.results[1].message,'分配关系已失效，未保存')
})

test('selecting another learner uses their actual stage and replaces the prior plan and summary', async () => {
  const lookups=[]
  const {instance}=load('components/teacher-workbench/teacher-workbench.ts',{
    getTeacherStudentClassroom:async(id,stage)=>{lookups.push([id,stage]);return {plans:[{type:'custom',title:'新学员规划',items:[{name:'本人任务',status:'pending'}]}]}},
    getTeacherStudentSummary:async id=>({owner:id}),
  })
  instance.data.students=[{studentId:'a',name:'合成甲',currentStage:'freshman-fall',stageLabel:'大一上'},{studentId:'b',name:'合成乙',currentStage:'senior-fall',stageLabel:'大四上'}]
  await instance.selectStudent(1)
  assert.equal(lookups[0][0],'b');assert.equal(lookups[0][1],'senior-fall')
  assert.equal(instance.data.title,'新学员规划');assert.equal(instance.data.summary.owner,'b')
})
