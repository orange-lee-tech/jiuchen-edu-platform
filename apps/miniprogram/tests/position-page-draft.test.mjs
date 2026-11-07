import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import Module from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const originalLoad = Module._load
const originalTs = Module._extensions['.ts']
const filename = path.resolve(import.meta.dirname, '../miniprogram/pages/position/position.ts')
let auth = { user: { id: 'student-a', role: 'student' }, businessIdentity: null }
let readOnly = false
let savedPayload
let saveFails = false
let growthRecords = []
let growthWrite
let pageDefinition
globalThis.wx = { showModal() {}, showToast() {} }
globalThis.Page = definition => { pageDefinition = definition }
Module._extensions['.ts'] = (loaded, name) => {
  const output = ts.transpileModule(readFileSync(name, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  loaded._compile(output, name)
}
Module._load = function (id, parent, isMain) {
  if (id.endsWith('/auth')) return { getSavedAuthResult: () => auth }
  if (id.endsWith('/read-only-context')) return { isReadOnly: () => readOnly, getReadOnlyContext: () => null }
  if (id.endsWith('/navigation')) return { INITIAL_SHELL: {}, observeShell() {}, shellView: () => ({}), openSlot() {}, loginFor() {} }
  if (id.endsWith('/request')) return {
    friendlyRequestError: () => '网络失败',
    getMyAcademicProfile: async () => ({ university: '原学校', major: null, currentGrade: null, enrollmentYear: 2023, gpaText: null, rankText: null }),
    updateMyAcademicProfile: async payload => { savedPayload = payload; if (saveFails) throw new Error('offline'); return { ...payload, enrollmentYear: 2023 } },
    getMyGrowthProfile: async () => ({ profile: { records: growthRecords }, growthSchemaReady: true }),
    createMyGrowthRecord: async payload => { growthWrite = payload; growthRecords.push({ ...payload, id: 'record-1', standardExpression: payload.title, source: { type: 'manual' } }) },
    updateMyGrowthRecord: async (id, payload) => { growthWrite = payload; growthRecords = growthRecords.map(item => item.id === id ? { ...item, ...payload } : item) },
    deleteMyGrowthRecord: async id => { growthRecords = growthRecords.filter(item => item.id !== id) },
  }
  if (id.endsWith('/profile-cache')) return { saveCachedAcademicProfile: async () => {} }
  if (id.endsWith('/growth-profile-cache')) return { clearGrowthProfileBootstrapCache: async () => {} }
  return originalLoad.call(this, id, parent, isMain)
}
require(filename)
Module._load = originalLoad
Module._extensions['.ts'] = originalTs

function makePage() {
  return { ...pageDefinition, data: structuredClone(pageDefinition.data), detachedProfileDrafts: [], profileOwner: null,
    setData(patch) { for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.'); let target = this.data
      for (const part of parts.slice(0, -1)) target = target[part]
      target[parts.at(-1)] = value
    } },
  }
}

test('unsaved profile survives Tab hide and stays isolated when account changes', async () => {
  const page = makePage()
  page.profileOwner = 'student-a::'
  page.data.profileForm = { university: '原学校', major: '', currentGrade: '', gpaText: '', rankText: '' }
  page.data.profileDraft = { ...page.data.profileForm, university: '新学校' }
  page.onHide()
  assert.equal(page.data.profileNeedsResume, true)
  assert.equal(page.data.profileDraft.university, '新学校')
  auth = { user: { id: 'student-b', role: 'student' }, businessIdentity: null }
  page.initializePosition()
  assert.equal(page.data.profileDraft, null)
  assert.equal(page.detachedProfileDrafts[0].owner, 'student-a::')
  auth = { user: { id: 'student-a', role: 'student' }, businessIdentity: null }
  page.initializePosition()
  assert.equal(page.data.profileDraft.university, '新学校')
  assert.equal(page.data.profileNeedsResume, true)
})

test('save sends only visible fields; read-only identity cannot write', async () => {
  const page = makePage()
  page.profileOwner = 'student-a::'
  page.data.canEditProfile = true
  page.data.profileDraft = { university: ' 新学校 ', major: '', currentGrade: '大二', gpaText: '', rankText: '' }
  savedPayload = undefined
  readOnly = true
  await page.onSaveProfile()
  assert.equal(savedPayload, undefined)
  readOnly = false
  await page.onSaveProfile()
  assert.deepEqual(savedPayload, { university: '新学校', major: null, currentGrade: '大二', gpaText: null, rankText: null })
  assert.equal(page.data.profileDraft, null)
  assert.equal(page.data.profileForm.university, '新学校')
})

test('network failure keeps the draft and non-student role cannot edit', async () => {
  const page = makePage()
  page.profileOwner = 'student-a::'
  page.data.canEditProfile = true
  page.data.profileDraft = { university: '待保存', major: '', currentGrade: '', gpaText: '', rankText: '' }
  saveFails = true
  await page.onSaveProfile()
  saveFails = false
  assert.equal(page.data.profileDraft.university, '待保存')
  assert.equal(page.data.profileSaveError, '网络失败')
  auth = { user: { id: 'teacher-a', role: 'teacher' }, businessIdentity: null }
  page.initializePosition()
  assert.equal(page.data.canEditProfile, false)
  assert.equal(page.data.profileDraft, null)
})

test('growth records share the canonical source and writes strip read-only fields', async () => {
  auth = { user: { id: 'student-a', role: 'student' }, businessIdentity: null }
  const page = makePage()
  page.profileOwner = 'student-a::'
  page.data.canEditProfile = true
  page.data.expandedDimension = 'research'
  growthRecords = [{ id: 'existing', type: 'research', title: '旧科研', standardExpression: '旧科研', source: { type: 'manual' }, updatedAt: 'now' }]
  await page.loadGrowthRecords()
  assert.equal(page.data.dimensionRecords[0].title, '旧科研')
  page.onNewGrowthRecord()
  page.data.growthDraft.title = '新科研'
  page.data.growthDraft.id = 'server-owned'
  page.data.growthDraft.source = { type: 'assessment' }
  await page.onSaveGrowth()
  assert.deepEqual(Object.keys(growthWrite).sort(), ['description', 'endDate', 'organization', 'result', 'role', 'startDate', 'title', 'type'])
  assert.equal(page.data.dimensionRecords.length, 2)
  page.onEditGrowthRecord({ currentTarget: { dataset: { id: 'record-1' } } })
  page.data.growthDraft.result = '已获成果'
  await page.onSaveGrowth()
  assert.equal(page.data.dimensionRecords.find(item => item.id === 'record-1').result, '已获成果')
  readOnly = true
  page.onNewGrowthRecord()
  assert.equal(page.data.growthDraft, null)
  readOnly = false
  page.data.growthDraft = { ...growthWrite, title: '未保存修改' }
  page.onHide()
  assert.equal(page.data.growthNeedsResume, true)
  auth = { user: { id: 'student-b', role: 'student' }, businessIdentity: null }
  page.initializePosition()
  assert.equal(page.data.growthDraft, null)
  assert.equal(page.detachedGrowthDrafts[0].owner, 'student-a::')
})
