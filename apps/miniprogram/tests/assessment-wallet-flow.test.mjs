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
let definition, rejectRun, purchasePanels = 0
class ApiRequestError extends Error { constructor(code) { super(code); this.code = code } }
globalThis.Page = value => { definition = value }
globalThis.wx = { showToast() {}, showModal() {}, redirectTo() {} }
Module._load = function (id, parent, isMain) {
  if (id.endsWith('/auth')) return { getSavedAuthResult: () => ({ user: { id: 'student-a', role: 'student' } }) }
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

test('insufficient credits opens the shared wallet without clearing assessment input during a delayed run', async () => {
  const page = { ...definition, data: structuredClone(definition.data),
    setData(patch) { Object.assign(this.data, patch) },
    selectComponent() { return { openPurchasePanel() { purchasePanels += 1 } } },
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
  assert.equal(purchasePanels, 1)
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
