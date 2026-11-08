import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import Module from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const originalLoad = Module._load
const filename = path.resolve(import.meta.dirname, '../miniprogram/pages/assessment-form/assessment-form.ts')
let definition, rejectRun, purchaseModal = null, mineRoute = ''
class ApiRequestError extends Error { constructor(code) { super(code); this.code = code } }
globalThis.Page = value => { definition = value }
globalThis.wx = { showToast() {}, showModal(options) { purchaseModal = options }, redirectTo() {}, switchTab({url}) { mineRoute = url } }
Module._load = function (id, parent, isMain) {
  if (id.endsWith('/auth')) return { getSavedAuthResult: () => ({ user: { id: 'student-a', role: 'student' } }) }
  if (id.endsWith('/assessment-school-names')) return { filterAssessmentSchools: query => ['北京大学', '清华大学'].filter(n => n.includes(query)) }
  if (id.endsWith('/navigation')) return { authorizePage() {}, safeBack() {} }
  if (id.endsWith('/cloud-upload')) return { uploadAuthenticatedCloudFile() {} }
  if (id.endsWith('/request')) return {
    ApiRequestError, friendlyRequestError: error => error.code || '网络失败',
    createAssessmentDraft: async () => ({ id: 'draft-1' }),
    updateAssessmentDraft: async () => ({}),
    runMyAssessment: () => new Promise((resolve, reject) => { rejectRun = reject }),
    getMyAcademicProfile: async () => ({ university: '后台学校', major: '后台专业', currentGrade: '大三', gpaText: null, rankText: null }),
  }
  return originalLoad.call(this, id, parent, isMain)
}
const source = readFileSync(filename, 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const loaded = new Module(filename)
loaded.filename = filename
loaded.paths = Module._nodeModulePaths(path.dirname(filename))
loaded._compile(output, filename)
Module._load = originalLoad

test('insufficient credits prompts purchase in Mine without clearing assessment input during a delayed run', async () => {
  const page = { ...definition, data: structuredClone(definition.data),
    setData(patch) { Object.assign(this.data, patch) },
    buildInput() { return { profile: this.data.profile, english: this.data.english } },
  }
  page.data.providerConfigured = true
  page.data.profile.university = '保留的院校'
  page.data.english = [{ type: 'cet6', score: '550' }]
  const pending = page.onRunAssessment()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(page.data.saving, true)
  assert.equal(page.data.draftId, 'draft-1')
  rejectRun(new ApiRequestError('assessment_credit_insufficient'))
  await pending
  assert.equal(page.data.saving, false)
  assert.equal(page.data.profile.university, '保留的院校')
  assert.equal(page.data.english[0].score, '550')
  assert.equal(purchaseModal?.title, '评估次数不足')
  purchaseModal.success({ confirm: true })
  assert.equal(mineRoute, '/pages/profile/profile')
})

test('returning from Mine refreshes untouched profile fields and keeps edited assessment fields', async () => {
  const page = { ...definition, data: structuredClone(definition.data), setData(patch) {
    for (const [key, value] of Object.entries(patch)) {
      const [section, field] = key.split('.')
      if (field) this.data[section][field] = value
      else this.data[key] = value
    }
  } }
  page.data.profileReady = true
  page.data.loading = false
  page.academicProfileSnapshot = { university: '原学校', major: '原专业', currentGrade: '大二', gpaText: '', rankText: '' }
  page.data.profile = { ...page.data.profile, university: '评估草稿学校', major: '原专业', currentGrade: '大二', backgroundNote: '未保存备注' }
  page.onShow()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(page.data.profile.university, '评估草稿学校')
  assert.equal(page.data.profile.major, '后台专业')
  assert.equal(page.data.profile.backgroundNote, '未保存备注')
})

test('name-only school multi-select caps five and requires shared research direction for submit', () => {
  const page = { ...definition, data: structuredClone(definition.data),
    setData(patch) { Object.assign(this.data, patch) } }
  for (const name of ['甲大学','乙大学','丙大学','丁大学','戊大学']) {
    page.data.schoolQuery = name
    page.onAddManualSchool()
  }
  assert.equal(page.data.targets.length, 5)
  page.data.schoolQuery = '己大学'
  page.onAddManualSchool()
  assert.equal(page.data.targets.length, 5)
  page.onRemoveTarget({ currentTarget: { dataset: { index: 0 } } })
  assert.equal(page.data.targets.length, 4)
  page.data.profile = { university: '某本科院校', major: '某专业', currentGrade: '大三', gpaText: '', rankText: '', backgroundNote: '' }
  assert.throws(() => page.buildInput(), /请填写研究方向/)
  page.onResearchDirectionInput({ detail: { value: '电力系统' } })
  const input = page.buildInput()
  assert.equal(input.targets.length, 4)
  assert.ok(input.targets.every(t => t.researchDirection === '电力系统'))
  assert.equal(input.preferences.researchDirection, '电力系统')
})
