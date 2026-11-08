import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import Module from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const root = path.resolve(import.meta.dirname, '../miniprogram')
Module._extensions['.ts'] = (loaded, filename) => {
  const source = readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  loaded._compile(output, filename)
}

function loadTypeScript(relativePath) {
  const filename = path.join(root, relativePath)
  const source = readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const loaded = new Module(filename)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded._compile(output, filename)
  return loaded.exports
}

const { dailyScheduleView, weekdayScheduleView, weekMatches } = loadTypeScript('utils/schedule-view.ts')
const { initialPlanView } = loadTypeScript('utils/plan-navigation-intent.ts')
const { normalizePlanDraft } = loadTypeScript('utils/plan-editor-form.ts')
const { buildTeacherPlanPayload, presentTeacherApplyResults, remainingTeacherApplyTargets } = loadTypeScript('utils/teacher-plan-apply.ts')
const schedule = { termStartDate: '2021-12-27', courses: [] }
const atChinaNoon = (date) => new Date(`${date}T04:00:00.000Z`)

test('weekday selection stays in the current week from Friday and Sunday', () => {
  const friday = weekdayScheduleView(schedule, 1, atChinaNoon('2021-12-31'))
  const sunday = weekdayScheduleView(schedule, 1, atChinaNoon('2022-01-02'))
  assert.equal(friday.dateLabel, '12月27日 · 周一')
  assert.equal(sunday.dateLabel, '12月27日 · 周一')
  assert.equal(friday.week, 1)
  assert.equal(sunday.week, 1)
})

test('legacy daily offsets still mean today and tomorrow across year boundary', () => {
  const today = dailyScheduleView(schedule, 0, atChinaNoon('2021-12-31'))
  const tomorrow = dailyScheduleView(schedule, 1, atChinaNoon('2021-12-31'))
  assert.equal(today.dateLabel, '12月31日 · 周五')
  assert.equal(tomorrow.dateLabel, '1月1日 · 周六')
})

test('weekday view filters odd and even week courses', () => {
  const alternating = { ...schedule, courses: [
    { dayIndex: 1, weeks: '单周', startSection: 1 },
    { dayIndex: 1, weeks: '双周', startSection: 2 },
  ] }
  assert.deepEqual(weekdayScheduleView(alternating, 1, atChinaNoon('2021-12-27')).courses.map(c => c.weeks), ['单周'])
  assert.deepEqual(weekdayScheduleView(alternating, 1, atChinaNoon('2022-01-03')).courses.map(c => c.weeks), ['双周'])
  assert.equal(weekMatches('单周', 1), true)
  assert.equal(weekMatches('双周', 2), true)
})

test('first entry honors a fresh owner-matched week intent; account changes and expiry fall back to stage', () => {
  const now = 200000
  const intent = { intent: 'week', owner: 'student-a', createdAt: now - 1000 }
  assert.equal(initialPlanView('student-a', intent, now), 'week')
  assert.equal(initialPlanView('student-b', intent, now), 'stage')
  assert.equal(initialPlanView('student-a', { ...intent, createdAt: now - 120000 }, now), 'stage')
  assert.equal(initialPlanView('student-a', { ...intent, createdAt: now + 1 }, now), 'stage')
})

test('shared plan normalization requires a title, caps tasks, trims fields, and drops blank task names', () => {
  assert.equal(normalizePlanDraft('   ', []).ok, false)
  const normalized = normalizePlanDraft('  英语计划  ', [
    { name: '  单词复习 ', target: ' 每天  ', dueDate: '2026-11-12', status: 'in_progress' },
    { name: '   ', target: '', status: 'pending' },
  ])
  assert.equal(normalized.ok, true)
  assert.deepEqual(normalized.value, { title: '英语计划', items: [{ name: '单词复习', target: '每天', dueDate: '2026-11-12', status: 'in_progress' }] })
  const overLimit = normalizePlanDraft('计划', Array.from({ length: 51 }, (_, i) => ({ name: `任务${i}`, status: 'pending' })))
  assert.equal(overLimit.ok, false)
})

test('teacher apply strips server-owned item fields rejected by the strict batch schema', () => {
  const payload = buildTeacherPlanPayload('junior-fall', 'gpa', '  课程计划 ', [
    { id: 'server-plan-item-id', sortOrder: 8, name: '  高数 ', target: ' 完成复习 ', dueDate: '2026-11-20', status: 'in_progress' },
  ])
  assert.equal(payload.ok, true)
  assert.deepEqual(payload.value, {
    stageCode: 'junior-fall', type: 'gpa', title: '课程计划',
    items: [{ name: '高数', target: '完成复习', dueDate: '2026-11-20', status: 'in_progress' }],
  })
  assert.deepEqual(Object.keys(payload.value.items[0]).sort(), ['dueDate', 'name', 'status', 'target'])
  assert.equal(buildTeacherPlanPayload('junior-fall', 'gpa', '计划', [{ name: '', status: 'pending' }]).ok, false)
})

test('teacher batch result mapping distinguishes partial failures and excludes successes from retry targets', () => {
  const targetIds = ['student-a', 'student-b', 'student-c']
  const result = presentTeacherApplyResults([
    { studentId: 'student-a', ok: true, planId: 'plan-a' },
    { studentId: 'student-b', ok: false, error: 'student_not_assigned' },
  ], targetIds, [{ studentId: 'student-a', name: '小安' }, { studentId: 'student-b', name: '小宁' }])
  assert.equal(result.successCount, 1)
  assert.equal(result.failedCount, 2)
  assert.equal(result.rows[0].message, '已保存独立规划')
  assert.equal(result.rows[1].message, '分配关系已失效，未写入')
  assert.equal(result.rows[2].error, undefined)
  assert.match(result.rows[2].message, /result_missing/)
  assert.deepEqual(remainingTeacherApplyTargets(targetIds, ['student-a', 'student-a']), ['student-b', 'student-c'])
  assert.equal(presentTeacherApplyResults(undefined, targetIds, []), null)
})
