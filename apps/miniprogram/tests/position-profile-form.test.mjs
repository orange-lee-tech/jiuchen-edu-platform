import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import Module from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const filename = path.resolve(import.meta.dirname, '../miniprogram/utils/position-profile-form.ts')
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const loaded = new Module(filename)
loaded.filename = filename
loaded.paths = Module._nodeModulePaths(path.dirname(filename))
loaded._compile(compiled, filename)
const { positionProfileForm, positionProfilePatch, positionProfileDirty, positionProfileError } = loaded.exports

test('position profile patch sends only five visible fields and preserves the hidden enrollment year', () => {
  const existing = { university: '旧学校', major: null, currentGrade: null, enrollmentYear: 2023, gpaText: null, rankText: null }
  const form = positionProfileForm(existing)
  form.university = ' 新学校 '
  form.gpaText = ' 3.7 '
  assert.deepEqual(positionProfilePatch(form), { university: '新学校', major: null, currentGrade: null, gpaText: '3.7', rankText: null })
  assert.equal(Object.hasOwn(positionProfilePatch(form), 'enrollmentYear'), false)
  assert.equal(positionProfileError(form), '')
})

test('empty and partly filled forms preserve nullable fields and detect meaningful edits', () => {
  const saved = positionProfileForm({ university: null, major: null, currentGrade: null, enrollmentYear: null, gpaText: null, rankText: null })
  assert.equal(positionProfileDirty({ ...saved, university: '   ' }, saved), false)
  assert.equal(positionProfileDirty({ ...saved, major: '数学' }, saved), true)
  assert.deepEqual(positionProfilePatch({ ...saved, major: '数学' }), { university: null, major: '数学', currentGrade: null, gpaText: null, rankText: null })
  assert.match(positionProfileError({ ...saved, rankText: 'x'.repeat(81) }), /过长/)
})
