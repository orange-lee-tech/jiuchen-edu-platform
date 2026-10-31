// Real page/request modules with a bounded synthetic wx transport.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../../apps/miniprogram/node_modules/typescript')
const root = path.resolve(__dirname, '../../apps/miniprogram/miniprogram')
const settle = () => new Promise(resolve => setImmediate(resolve))
const postId = '00000000-0000-4000-8000-000000000101'
const post = tags => ({ id: postId, title: '合成资讯', globalTags: ['平台'], teacherTags: tags, updatedAt: null })
function harness() {
  const storage = new Map(), cache = new Map(), requests = [], scrolls = []
  let definition
  const wx = {
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key),
    request: options => requests.push(options), pageScrollTo: options => scrolls.push(options),
  }
  function load(relative) {
    const filename = path.resolve(root, relative.endsWith('.ts') ? relative : relative + '.ts')
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }; cache.set(filename, module)
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText
    const requireLocal = target => target.includes('config/runtime') ? { runtimeConfig: { apiTransport: 'http', apiBaseUrl: 'https://test.invalid' } }
      : load(path.relative(root, path.resolve(path.dirname(filename), target)))
    vm.runInNewContext(source, { module, exports: module.exports, require: requireLocal, wx, console,
      Page: value => { definition = value }, getCurrentPages: () => [], Date, Promise, Set, Map, setTimeout, clearTimeout }, { filename })
    return module.exports
  }
  const auth = load('utils/auth'), readOnly = load('utils/read-only-context')
  load('pages/teacher-news-tags/teacher-news-tags')
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(value) { Object.assign(this.data, value) } }
  function login(role = 'teacher', userId = 'teacher-one', token = 'synthetic-' + userId) {
    auth.saveAuthResult({ ok: true, user: { id: userId, role, displayName: '合成账号' }, businessIdentity: null,
      agreement: { type: 'user_terms', version: 'fixture', accepted: true }, session: { token, expiresAt: '2099-01-01T00:00:00Z' } })
  }
  return { page, requests, scrolls, login, load, readOnly,
    respond(index, data, statusCode = 200) { requests[index].success({ statusCode, data }) } }
}

test('teacher labels save through the real scoped PUT and reread after save; clearing affects only own labels', async () => {
  const h = harness(); h.login(); h.page.onShow(); await settle()
  assert.match(h.requests[0].url, /\/me\/teacher\/news$/)
  h.respond(0, { ok: true, posts: [post(['旧标签'])] }); await settle()
  h.page.onSelect({ currentTarget: { dataset: { id: postId } } })
  assert.equal(h.page.data.draftTags, '旧标签')
  assert.equal(h.scrolls.at(-1).scrollTop, 0)
  h.page.onTagsInput({ detail: { value: ' 英语、竞赛，英语 ' } })
  const save = h.page.onSave(); await settle()
  assert.match(h.requests[1].url, new RegExp('/me/teacher/news/' + postId + '/tags$'))
  assert.equal(h.requests[1].method, 'PUT')
  assert.deepEqual(JSON.parse(JSON.stringify(h.requests[1].data)), { tags: ['英语', '竞赛'] })
  h.respond(1, { ok: true, teacherTags: ['英语', '竞赛'] }); await settle()
  h.respond(2, { ok: true, posts: [post(['英语', '竞赛'])] }); await save
  assert.equal(h.page.data.posts[0].teacherNote, '英语、竞赛')
  assert.equal(h.page.data.posts[0].globalNote, '平台')
  h.page.onSelect({ currentTarget: { dataset: { id: postId } } })
  h.page.onTagsInput({ detail: { value: '' } })
  const clear = h.page.onSave(); await settle()
  assert.deepEqual(JSON.parse(JSON.stringify(h.requests[3].data)), { tags: [] })
  h.respond(3, { ok: true, teacherTags: [] }); await settle()
  h.respond(4, { ok: true, posts: [post([])] }); await clear
  assert.equal(h.page.data.posts[0].globalNote, '平台')
  assert.match(h.page.data.notice, /移除本人标签/)
})

test('teacher page denies students and borrowed read-only views and ignores a previous account response', async () => {
  const h = harness(); h.login(); h.page.onShow(); await settle()
  h.page.onHide(); h.login('student', 'student-one'); h.page.onShow()
  h.respond(0, { ok: true, posts: [post(['前账号标签'])] }); await settle()
  assert.equal(h.page.data.allowed, false)
  assert.equal(h.page.data.posts.length, 0)
  assert.equal(h.requests.length, 1)
  h.login('teacher', 'teacher-two')
  h.readOnly.setReadOnlyContext({ kind: 'teacher', id: postId, role: 'teacher', name: '合成', businessId: 'synthetic',
    operatorUserId: 'admin', readToken: 'ro.synthetic', expiresAt: '2099-01-01T00:00:00Z' })
  h.page.onShow()
  assert.equal(h.page.data.allowed, false)
  assert.equal(h.requests.length, 1)
})

test('tag page distinguishes API failures from empty data and retains the draft for retry', async () => {
  const h = harness(); h.login(); h.page.onShow(); await settle()
  h.respond(0, { code: 'teacher_news_tags_schema_missing' }, 503); await settle()
  assert.match(h.page.data.error, /503\/teacher_news_tags_schema_missing/)
  const reload = h.page.loadPosts(); await settle()
  h.respond(1, { ok: true, posts: [post([])] }); await reload
  assert.equal(h.page.data.error, '')
  h.page.onSelect({ currentTarget: { dataset: { id: postId } } })
  h.page.onTagsInput({ detail: { value: '需要重试' } })
  const save = h.page.onSave(); await settle()
  h.respond(2, { error: 'teacher_news_tags_forbidden' }, 403); await save
  assert.match(h.page.data.error, /403\/teacher_news_tags_forbidden/)
  assert.equal(h.page.data.draftTags, '需要重试')
  assert.equal(h.page.data.notice, '')
})

test('tag scope explanation separates platform and teacher classification from the article source', () => {
  const h = harness(), util = h.load('utils/teacher-news-tags')
  const note = util.newsTagScopeNote({ tags: ['平台', '导师'], globalTags: ['平台'], teacherTags: [{ teacherId: 'one', teacherName: '合成', tags: ['导师'] }] })
  assert.equal(note, '平台分类：平台；合成老师分类：导师')
  assert.doesNotMatch(note, /原始标签|公众号标签/)
})
